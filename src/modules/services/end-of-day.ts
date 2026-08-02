import "server-only";

import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, bankAccounts, clearingAccounts, clearingEntries, endOfDayPostings, endOfDayRuns,
  ledgerEntries, ledgerTransactions, processingRuns, productChargeRules, products,
} from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { calculateDailyInterest, validateDailyOverdraftCharge, validateEndOfDayDate } from "@/modules/domain/end-of-day-policy";
import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { BankingError } from "./errors";

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

type Candidate = {
  accountId: string;
  accountNumber: string;
  productId: string;
  kind: string;
  currency: string;
  balance: string;
  availableBalance: string;
  status: string;
  readOnly: boolean;
  annualRate: string;
  chargeRuleId: string | null;
  chargeRuleReference: string | null;
  chargeAmount: string | null;
};

async function existingSummary(runId: string) {
  const rows = await db.select({ type: endOfDayPostings.type, status: endOfDayPostings.status }).from(endOfDayPostings).where(eq(endOfDayPostings.endOfDayRunId, runId));
  return {
    attempted: rows.length,
    booked: rows.filter((row) => row.status === "BOOKED").length,
    failed: rows.filter((row) => row.status === "FAILED").length,
    charges: rows.filter((row) => row.type === "CHARGE" && row.status === "BOOKED").length,
    interests: rows.filter((row) => row.type === "INTEREST" && row.status === "BOOKED").length,
  };
}

async function recordFailure(input: { runId: string; candidate: Candidate; businessDate: string; type: "CHARGE" | "INTEREST"; amount: string; idempotencyKey: string; error: unknown }) {
  const code = input.error instanceof BankingError ? input.error.code : "POSTING_FAILED";
  const failureMessage = input.error instanceof Error ? input.error.message : "The end-of-day posting failed.";
  await db.insert(endOfDayPostings).values({
    reference: reference("EOP"), endOfDayRunId: input.runId, accountId: input.candidate.accountId, businessDate: input.businessDate,
    type: input.type, status: "FAILED", amount: input.amount, currency: input.candidate.currency,
    annualRate: input.type === "INTEREST" ? input.candidate.annualRate : null,
    chargeRuleId: input.type === "CHARGE" ? input.candidate.chargeRuleId : null,
    idempotencyKey: input.idempotencyKey, failureCode: code, failureMessage, completedAt: new Date(),
  }).onConflictDoNothing();
  return { status: "FAILED" as const, type: input.type };
}

async function postCharge(input: { runId: string; candidate: Candidate; businessDate: string }, actor: SessionUser) {
  const idempotencyKey = `end-of-day:${input.businessDate}:${input.candidate.accountId}:CHARGE`;
  const plannedAmount = input.candidate.chargeAmount ?? "0.00";
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const [existing] = await tx.select().from(endOfDayPostings).where(eq(endOfDayPostings.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) return { status: existing.status, type: existing.type };
      const accountResult = await tx.execute(sql`select id, account_number, product_id, currency, balance, available_balance, status, read_only from bank_accounts where id = ${input.candidate.accountId} for update`);
      const account = (accountResult.rows as unknown as Array<{ id: string; account_number: string; product_id: string; currency: string; balance: string; available_balance: string; status: string; read_only: boolean }>)[0];
      const [rule] = await tx.select().from(productChargeRules).where(and(
        eq(productChargeRules.id, input.candidate.chargeRuleId ?? "00000000-0000-0000-0000-000000000000"),
        eq(productChargeRules.productId, account?.product_id ?? "00000000-0000-0000-0000-000000000000"),
        eq(productChargeRules.active, true),
      )).limit(1);
      if (!account || !rule || rule.currency !== account.currency || rule.effectiveFrom > input.businessDate || (rule.effectiveTo && rule.effectiveTo < input.businessDate)) throw new BankingError("CHARGE_RULE_UNAVAILABLE", "The applicable charge rule is unavailable.");
      const policy = validateDailyOverdraftCharge({ balance: account.balance, availableBalance: account.available_balance, amount: rule.amount, accountStatus: account.status, readOnly: account.read_only });
      if (!policy.ok) throw new BankingError(policy.code, policy.code === "INSUFFICIENT_AVAILABLE_BALANCE" ? "The account has insufficient available balance for the charge." : "The account is no longer eligible for the charge.");
      const clearingResult = await tx.execute(sql`select id, balance from clearing_accounts where currency = ${account.currency} order by code limit 1 for update`);
      const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
      if (!clearing) throw new BankingError("CLEARING_UNAVAILABLE", "The currency clearing account is unavailable.");
      const amount = moneyToMinorUnits(rule.amount);
      const accountAfter = minorUnitsToMoney(signedMoneyToMinorUnits(account.balance) - amount);
      const availableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(account.available_balance) - amount);
      const clearingAfter = minorUnitsToMoney(signedMoneyToMinorUnits(clearing.balance) + amount);
      const now = new Date();
      const [transaction] = await tx.insert(ledgerTransactions).values({ reference: reference("EODC"), bookedAt: now, valueDate: input.businessDate, description: `Daily overdraft usage charge ${rule.reference}`, type: "ACCOUNT_CHARGE", status: "BOOKED", currency: account.currency, amount: rule.amount, counterparty: rule.reference }).returning();
      await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: account.id, direction: "DEBIT", amount: rule.amount, balanceAfter: accountAfter });
      await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "CREDIT", amount: rule.amount, balanceAfter: clearingAfter });
      await tx.update(bankAccounts).set({ balance: accountAfter, availableBalance: availableAfter, updatedAt: now }).where(eq(bankAccounts.id, account.id));
      await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: now }).where(eq(clearingAccounts.id, clearing.id));
      await tx.insert(endOfDayPostings).values({ reference: reference("EOP"), endOfDayRunId: input.runId, accountId: account.id, businessDate: input.businessDate, type: "CHARGE", status: "BOOKED", amount: rule.amount, currency: account.currency, chargeRuleId: rule.id, ledgerTransactionId: transaction.id, idempotencyKey, completedAt: now });
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "END_OF_DAY_CHARGE_BOOKED", entityType: "ACCOUNT", entityReference: account.account_number, correlationId: idempotencyKey, before: { balance: account.balance, availableBalance: account.available_balance }, after: { balance: accountAfter, availableBalance: availableAfter, amount: rule.amount, currency: account.currency, transactionReference: transaction.reference } });
      return { status: "BOOKED" as const, type: "CHARGE" as const };
    });
  } catch (error) {
    return recordFailure({ ...input, type: "CHARGE", amount: plannedAmount, idempotencyKey, error });
  }
}

