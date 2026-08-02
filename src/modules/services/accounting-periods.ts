import "server-only";

import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { db } from "@/db";
import { accountingPeriods, auditEvents } from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { BankingError } from "./errors";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "./workflow";

type PostingTx = Pick<Database, "execute">;

export async function assertPostingDateOpen(tx: PostingTx, valueDate: string) {
  const result = await tx.execute(sql`select reference, status from accounting_periods where ${valueDate} between start_date and end_date order by start_date desc limit 1 for share`);
  const period = (result.rows as unknown as Array<{ reference: string; status: string }>)[0];
  if (!period) throw new BankingError("ACCOUNTING_PERIOD_UNAVAILABLE", "No accounting period is configured for the posting date.");
  if (period.status !== "OPEN") throw new BankingError("ACCOUNTING_PERIOD_CLOSED", `Accounting period ${period.reference} does not accept postings.`);
  return period.reference;
}

type LockedPeriod = { id: string; reference: string; code: string; start_date: string; end_date: string; status: "OPEN" | "CLOSING" | "CLOSED"; version: number };

async function lockPeriod(tx: Pick<Database, "execute">, reference: string): Promise<LockedPeriod> {
  const result = await tx.execute(sql`select id, reference, code, start_date, end_date, status, version from accounting_periods where reference = ${reference} for update`);
  const period = (result.rows as unknown as LockedPeriod[])[0];
  if (!period) throw new BankingError("ACCOUNTING_PERIOD_NOT_FOUND", "The accounting period was not found.");
  return period;
}

async function assertCloseGates(tx: Pick<Database, "execute">, period: LockedPeriod) {
  const result = await tx.execute(sql`
    with legs as (
      select e.transaction_id, case when e.direction = 'CREDIT' then e.amount else -e.amount end as signed
      from ledger_entries e join ledger_transactions t on t.id = e.transaction_id where t.value_date between ${period.start_date} and ${period.end_date}
      union all
      select e.transaction_id, case when e.direction = 'CREDIT' then e.amount else -e.amount end as signed
      from clearing_entries e join ledger_transactions t on t.id = e.transaction_id where t.value_date between ${period.start_date} and ${period.end_date}
    )
    select
      (select count(*)::int from end_of_day_runs r join processing_runs p on p.id = r.processing_run_id where r.business_date = ${period.end_date} and p.status = 'COMPLETED') as completed_eod,
      (select count(*)::int from reconciliation_runs r join processing_runs p on p.id = r.processing_run_id where r.business_date = ${period.end_date} and p.status = 'COMPLETED') as completed_reconciliation,
      (select count(*)::int from reconciliation_runs r
        join processing_runs reconciliation_process on reconciliation_process.id = r.processing_run_id
        where r.business_date = ${period.end_date} and reconciliation_process.status = 'COMPLETED'
          and exists (
            select 1 from end_of_day_runs eod
            join processing_runs eod_process on eod_process.id = eod.processing_run_id
            where eod.business_date = ${period.end_date} and eod_process.status = 'COMPLETED'
              and reconciliation_process.started_at >= eod_process.completed_at
          )) as reconciliation_after_eod,
      (select count(*)::int from reconciliation_items i join reconciliation_runs r on r.id = i.reconciliation_run_id where r.business_date = ${period.end_date} and i.status = 'OPEN') as open_exceptions,
      (select count(*)::int from clearing_entries entry
        join ledger_transactions transaction on transaction.id = entry.transaction_id
        where transaction.value_date = ${period.end_date}
          and not exists (
            select 1 from reconciliation_items item
            join reconciliation_runs run on run.id = item.reconciliation_run_id
            where run.business_date = ${period.end_date} and item.clearing_entry_id = entry.id
          )) as unreconciled_clearing_entries,
      (select count(*)::int from processing_runs where business_date between ${period.start_date} and ${period.end_date} and status = 'RUNNING') as running_processes,
      (select count(*)::int from (select transaction_id from legs group by transaction_id having sum(signed) <> 0) u) as unbalanced
  `);
  const gates = result.rows[0] as unknown as Record<string, number>;
  if (Number(gates.completed_eod) !== 1) throw new BankingError("END_OF_DAY_INCOMPLETE", "A completed end-of-day run is required for the period end date.");
  if (Number(gates.completed_reconciliation) !== 1) throw new BankingError("RECONCILIATION_INCOMPLETE", "A completed clearing reconciliation is required for the period end date.");
  if (Number(gates.reconciliation_after_eod) !== 1) throw new BankingError("RECONCILIATION_STALE", "Run clearing reconciliation after the completed period-end process.");
  if (Number(gates.open_exceptions) !== 0) throw new BankingError("RECONCILIATION_EXCEPTIONS_OPEN", "Resolve all reconciliation exceptions before requesting close.");
  if (Number(gates.unreconciled_clearing_entries) !== 0) throw new BankingError("CLEARING_ENTRIES_UNRECONCILED", "Reconcile every period-end clearing entry before requesting close.");
  if (Number(gates.running_processes) !== 0) throw new BankingError("PROCESSING_STILL_RUNNING", "A processing run is still active in the period.");
  if (Number(gates.unbalanced) !== 0) throw new BankingError("LEDGER_UNBALANCED", "The period contains an unbalanced ledger transaction.");
}

