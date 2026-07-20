import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, bankAccounts, beneficiaries, clearingAccounts, clearingEntries,
  ledgerEntries, ledgerTransactions, paymentOrders,
} from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { minorUnitsToMoney, moneyToMinorUnits, validateTransfer } from "@/modules/domain/transfer-policy";

export class BankingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

type LockedAccount = {
  id: string;
  account_number: string;
  customer_id: string;
  currency: string;
  balance: string;
  available_balance: string;
  status: "ACTIVE" | "BLOCKED" | "CLOSED";
  read_only: boolean;
};

type PaymentInput = {
  sourceAccountNumber: string;
  amount: string;
  description: string;
  idempotencyKey: string;
};

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function policyMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_AMOUNT: "Enter an amount greater than zero with no more than two decimal places.",
    ACCOUNT_UNAVAILABLE: "One of the selected accounts is not active.",
    READ_ONLY_ACCOUNT: "This account is read-only.",
    CURRENCY_MISMATCH: "Source and destination currencies must match.",
    INSUFFICIENT_FUNDS: "The source account has insufficient available funds.",
  };
  return messages[code] ?? "The payment could not be completed.";
}

export async function bookInternalTransfer(input: PaymentInput & { destinationAccountNumber: string }, actor: SessionUser) {
  if (input.sourceAccountNumber === input.destinationAccountNumber) throw new BankingError("SAME_ACCOUNT", "Source and destination accounts must be different.");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) return { reference: existing.reference, duplicate: true };

    const result = await tx.execute(sql`
      select id, account_number, customer_id, currency, balance, available_balance, status, read_only
      from bank_accounts
      where account_number in (${input.sourceAccountNumber}, ${input.destinationAccountNumber})
      order by account_number for update
    `);
    const locked = result.rows as unknown as LockedAccount[];
    const source = locked.find((item) => item.account_number === input.sourceAccountNumber);
    const destination = locked.find((item) => item.account_number === input.destinationAccountNumber);
    if (!source || !destination) throw new BankingError("ACCOUNT_NOT_FOUND", "One or more accounts could not be found.");
    const [concurrent] = await tx.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { reference: concurrent.reference, duplicate: true };

    const policy = validateTransfer({
      amount: input.amount, sourceCurrency: source.currency, destinationCurrency: destination.currency,
      availableBalance: source.available_balance, sourceStatus: source.status, destinationStatus: destination.status,
      sourceReadOnly: source.read_only,
    });
    if (!policy.ok) throw new BankingError(policy.code, policyMessage(policy.code));

    const amount = moneyToMinorUnits(policy.amount);
    const sourceAfter = minorUnitsToMoney(moneyToMinorUnits(source.balance) - amount);
    const sourceAvailableAfter = minorUnitsToMoney(moneyToMinorUnits(source.available_balance) - amount);
    const destinationAfter = minorUnitsToMoney(moneyToMinorUnits(destination.balance) + amount);
    const destinationAvailableAfter = minorUnitsToMoney(moneyToMinorUnits(destination.available_balance) + amount);
    const paymentReference = reference("PAY");
    const transactionReference = reference("TX");

    const [order] = await tx.insert(paymentOrders).values({
      reference: paymentReference, type: "INTERNAL", status: "BOOKED", sourceAccountId: source.id,
      destinationAccountId: destination.id, amount: policy.amount, currency: source.currency,
      description: input.description, idempotencyKey: input.idempotencyKey, initiatedBy: actor.username, bookedAt: new Date(),
    }).returning();
    const [transaction] = await tx.insert(ledgerTransactions).values({
      reference: transactionReference, bookedAt: new Date(), valueDate: new Date().toISOString().slice(0, 10),
      description: input.description, type: "INTERNAL_TRANSFER", status: "BOOKED", currency: source.currency,
      amount: policy.amount, counterparty: input.destinationAccountNumber, paymentOrderId: order.id,
    }).returning();
    await tx.insert(ledgerEntries).values([
      { transactionId: transaction.id, accountId: source.id, direction: "DEBIT", amount: policy.amount, balanceAfter: sourceAfter },
      { transactionId: transaction.id, accountId: destination.id, direction: "CREDIT", amount: policy.amount, balanceAfter: destinationAfter },
    ]);
    await tx.update(bankAccounts).set({ balance: sourceAfter, availableBalance: sourceAvailableAfter, updatedAt: new Date() }).where(eq(bankAccounts.id, source.id));
    await tx.update(bankAccounts).set({ balance: destinationAfter, availableBalance: destinationAvailableAfter, updatedAt: new Date() }).where(eq(bankAccounts.id, destination.id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.id, actorUsername: actor.username, action: "INTERNAL_TRANSFER_BOOKED", entityType: "PAYMENT",
      entityReference: paymentReference, correlationId: input.idempotencyKey, before: null,
      after: { source: input.sourceAccountNumber, destination: input.destinationAccountNumber, amount: policy.amount, currency: source.currency },
    });
    return { reference: paymentReference, duplicate: false };
  });
}