async function postInterest(input: { runId: string; candidate: Candidate; businessDate: string }, actor: SessionUser) {
  const idempotencyKey = `end-of-day:${input.businessDate}:${input.candidate.accountId}:INTEREST`;
  const plannedAmount = calculateDailyInterest(input.candidate.balance, input.candidate.annualRate);
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const [existing] = await tx.select().from(endOfDayPostings).where(eq(endOfDayPostings.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) return { status: existing.status, type: existing.type };
      const result = await tx.execute(sql`select a.id, a.account_number, a.currency, a.balance, a.available_balance, a.status, a.read_only, p.kind, p.interest_rate, p.active from bank_accounts a join products p on p.id = a.product_id where a.id = ${input.candidate.accountId} for update of a, p`);
      const account = (result.rows as unknown as Array<{ id: string; account_number: string; currency: string; balance: string; available_balance: string; status: string; read_only: boolean; kind: string; interest_rate: string; active: boolean }>)[0];
      if (!account || account.status !== "ACTIVE" || account.read_only || !account.active || !["SAVINGS", "FOREIGN_CURRENCY", "TERM_DEPOSIT"].includes(account.kind)) throw new BankingError("INTEREST_INELIGIBLE", "The account is no longer eligible for deposit interest.");
      const amountText = calculateDailyInterest(account.balance, account.interest_rate);
      const amount = moneyToMinorUnits(amountText);
      if (amount <= 0n) throw new BankingError("NO_INTEREST_DUE", "No daily interest is due for this account.");
      const clearingResult = await tx.execute(sql`select id, balance from clearing_accounts where currency = ${account.currency} order by code limit 1 for update`);
      const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
      if (!clearing) throw new BankingError("CLEARING_UNAVAILABLE", "The currency clearing account is unavailable.");
      const accountAfter = minorUnitsToMoney(signedMoneyToMinorUnits(account.balance) + amount);
      const availableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(account.available_balance) + amount);
      const clearingAfter = minorUnitsToMoney(signedMoneyToMinorUnits(clearing.balance) - amount);
      const now = new Date();
      const [transaction] = await tx.insert(ledgerTransactions).values({ reference: reference("EODI"), bookedAt: now, valueDate: input.businessDate, description: `Daily deposit interest at ${account.interest_rate}%`, type: "DEPOSIT_INTEREST", status: "BOOKED", currency: account.currency, amount: amountText, counterparty: "Interest expense clearing" }).returning();
      await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: account.id, direction: "CREDIT", amount: amountText, balanceAfter: accountAfter });
      await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "DEBIT", amount: amountText, balanceAfter: clearingAfter });
      await tx.update(bankAccounts).set({ balance: accountAfter, availableBalance: availableAfter, updatedAt: now }).where(eq(bankAccounts.id, account.id));
      await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: now }).where(eq(clearingAccounts.id, clearing.id));
      await tx.insert(endOfDayPostings).values({ reference: reference("EOP"), endOfDayRunId: input.runId, accountId: account.id, businessDate: input.businessDate, type: "INTEREST", status: "BOOKED", amount: amountText, currency: account.currency, annualRate: account.interest_rate, ledgerTransactionId: transaction.id, idempotencyKey, completedAt: now });
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "END_OF_DAY_INTEREST_POSTED", entityType: "ACCOUNT", entityReference: account.account_number, correlationId: idempotencyKey, before: { balance: account.balance, availableBalance: account.available_balance }, after: { balance: accountAfter, availableBalance: availableAfter, amount: amountText, annualRate: account.interest_rate, currency: account.currency, transactionReference: transaction.reference } });
      return { status: "BOOKED" as const, type: "INTEREST" as const };
    });
  } catch (error) {
    return recordFailure({ ...input, type: "INTEREST", amount: plannedAmount, idempotencyKey, error });
  }
}

