import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, bankAccounts, clearingAccounts, clearingEntries, ledgerEntries, ledgerTransactions,
  paymentReversals,
} from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { validateInternalReversalFunds, validateReversalRequest } from "@/modules/domain/payment-reversal-policy";
import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { BankingError } from "./errors";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "./workflow";

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function message(code: string): string {
  const messages: Record<string, string> = {
    PAYMENT_NOT_BOOKED: "Only a booked payment can be reversed.",
    PAYMENT_ALREADY_REVERSED: "A reversal already exists for this payment.",
    REVERSAL_REASON_REQUIRED: "Enter a reversal reason of at least ten characters.",
    DESTINATION_UNAVAILABLE: "The original destination account is not available for reversal.",
    REVERSAL_FUNDS_UNAVAILABLE: "The original destination account has insufficient available funds for reversal.",
  };
  return messages[code] ?? "The payment reversal could not be completed.";
}

export async function requestPaymentReversal(input: { paymentReference: string; reason: string; idempotencyKey: string }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [duplicate] = await tx.select().from(paymentReversals).where(eq(paymentReversals.idempotencyKey, input.idempotencyKey)).limit(1);
    if (duplicate) return { reference: duplicate.reference, duplicate: true };
    const result = await tx.execute(sql`select id, reference, status, amount, currency from payment_orders where reference = ${input.paymentReference} for update`);
    const payment = (result.rows as unknown as Array<{ id: string; reference: string; status: string; amount: string; currency: string }>)[0];
    if (!payment) throw new BankingError("PAYMENT_NOT_FOUND", "The payment could not be found.");
    const [existing] = await tx.select({ id: paymentReversals.id }).from(paymentReversals).where(eq(paymentReversals.originalPaymentOrderId, payment.id)).limit(1);
    const policy = validateReversalRequest({ paymentStatus: payment.status, existingReversal: Boolean(existing), reason: input.reason });
    if (!policy.ok) throw new BankingError(policy.code, message(policy.code));
    const reversalReference = reference("REV");
    const reason = input.reason.trim();
    await tx.insert(paymentReversals).values({
      reference: reversalReference, originalPaymentOrderId: payment.id, status: "PENDING_APPROVAL",
      amount: payment.amount, currency: payment.currency, reason, idempotencyKey: input.idempotencyKey, requestedBy: actor.id,
    });
    await createApprovalWorkItem(tx, {
      type: "PAYMENT_REVERSAL", priority: "HIGH", entityType: "PAYMENT_REVERSAL", entityReference: reversalReference,
      title: `Approve payment reversal ${reversalReference}`, description: `Reverse ${payment.reference}: ${reason}`,
      requiredRole: "SUPERVISOR", dueAt: new Date(Date.now() + 24 * 60 * 60_000),
    }, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "PAYMENT_REVERSAL_REQUESTED", entityType: "PAYMENT_REVERSAL", entityReference: reversalReference, correlationId: input.idempotencyKey, before: null, after: { paymentReference: payment.reference, amount: payment.amount, currency: payment.currency, reason } });
    return { reference: reversalReference, duplicate: false };
  });
}

type DecisionInput = { reversalReference: string; workItemReference: string; expectedVersion: number; comment: string };

