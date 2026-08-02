import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { db } from "@/db";
import { auditEvents, generalLedgerAccounts, generalLedgerJournals, generalLedgerLines } from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { generalLedgerAccountCodeForLeg, isBalancedGeneralLedger, validateManualJournalInput } from "@/modules/domain/general-ledger-policy";
import { minorUnitsToMoney, moneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { assertPostingDateOpen } from "./accounting-periods";
import { BankingError } from "./errors";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "./workflow";

type GeneralLedgerTx = Pick<Database, "execute" | "insert" | "select" | "update">;

type SourceLeg = { id: string; leg_type: "ACCOUNT" | "CLEARING"; direction: "DEBIT" | "CREDIT"; amount: string };

function totals(lines: Array<{ direction: "DEBIT" | "CREDIT"; amount: string }>) {
  const debit = lines.filter((line) => line.direction === "DEBIT").reduce((sum, line) => sum + moneyToMinorUnits(line.amount), 0n);
  const credit = lines.filter((line) => line.direction === "CREDIT").reduce((sum, line) => sum + moneyToMinorUnits(line.amount), 0n);
  return { debit: minorUnitsToMoney(debit), credit: minorUnitsToMoney(credit) };
}

export async function postSubledgerToGeneralLedger(tx: GeneralLedgerTx, ledgerTransactionId: string): Promise<string> {
  const existing = await tx.execute(sql`select reference from general_ledger_journals where source_ledger_transaction_id = ${ledgerTransactionId}`);
  if (existing.rows[0]) return String((existing.rows[0] as { reference: string }).reference);

  const transactionResult = await tx.execute(sql`
    select id, reference, value_date, type, currency, description, booked_at
    from ledger_transactions where id = ${ledgerTransactionId} for share
  `);
  const transaction = (transactionResult.rows as unknown as Array<{ id: string; reference: string; value_date: string; type: string; currency: string; description: string; booked_at: Date | string }>)[0];
  if (!transaction) throw new BankingError("LEDGER_TRANSACTION_NOT_FOUND", "The source ledger transaction was not found.");
  const legResult = await tx.execute(sql`
    select id::text, 'ACCOUNT'::text as leg_type, direction::text, amount::text from ledger_entries where transaction_id = ${ledgerTransactionId}
    union all
    select id::text, 'CLEARING'::text as leg_type, direction::text, amount::text from clearing_entries where transaction_id = ${ledgerTransactionId}
    order by leg_type, id
  `);
  const legs = legResult.rows as unknown as SourceLeg[];
  if (legs.length < 2 || !isBalancedGeneralLedger(legs)) throw new BankingError("SUBLEDGER_UNBALANCED", "The source transaction does not contain balanced ledger legs.");

  const codes = legs.map((leg) => generalLedgerAccountCodeForLeg({ transactionType: transaction.type, legType: leg.leg_type, currency: transaction.currency }));
  const accounts = await tx.select({ id: generalLedgerAccounts.id, code: generalLedgerAccounts.code, active: generalLedgerAccounts.active, postingAllowed: generalLedgerAccounts.postingAllowed })
    .from(generalLedgerAccounts).where(inArray(generalLedgerAccounts.code, [...new Set(codes)]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  if (codes.some((code) => !accountByCode.get(code)?.active || !accountByCode.get(code)?.postingAllowed)) {
    throw new BankingError("GENERAL_LEDGER_ACCOUNT_UNAVAILABLE", "A required general-ledger control account is unavailable.");
  }
  const amountTotals = totals(legs);
  const [journal] = await tx.insert(generalLedgerJournals).values({
    reference: `GL-${transaction.reference}`, source: "SUBLEDGER", sourceLedgerTransactionId: transaction.id,
    valueDate: transaction.value_date, status: "POSTED", currency: transaction.currency, description: transaction.description,
    totalDebit: amountTotals.debit, totalCredit: amountTotals.credit, postedAt: transaction.booked_at instanceof Date ? transaction.booked_at : new Date(transaction.booked_at),
  }).returning();
  await tx.insert(generalLedgerLines).values(legs.map((leg, index) => ({
    journalId: journal.id, accountId: accountByCode.get(codes[index])!.id, lineNumber: index + 1,
    direction: leg.direction, amount: leg.amount, narrative: `${transaction.reference} · ${transaction.description}`,
  })));
  return journal.reference;
}

export async function createManualGeneralLedgerJournal(input: {
  valueDate: string; currency: string; debitAccountCode: string; creditAccountCode: string; amount: string;
  description: string; comment: string; idempotencyKey: string;
}, actor: SessionUser) {
  const policy = validateManualJournalInput(input);
  if (!policy.ok) {
    const messages: Record<string, string> = {
      INVALID_DATE: "Enter a valid journal value date.", INVALID_CURRENCY: "Enter a three-letter currency code.",
      SAME_GL_ACCOUNT: "Debit and credit accounts must be different.", INVALID_AMOUNT: "Enter a positive amount with no more than two decimal places.",
      INVALID_DESCRIPTION: "Enter a description between 5 and 200 characters.", COMMENT_REQUIRED: "Enter submission evidence between 10 and 500 characters.",
    };
    throw new BankingError(policy.code, messages[policy.code]);
  }
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.trim().length > 100) throw new BankingError("IDEMPOTENCY_KEY_REQUIRED", "Provide an idempotency key between 8 and 100 characters.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(738_204_041)`);
    const [existing] = await tx.select({ reference: generalLedgerJournals.reference }).from(generalLedgerJournals).where(eq(generalLedgerJournals.idempotencyKey, input.idempotencyKey.trim())).limit(1);
    if (existing) return { reference: existing.reference, workItemReference: null, duplicate: true };
    await assertPostingDateOpen(tx, input.valueDate);
    const accountResult = await tx.execute(sql`
      select id, code, currency, active, posting_allowed from general_ledger_accounts
      where code in (${input.debitAccountCode}, ${input.creditAccountCode}) for share
    `);
    const accounts = accountResult.rows as unknown as Array<{ id: string; code: string; currency: string; active: boolean; posting_allowed: boolean }>;
    const debitAccount = accounts.find((account) => account.code === input.debitAccountCode);
    const creditAccount = accounts.find((account) => account.code === input.creditAccountCode);
    if (!debitAccount || !creditAccount) throw new BankingError("GENERAL_LEDGER_ACCOUNT_NOT_FOUND", "One or more general-ledger accounts were not found.");
    if (accounts.some((account) => !account.active || !account.posting_allowed)) throw new BankingError("GENERAL_LEDGER_ACCOUNT_UNAVAILABLE", "One or more general-ledger accounts do not accept postings.");
    if (accounts.some((account) => account.currency !== input.currency)) throw new BankingError("GENERAL_LEDGER_CURRENCY_MISMATCH", "Journal currency must match both general-ledger accounts.");
    const sequence = await tx.execute(sql`select coalesce(max(substring(reference from 5)::int), 0)::int + 1 as next from general_ledger_journals where reference ~ '^GLJ-[0-9]+$'`);
    const next = Number((sequence.rows as Array<{ next: number }>)[0]?.next ?? 1);
    const reference = `GLJ-${next.toString().padStart(6, "0")}`;
    const now = new Date();
    const [journal] = await tx.insert(generalLedgerJournals).values({
      reference, source: "MANUAL", idempotencyKey: input.idempotencyKey.trim(), valueDate: input.valueDate,
      status: "PENDING_APPROVAL", currency: input.currency, description: policy.description,
      totalDebit: policy.amount, totalCredit: policy.amount, createdBy: actor.id,
      submittedComment: policy.comment, submittedAt: now,
    }).returning();
    await tx.insert(generalLedgerLines).values([
      { journalId: journal.id, accountId: debitAccount.id, lineNumber: 1, direction: "DEBIT", amount: policy.amount, narrative: policy.description },
      { journalId: journal.id, accountId: creditAccount.id, lineNumber: 2, direction: "CREDIT", amount: policy.amount, narrative: policy.description },
    ]);
    const workItem = await createApprovalWorkItem(tx, {
      type: "GENERAL_LEDGER_JOURNAL", priority: "HIGH", entityType: "GENERAL_LEDGER_JOURNAL", entityReference: reference,
      title: `Approve manual journal ${reference}`, description: policy.comment, requiredRole: "ADMIN", dueAt: new Date(Date.now() + 24 * 60 * 60_000),
    }, actor);
    await tx.insert(auditEvents).values({
      actorUserId: actor.id, actorUsername: actor.username, action: "GENERAL_LEDGER_JOURNAL_SUBMITTED", entityType: "GENERAL_LEDGER_JOURNAL",
      entityReference: reference, correlationId: input.idempotencyKey.trim(), before: null,
      after: { status: "PENDING_APPROVAL", valueDate: input.valueDate, currency: input.currency, amount: policy.amount, debitAccount: debitAccount.code, creditAccount: creditAccount.code, workItemReference: workItem.reference },
    });
    return { reference, workItemReference: workItem.reference, duplicate: false };
  });
}

export async function decideManualGeneralLedgerJournal(input: {
  journalReference: string; workItemReference: string; expectedVersion: number; decision: "APPROVE" | "REJECT"; comment: string;
}, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const item = await lockApprovalWorkItem(tx, { reference: input.workItemReference, entityType: "GENERAL_LEDGER_JOURNAL", entityReference: input.journalReference, expectedVersion: input.expectedVersion }, actor);
    const journalResult = await tx.execute(sql`select id, reference, status, value_date, currency, version from general_ledger_journals where reference = ${input.journalReference} for update`);
    const journal = (journalResult.rows as unknown as Array<{ id: string; reference: string; status: string; value_date: string; currency: string; version: number }>)[0];
    if (!journal) throw new BankingError("GENERAL_LEDGER_JOURNAL_NOT_FOUND", "The general-ledger journal was not found.");
    if (journal.status !== "PENDING_APPROVAL") throw new BankingError("GENERAL_LEDGER_JOURNAL_NOT_PENDING", "The journal is no longer pending approval.");
    const comment = input.comment.trim();
    if (comment.length < 10 || comment.length > 500) throw new BankingError("COMMENT_REQUIRED", "Enter decision evidence between 10 and 500 characters.");
    const now = new Date();
    if (input.decision === "REJECT") {
      await tx.update(generalLedgerJournals).set({ status: "REJECTED", decidedBy: actor.id, decisionComment: comment, decidedAt: now, version: journal.version + 1, updatedAt: now }).where(eq(generalLedgerJournals.id, journal.id));
      await decideWorkItem(tx, item, "REJECTED", comment, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "GENERAL_LEDGER_JOURNAL_REJECTED", entityType: "GENERAL_LEDGER_JOURNAL", entityReference: journal.reference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" }, after: { status: "REJECTED", comment } });
      return journal.reference;
    }
    await assertPostingDateOpen(tx, journal.value_date);
    const lineResult = await tx.execute(sql`
      select line.direction::text, line.amount::text, account.currency, account.active, account.posting_allowed
      from general_ledger_lines line join general_ledger_accounts account on account.id = line.account_id
      where line.journal_id = ${journal.id} order by line.line_number for share of account
    `);
    const lines = lineResult.rows as unknown as Array<{ direction: "DEBIT" | "CREDIT"; amount: string; currency: string; active: boolean; posting_allowed: boolean }>;
    if (lines.length !== 2) throw new BankingError("GENERAL_LEDGER_LINES_INVALID", "A manual journal must retain exactly two accounting lines.");
    if (lines.some((line) => !line.active || !line.posting_allowed)) throw new BankingError("GENERAL_LEDGER_ACCOUNT_UNAVAILABLE", "A journal account no longer accepts postings.");
    if (lines.some((line) => line.currency !== journal.currency)) throw new BankingError("GENERAL_LEDGER_CURRENCY_MISMATCH", "Journal currency must still match both general-ledger accounts.");
    if (!isBalancedGeneralLedger(lines)) throw new BankingError("GENERAL_LEDGER_UNBALANCED", "The journal debit and credit totals do not balance.");
    const amountTotals = totals(lines);
    await tx.update(generalLedgerJournals).set({ status: "POSTED", totalDebit: amountTotals.debit, totalCredit: amountTotals.credit, decidedBy: actor.id, decisionComment: comment, decidedAt: now, postedAt: now, version: journal.version + 1, updatedAt: now }).where(eq(generalLedgerJournals.id, journal.id));
    await decideWorkItem(tx, item, "APPROVED", comment, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "GENERAL_LEDGER_JOURNAL_POSTED", entityType: "GENERAL_LEDGER_JOURNAL", entityReference: journal.reference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" }, after: { status: "POSTED", comment, valueDate: journal.value_date, totalDebit: amountTotals.debit, totalCredit: amountTotals.credit } });
    return journal.reference;
  });
}