export async function runEndOfDay(input: { businessDate: string; today?: string }, actor: SessionUser) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const policy = validateEndOfDayDate({ businessDate: input.businessDate, today });
  if (!policy.ok) throw new BankingError(policy.code, policy.code === "FUTURE_BUSINESS_DATE" ? "The end-of-day business date cannot be in the future." : "Enter a valid business date.");
  const claim = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`END_OF_DAY:${input.businessDate}`}))`);
    const [existing] = await tx.select({ run: endOfDayRuns, processing: processingRuns }).from(endOfDayRuns).innerJoin(processingRuns, eq(endOfDayRuns.processingRunId, processingRuns.id)).where(eq(endOfDayRuns.businessDate, input.businessDate)).limit(1);
    if (existing) return { ...existing, duplicate: true as const };
    const runReference = reference("EOD");
    const [processing] = await tx.insert(processingRuns).values({ reference: runReference, type: "END_OF_DAY", businessDate: input.businessDate, status: "RUNNING", requestedBy: actor.id }).returning();
    const [run] = await tx.insert(endOfDayRuns).values({ reference: runReference, processingRunId: processing.id, businessDate: input.businessDate }).returning();
    return { run, processing, duplicate: false as const };
  });
  if (claim.duplicate) return { reference: claim.run.reference, duplicate: true, ...await existingSummary(claim.run.id) };

  const outcomes: Array<{ status: string; type: string }> = [];
  try {
    const candidates = await db.select({
      accountId: bankAccounts.id, accountNumber: bankAccounts.accountNumber, productId: products.id, kind: products.kind,
      currency: bankAccounts.currency, balance: bankAccounts.balance, availableBalance: bankAccounts.availableBalance,
      status: bankAccounts.status, readOnly: bankAccounts.readOnly, annualRate: products.interestRate,
      chargeRuleId: productChargeRules.id, chargeRuleReference: productChargeRules.reference, chargeAmount: productChargeRules.amount,
    }).from(bankAccounts).innerJoin(products, eq(bankAccounts.productId, products.id))
      .leftJoin(productChargeRules, and(
        eq(productChargeRules.productId, products.id), eq(productChargeRules.active, true),
        lte(productChargeRules.effectiveFrom, input.businessDate),
        or(isNull(productChargeRules.effectiveTo), gte(productChargeRules.effectiveTo, input.businessDate)),
      ))
      .where(and(eq(bankAccounts.status, "ACTIVE"), eq(bankAccounts.readOnly, false), eq(products.active, true)))
      .orderBy(asc(bankAccounts.accountNumber));
    for (const candidate of candidates as Candidate[]) {
      if (signedMoneyToMinorUnits(candidate.balance) < 0n && candidate.chargeRuleId) outcomes.push(await postCharge({ runId: claim.run.id, candidate, businessDate: input.businessDate }, actor));
      else if (["SAVINGS", "FOREIGN_CURRENCY", "TERM_DEPOSIT"].includes(candidate.kind) && moneyToMinorUnits(calculateDailyInterest(candidate.balance, candidate.annualRate)) > 0n) outcomes.push(await postInterest({ runId: claim.run.id, candidate, businessDate: input.businessDate }, actor));
    }
    const attempted = outcomes.length;
    const booked = outcomes.filter((item) => item.status === "BOOKED").length;
    const failed = outcomes.filter((item) => item.status === "FAILED").length;
    const charges = outcomes.filter((item) => item.status === "BOOKED" && item.type === "CHARGE").length;
    const interests = outcomes.filter((item) => item.status === "BOOKED" && item.type === "INTEREST").length;
    const now = new Date();
    await db.update(processingRuns).set({ status: failed ? "FAILED" : "COMPLETED", attempted, booked, failed, completedAt: now, errorMessage: failed ? `${failed} posting(s) failed` : null }).where(eq(processingRuns.id, claim.processing.id));
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: failed ? "END_OF_DAY_COMPLETED_WITH_FAILURES" : "END_OF_DAY_COMPLETED", entityType: "PROCESSING_RUN", entityReference: claim.run.reference, correlationId: crypto.randomUUID(), before: null, after: { businessDate: input.businessDate, attempted, booked, failed, charges, interests } });
    return { reference: claim.run.reference, duplicate: false, attempted, booked, failed, charges, interests };
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "The end-of-day run failed.";
    await db.update(processingRuns).set({ status: "FAILED", attempted: outcomes.length, booked: outcomes.filter((item) => item.status === "BOOKED").length, failed: outcomes.filter((item) => item.status === "FAILED").length + 1, completedAt: new Date(), errorMessage: failureMessage }).where(eq(processingRuns.id, claim.processing.id));
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "END_OF_DAY_FAILED", entityType: "PROCESSING_RUN", entityReference: claim.run.reference, correlationId: crypto.randomUUID(), before: null, after: { businessDate: input.businessDate, failureMessage } });
    throw error;
  }
}