export async function bookExternalPayment(input: PaymentInput & { beneficiaryId: string }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) return { reference: existing.reference, duplicate: true };
    const accountResult = await tx.execute(sql`
      select id, account_number, customer_id, currency, balance, available_balance, status, read_only
      from bank_accounts where account_number = ${input.sourceAccountNumber} for update
    `);
    const source = (accountResult.rows as unknown as LockedAccount[])[0];
    if (!source) throw new BankingError("ACCOUNT_NOT_FOUND", "The source account could not be found.");
    const [beneficiary] = await tx.select().from(beneficiaries).where(and(
      eq(beneficiaries.id, input.beneficiaryId),
      eq(beneficiaries.customerId, source.customer_id),
      eq(beneficiaries.status, "ACTIVE"),
    )).limit(1);
    if (!beneficiary) throw new BankingError("BENEFICIARY_NOT_FOUND", "The beneficiary could not be found or is inactive.");
    const [concurrent] = await tx.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { reference: concurrent.reference, duplicate: true };

    const clearingResult = await tx.execute(sql`
      select id, balance from clearing_accounts where currency = ${source.currency} order by code limit 1 for update
    `);
    const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
    if (!clearing) throw new BankingError("CLEARING_UNAVAILABLE", "The clearing account is unavailable.");
    const policy = validateTransfer({
      amount: input.amount, sourceCurrency: source.currency, destinationCurrency: beneficiary.currency,
      availableBalance: source.available_balance, sourceStatus: source.status, destinationStatus: "ACTIVE", sourceReadOnly: source.read_only,
    });
    if (!policy.ok) throw new BankingError(policy.code, policyMessage(policy.code));

    const amount = moneyToMinorUnits(policy.amount);
    const sourceAfter = minorUnitsToMoney(moneyToMinorUnits(source.balance) - amount);
    const sourceAvailableAfter = minorUnitsToMoney(moneyToMinorUnits(source.available_balance) - amount);
    const clearingAfter = minorUnitsToMoney(moneyToMinorUnits(clearing.balance) + amount);
    const paymentReference = reference("EXT");
    const transactionReference = reference("TX");
    const [order] = await tx.insert(paymentOrders).values({
      reference: paymentReference, type: "EXTERNAL", status: "BOOKED", sourceAccountId: source.id,
      beneficiaryId: beneficiary.id, amount: policy.amount, currency: source.currency, description: input.description,
      idempotencyKey: input.idempotencyKey, initiatedBy: actor.username, bookedAt: new Date(),
    }).returning();
    const [transaction] = await tx.insert(ledgerTransactions).values({
      reference: transactionReference, bookedAt: new Date(), valueDate: new Date().toISOString().slice(0, 10), description: input.description,
      type: "EXTERNAL_PAYMENT", status: "BOOKED", currency: source.currency, amount: policy.amount,
      counterparty: beneficiary.name, paymentOrderId: order.id,
    }).returning();
    await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: source.id, direction: "DEBIT", amount: policy.amount, balanceAfter: sourceAfter });
    await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "CREDIT", amount: policy.amount, balanceAfter: clearingAfter });
    await tx.update(bankAccounts).set({ balance: sourceAfter, availableBalance: sourceAvailableAfter, updatedAt: new Date() }).where(eq(bankAccounts.id, source.id));
    await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: new Date() }).where(eq(clearingAccounts.id, clearing.id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.id, actorUsername: actor.username, action: "EXTERNAL_PAYMENT_BOOKED", entityType: "PAYMENT",
      entityReference: paymentReference, correlationId: input.idempotencyKey, before: null,
      after: { source: input.sourceAccountNumber, beneficiary: beneficiary.name, amount: policy.amount, currency: source.currency },
    });
    return { reference: paymentReference, duplicate: false };
  });
}