export async function decidePaymentReversal(input: DecisionInput & { decision: "APPROVE" | "REJECT" }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const item = await lockApprovalWorkItem(tx, { reference: input.workItemReference, entityType: "PAYMENT_REVERSAL", entityReference: input.reversalReference, expectedVersion: input.expectedVersion }, actor);
    const reversalResult = await tx.execute(sql`select id, original_payment_order_id, status, amount, currency, version from payment_reversals where reference = ${input.reversalReference} for update`);
    const reversal = (reversalResult.rows as unknown as Array<{ id: string; original_payment_order_id: string; status: string; amount: string; currency: string; version: number }>)[0];
    if (!reversal || reversal.status !== "PENDING_APPROVAL") throw new BankingError("REVERSAL_NOT_PENDING", "The reversal is no longer pending approval.");
    const comment = input.comment.trim();
    if (comment.length < 5) throw new BankingError("COMMENT_REQUIRED", "Enter a decision comment of at least five characters.");
    if (input.decision === "REJECT") {
      await tx.update(paymentReversals).set({ status: "REJECTED", decidedBy: actor.id, decisionComment: comment, decidedAt: new Date(), version: reversal.version + 1, updatedAt: new Date() }).where(eq(paymentReversals.id, reversal.id));
      await decideWorkItem(tx, item, "REJECTED", comment, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "PAYMENT_REVERSAL_REJECTED", entityType: "PAYMENT_REVERSAL", entityReference: input.reversalReference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" }, after: { status: "REJECTED", comment } });
      return input.reversalReference;
    }

    const paymentResult = await tx.execute(sql`select id, reference, type, status, source_account_id, destination_account_id, amount, currency from payment_orders where id = ${reversal.original_payment_order_id} for update`);
    const payment = (paymentResult.rows as unknown as Array<{ id: string; reference: string; type: "INTERNAL" | "EXTERNAL"; status: string; source_account_id: string; destination_account_id: string | null; amount: string; currency: string }>)[0];
    if (!payment || payment.status !== "BOOKED" || payment.amount !== reversal.amount || payment.currency !== reversal.currency) throw new BankingError("ORIGINAL_PAYMENT_CHANGED", "The original booked payment no longer matches this reversal.");
    const originalResult = await tx.execute(sql`select id, reference from ledger_transactions where payment_order_id = ${payment.id} and status = 'BOOKED' and type <> 'PAYMENT_REVERSAL' order by booked_at asc limit 1 for update`);
    const original = (originalResult.rows as unknown as Array<{ id: string; reference: string }>)[0];
    if (!original) throw new BankingError("ORIGINAL_POSTING_NOT_FOUND", "The original ledger posting could not be found.");
    const amount = moneyToMinorUnits(reversal.amount);
    const transactionReference = reference("TXR");
    const now = new Date();
    const [transaction] = await tx.insert(ledgerTransactions).values({ reference: transactionReference, bookedAt: now, valueDate: now.toISOString().slice(0, 10), description: `Reversal of ${payment.reference}: ${comment}`, type: "PAYMENT_REVERSAL", status: "BOOKED", currency: reversal.currency, amount: reversal.amount, counterparty: original.reference, paymentOrderId: payment.id }).returning();

    if (payment.type === "INTERNAL") {
      if (!payment.destination_account_id) throw new BankingError("DESTINATION_NOT_FOUND", "The original destination account is missing.");
      const accountsResult = await tx.execute(sql`select id, account_number, balance, available_balance, status, read_only from bank_accounts where id in (${payment.source_account_id}, ${payment.destination_account_id}) order by id for update`);
      const accounts = accountsResult.rows as unknown as Array<{ id: string; account_number: string; balance: string; available_balance: string; status: string; read_only: boolean }>;
      const source = accounts.find((row) => row.id === payment.source_account_id);
      const destination = accounts.find((row) => row.id === payment.destination_account_id);
      if (!source || !destination || source.status === "CLOSED" || source.read_only) throw new BankingError("ACCOUNT_UNAVAILABLE", "An account required for the reversal is unavailable.");
      const policy = validateInternalReversalFunds({ amount: reversal.amount, destinationAvailableBalance: destination.available_balance, destinationStatus: destination.status, destinationReadOnly: destination.read_only });
      if (!policy.ok) throw new BankingError(policy.code, message(policy.code));
      const sourceAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.balance) + amount);
      const sourceAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.available_balance) + amount);
      const destinationAfter = minorUnitsToMoney(signedMoneyToMinorUnits(destination.balance) - amount);
      const destinationAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(destination.available_balance) - amount);
      await tx.insert(ledgerEntries).values([
        { transactionId: transaction.id, accountId: source.id, direction: "CREDIT", amount: reversal.amount, balanceAfter: sourceAfter },
        { transactionId: transaction.id, accountId: destination.id, direction: "DEBIT", amount: reversal.amount, balanceAfter: destinationAfter },
      ]);
      await tx.update(bankAccounts).set({ balance: sourceAfter, availableBalance: sourceAvailableAfter, updatedAt: now }).where(eq(bankAccounts.id, source.id));
      await tx.update(bankAccounts).set({ balance: destinationAfter, availableBalance: destinationAvailableAfter, updatedAt: now }).where(eq(bankAccounts.id, destination.id));
    } else {
      const accountResult = await tx.execute(sql`select id, balance, available_balance, status, read_only from bank_accounts where id = ${payment.source_account_id} for update`);
      const source = (accountResult.rows as unknown as Array<{ id: string; balance: string; available_balance: string; status: string; read_only: boolean }>)[0];
      const clearingResult = await tx.execute(sql`select ca.id, ca.balance from clearing_accounts ca join clearing_entries ce on ce.clearing_account_id = ca.id where ce.transaction_id = ${original.id} for update`);
      const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
      if (!source || source.status === "CLOSED" || source.read_only) throw new BankingError("ACCOUNT_UNAVAILABLE", "The source account is unavailable for reversal credit.");
      if (!clearing || moneyToMinorUnits(clearing.balance) < amount) throw new BankingError("CLEARING_FUNDS_UNAVAILABLE", "The clearing account has insufficient funds for reversal.");
      const sourceAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.balance) + amount);
      const sourceAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.available_balance) + amount);
      const clearingAfter = minorUnitsToMoney(signedMoneyToMinorUnits(clearing.balance) - amount);
      await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: source.id, direction: "CREDIT", amount: reversal.amount, balanceAfter: sourceAfter });
      await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "DEBIT", amount: reversal.amount, balanceAfter: clearingAfter });
      await tx.update(bankAccounts).set({ balance: sourceAfter, availableBalance: sourceAvailableAfter, updatedAt: now }).where(eq(bankAccounts.id, source.id));
      await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: now }).where(eq(clearingAccounts.id, clearing.id));
    }
    await tx.update(paymentReversals).set({ status: "BOOKED", reversalTransactionId: transaction.id, decidedBy: actor.id, decisionComment: comment, decidedAt: now, version: reversal.version + 1, updatedAt: now }).where(eq(paymentReversals.id, reversal.id));
    await decideWorkItem(tx, item, "APPROVED", comment, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "PAYMENT_REVERSAL_BOOKED", entityType: "PAYMENT_REVERSAL", entityReference: input.reversalReference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" }, after: { status: "BOOKED", paymentReference: payment.reference, transactionReference, amount: reversal.amount, currency: reversal.currency } });
    return input.reversalReference;
  });
}