export async function requestAccountingPeriodClose(input: { periodReference: string; expectedVersion: number; comment: string }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const period = await lockPeriod(tx, input.periodReference);
    if (period.status !== "OPEN") throw new BankingError("PERIOD_NOT_OPEN", "Only an open accounting period can enter close review.");
    if (period.version !== input.expectedVersion) throw new BankingError("STALE_VERSION", "The accounting period changed. Refresh and try again.");
    const comment = input.comment.trim();
    if (comment.length < 10) throw new BankingError("COMMENT_REQUIRED", "Enter a close request comment of at least ten characters.");
    await assertCloseGates(tx, period);
    const now = new Date();
    await tx.update(accountingPeriods).set({ status: "CLOSING", closeRequestedBy: actor.id, closeRequestComment: comment, closeRequestedAt: now, version: period.version + 1, updatedAt: now }).where(eq(accountingPeriods.id, period.id));
    const workItem = await createApprovalWorkItem(tx, { type: "ACCOUNTING_PERIOD_CLOSE", priority: "HIGH", entityType: "ACCOUNTING_PERIOD", entityReference: period.reference, title: `Close accounting period ${period.code}`, description: comment, requiredRole: "ADMIN", dueAt: new Date(Date.now() + 24 * 60 * 60_000) }, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "ACCOUNTING_PERIOD_CLOSE_REQUESTED", entityType: "ACCOUNTING_PERIOD", entityReference: period.reference, correlationId: crypto.randomUUID(), before: { status: period.status, version: period.version }, after: { status: "CLOSING", version: period.version + 1, comment, workItemReference: workItem.reference } });
    return workItem.reference;
  });
}

export async function decideAccountingPeriodClose(input: { periodReference: string; workItemReference: string; expectedVersion: number; comment: string; decision: "APPROVE" | "REJECT" }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const item = await lockApprovalWorkItem(tx, { reference: input.workItemReference, entityType: "ACCOUNTING_PERIOD", entityReference: input.periodReference, expectedVersion: input.expectedVersion }, actor);
    const period = await lockPeriod(tx, input.periodReference);
    if (period.status !== "CLOSING") throw new BankingError("PERIOD_NOT_CLOSING", "The accounting period is no longer awaiting a close decision.");
    const comment = input.comment.trim();
    if (comment.length < 10) throw new BankingError("COMMENT_REQUIRED", "Enter a close decision comment of at least ten characters.");
    const now = new Date();
    if (input.decision === "REJECT") {
      await tx.update(accountingPeriods).set({ status: "OPEN", closeDecisionComment: comment, version: period.version + 1, updatedAt: now }).where(eq(accountingPeriods.id, period.id));
      await decideWorkItem(tx, item, "REJECTED", comment, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "ACCOUNTING_PERIOD_CLOSE_REJECTED", entityType: "ACCOUNTING_PERIOD", entityReference: period.reference, correlationId: crypto.randomUUID(), before: { status: "CLOSING" }, after: { status: "OPEN", comment } });
      return period.reference;
    }
    await assertCloseGates(tx, period);
    await tx.update(accountingPeriods).set({ status: "CLOSED", closedBy: actor.id, closeDecisionComment: comment, closedAt: now, version: period.version + 1, updatedAt: now }).where(eq(accountingPeriods.id, period.id));
    await decideWorkItem(tx, item, "APPROVED", comment, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "ACCOUNTING_PERIOD_CLOSED", entityType: "ACCOUNTING_PERIOD", entityReference: period.reference, correlationId: crypto.randomUUID(), before: { status: "CLOSING" }, after: { status: "CLOSED", comment, endDate: period.end_date } });
    return period.reference;
  });
}
