import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, clearingAccounts, clearingEntries, ledgerTransactions, processingRuns, reconciliationItems, reconciliationRuns, settlementRecords,
} from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { classifyReconciliation, validateReconciliationDate, type ReconciliationSide } from "@/modules/domain/reconciliation-policy";
import { BankingError } from "./errors";

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function summarize(runId: string) {
  const rows = await db.select({ status: reconciliationItems.status }).from(reconciliationItems).where(eq(reconciliationItems.reconciliationRunId, runId));
  const matched = rows.filter((row) => row.status === "MATCHED").length;
  return { attempted: rows.length, matched, exceptions: rows.length - matched };
}

export async function runClearingReconciliation(input: { businessDate: string; today?: string }, actor: SessionUser) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const policy = validateReconciliationDate({ businessDate: input.businessDate, today });
  if (!policy.ok) throw new BankingError(policy.code, policy.code === "FUTURE_BUSINESS_DATE" ? "The reconciliation date cannot be in the future." : "Enter a valid business date.");

  const claim = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`RECONCILIATION:${input.businessDate}`}))`);
    const [existing] = await tx.select({ run: reconciliationRuns, processing: processingRuns }).from(reconciliationRuns)
      .innerJoin(processingRuns, eq(reconciliationRuns.processingRunId, processingRuns.id))
      .where(eq(reconciliationRuns.businessDate, input.businessDate)).limit(1);
    if (existing) return { ...existing, duplicate: true as const };
    const runReference = reference("REC");
    const [processing] = await tx.insert(processingRuns).values({ reference: runReference, type: "CLEARING_RECONCILIATION", businessDate: input.businessDate, status: "RUNNING", requestedBy: actor.id }).returning();
    const [run] = await tx.insert(reconciliationRuns).values({ reference: runReference, processingRunId: processing.id, businessDate: input.businessDate }).returning();
    return { run, processing, duplicate: false as const };
  });
  if (claim.duplicate) return { reference: claim.run.reference, duplicate: true, ...await summarize(claim.run.id) };

  try {
    const [internalRows, externalRows] = await Promise.all([
      db.select({ id: clearingEntries.id, transactionReference: ledgerTransactions.reference, direction: clearingEntries.direction, amount: clearingEntries.amount, currency: clearingAccounts.currency })
        .from(clearingEntries).innerJoin(ledgerTransactions, eq(clearingEntries.transactionId, ledgerTransactions.id))
        .innerJoin(clearingAccounts, eq(clearingEntries.clearingAccountId, clearingAccounts.id))
        .where(eq(ledgerTransactions.valueDate, input.businessDate)).orderBy(asc(ledgerTransactions.reference)),
      db.select().from(settlementRecords).where(eq(settlementRecords.businessDate, input.businessDate)).orderBy(asc(settlementRecords.transactionReference)),
    ]);
    const internalByReference = new Map(internalRows.map((row) => [row.transactionReference, row]));
    const consumed = new Set<string>();
    const values: Array<typeof reconciliationItems.$inferInsert> = [];
    for (const external of externalRows) {
      const internal = internalByReference.get(external.transactionReference) ?? null;
      if (internal) consumed.add(internal.id);
      const result = classifyReconciliation(internal as ReconciliationSide | null, external);
      values.push({
        reference: reference("RCI"), reconciliationRunId: claim.run.id, settlementRecordId: external.id, clearingEntryId: internal?.id ?? null,
        transactionReference: external.transactionReference, type: result.type, status: result.status,
        internalDirection: internal?.direction ?? null, externalDirection: external.direction,
        internalAmount: internal?.amount ?? null, externalAmount: external.amount,
        internalCurrency: internal?.currency ?? null, externalCurrency: external.currency,
      });
    }
    for (const internal of internalRows) {
      if (consumed.has(internal.id)) continue;
      const result = classifyReconciliation(internal, null);
      values.push({
        reference: reference("RCI"), reconciliationRunId: claim.run.id, clearingEntryId: internal.id,
        transactionReference: internal.transactionReference, type: result.type, status: result.status,
        internalDirection: internal.direction, internalAmount: internal.amount, internalCurrency: internal.currency,
      });
    }
    const matched = values.filter((item) => item.status === "MATCHED").length;
    const exceptions = values.length - matched;
    const now = new Date();
    await db.transaction(async (tx) => {
      if (values.length) await tx.insert(reconciliationItems).values(values);
      await tx.update(processingRuns).set({ status: "COMPLETED", attempted: values.length, booked: matched, failed: exceptions, completedAt: now }).where(eq(processingRuns.id, claim.processing.id));
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "CLEARING_RECONCILIATION_COMPLETED", entityType: "PROCESSING_RUN", entityReference: claim.run.reference, correlationId: crypto.randomUUID(), before: null, after: { businessDate: input.businessDate, attempted: values.length, matched, exceptions } });
    });
    return { reference: claim.run.reference, duplicate: false, attempted: values.length, matched, exceptions };
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "The reconciliation run failed.";
    await db.update(processingRuns).set({ status: "FAILED", failed: 1, completedAt: new Date(), errorMessage: failureMessage }).where(eq(processingRuns.id, claim.processing.id));
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "CLEARING_RECONCILIATION_FAILED", entityType: "PROCESSING_RUN", entityReference: claim.run.reference, correlationId: crypto.randomUUID(), before: null, after: { businessDate: input.businessDate, failureMessage } });
    throw error;
  }
}

export async function resolveReconciliationItem(input: { itemReference: string; runReference: string; expectedVersion: number; comment: string }, actor: SessionUser) {
  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`select i.id, i.status, i.version, i.transaction_reference from reconciliation_items i join reconciliation_runs r on r.id = i.reconciliation_run_id where i.reference = ${input.itemReference} and r.reference = ${input.runReference} for update of i`);
    const item = (result.rows as unknown as Array<{ id: string; status: string; version: number; transaction_reference: string }>)[0];
    if (!item) throw new BankingError("RECONCILIATION_ITEM_NOT_FOUND", "The reconciliation item was not found.");
    if (item.status !== "OPEN") throw new BankingError("RECONCILIATION_ITEM_NOT_OPEN", "Only an open reconciliation exception can be resolved.");
    if (item.version !== input.expectedVersion) throw new BankingError("STALE_VERSION", "The reconciliation item changed. Refresh and try again.");
    if (input.comment.trim().length < 10) throw new BankingError("COMMENT_REQUIRED", "Enter a resolution comment of at least 10 characters.");
    const now = new Date();
    await tx.update(reconciliationItems).set({ status: "RESOLVED", resolutionComment: input.comment.trim(), resolvedBy: actor.id, resolvedAt: now, version: item.version + 1 }).where(eq(reconciliationItems.id, item.id));
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "RECONCILIATION_EXCEPTION_RESOLVED", entityType: "RECONCILIATION_ITEM", entityReference: input.itemReference, correlationId: crypto.randomUUID(), before: { status: item.status, version: item.version }, after: { status: "RESOLVED", version: item.version + 1, comment: input.comment.trim(), transactionReference: item.transaction_reference } });
  });
}
