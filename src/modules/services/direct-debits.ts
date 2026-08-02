import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, bankAccounts, beneficiaries, customerRestrictions, customers, directDebitCollections, directDebitMandates, paymentOrders } from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { validateDirectDebitCollection, validateMandatePeriod } from "@/modules/domain/direct-debit-policy";
import { minorUnitsToMoney, moneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { BankingError } from "./errors";
import { bookExternalPayment } from "./payments";

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalizedPositiveMoney(value: string): string {
  try {
    const amount = moneyToMinorUnits(value);
    if (amount <= 0n) throw new Error("non-positive");
    return minorUnitsToMoney(amount);
  } catch { throw new BankingError("INVALID_AMOUNT", "Enter an amount greater than zero with no more than two decimal places."); }
}

export async function createDirectDebitMandate(input: {
  sourceAccountNumber: string;
  creditorBeneficiaryId: string;
  creditorMandateReference: string;
  maximumSingleAmount: string;
  validFrom: string;
  validTo?: string | null;
  today?: string;
}, actor: SessionUser) {
  const maximumSingleAmount = normalizedPositiveMoney(input.maximumSingleAmount);
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const period = validateMandatePeriod({ validFrom: input.validFrom, validTo: input.validTo, today });
  if (!period.ok) throw new BankingError(period.code, period.code === "START_DATE_IN_PAST" ? "The mandate start date cannot be in the past." : period.code === "END_BEFORE_START" ? "The mandate end date cannot be before its start date." : "Enter valid mandate dates.");
  const creditorReference = input.creditorMandateReference.trim();
  if (creditorReference.length < 3) throw new BankingError("CREDITOR_REFERENCE_REQUIRED", "Enter the creditor's mandate reference.");
  return db.transaction(async (tx) => {
    const accountResult = await tx.execute(sql`select id, customer_id, currency, status, read_only from bank_accounts where account_number = ${input.sourceAccountNumber} for update`);
    const account = (accountResult.rows as unknown as Array<{ id: string; customer_id: string; currency: string; status: string; read_only: boolean }>)[0];
    if (!account) throw new BankingError("ACCOUNT_NOT_FOUND", "The source account could not be found.");
    if (account.status !== "ACTIVE" || account.read_only) throw new BankingError("ACCOUNT_UNAVAILABLE", "The source account is not available for direct debits.");
    const [[customer], restrictions, [creditor]] = await Promise.all([
      tx.select().from(customers).where(eq(customers.id, account.customer_id)).limit(1),
      tx.select().from(customerRestrictions).where(and(eq(customerRestrictions.customerId, account.customer_id), eq(customerRestrictions.type, "DEBIT_BLOCK"), eq(customerRestrictions.active, true))),
      tx.select().from(beneficiaries).where(and(eq(beneficiaries.id, input.creditorBeneficiaryId), eq(beneficiaries.customerId, account.customer_id), eq(beneficiaries.status, "ACTIVE"))).limit(1),
    ]);
    if (!customer || ["REJECTED", "EXPIRED"].includes(customer.kycStatus) || restrictions.length) throw new BankingError("DEBITS_RESTRICTED", "Customer debits are blocked by KYC controls.");
    if (!creditor) throw new BankingError("BENEFICIARY_NOT_FOUND", "The creditor beneficiary could not be found or is inactive.");
    if (creditor.currency !== account.currency) throw new BankingError("CURRENCY_MISMATCH", "The account and creditor currencies must match.");
    const mandateReference = reference("DDM");
    try {
      await tx.insert(directDebitMandates).values({
        reference: mandateReference, sourceAccountId: account.id, creditorBeneficiaryId: creditor.id,
        creditorMandateReference: creditorReference, status: "ACTIVE", maximumSingleAmount,
        currency: account.currency, validFrom: input.validFrom, validTo: input.validTo, createdBy: actor.id,
      });
    } catch (error) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) throw new BankingError("MANDATE_ALREADY_EXISTS", "This creditor mandate reference is already registered.");
      throw error;
    }
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "DIRECT_DEBIT_MANDATE_CREATED", entityType: "DIRECT_DEBIT_MANDATE", entityReference: mandateReference, correlationId: crypto.randomUUID(), before: null, after: { sourceAccountNumber: input.sourceAccountNumber, creditor: creditor.name, creditorReference, maximumSingleAmount, currency: account.currency, validFrom: input.validFrom, validTo: input.validTo ?? null } });
    return mandateReference;
  });
}

export async function cancelDirectDebitMandate(input: { reference: string; expectedVersion: number; reason: string }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`select id, status, version from direct_debit_mandates where reference = ${input.reference} for update`);
    const mandate = (result.rows as unknown as Array<{ id: string; status: string; version: number }>)[0];
    if (!mandate) throw new BankingError("MANDATE_NOT_FOUND", "The direct debit mandate could not be found.");
    if (!['ACTIVE', 'SUSPENDED'].includes(mandate.status)) throw new BankingError("MANDATE_NOT_CANCELLABLE", "The mandate is no longer cancellable.");
    if (mandate.version !== input.expectedVersion) throw new BankingError("STALE_VERSION", "The mandate changed. Refresh and try again.");
    const [processing] = await tx.select({ id: directDebitCollections.id }).from(directDebitCollections).where(and(eq(directDebitCollections.mandateId, mandate.id), eq(directDebitCollections.status, "PROCESSING"))).limit(1);
    if (processing) throw new BankingError("COLLECTION_PROCESSING", "A collection is processing; wait for it to finish before cancelling.");
    const reason = input.reason.trim();
    if (reason.length < 5) throw new BankingError("REASON_REQUIRED", "Enter a cancellation reason of at least five characters.");
    await tx.update(directDebitMandates).set({ status: "CANCELLED", cancelledBy: actor.id, cancellationReason: reason, cancelledAt: new Date(), version: mandate.version + 1, updatedAt: new Date() }).where(eq(directDebitMandates.id, mandate.id));
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "DIRECT_DEBIT_MANDATE_CANCELLED", entityType: "DIRECT_DEBIT_MANDATE", entityReference: input.reference, correlationId: crypto.randomUUID(), before: { status: mandate.status, version: mandate.version }, after: { status: "CANCELLED", version: mandate.version + 1, reason } });
    return input.reference;
  });
}

export async function submitDirectDebitCollection(input: { mandateReference: string; amount: string; collectionDate: string; idempotencyKey: string; today?: string }, actor: SessionUser) {
  const collectionReference = reference("DDC");
  const claim = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [existing] = await tx.select().from(directDebitCollections).where(eq(directDebitCollections.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) return { collection: existing, duplicate: true, mandate: null, accountNumber: null };
    await tx.execute(sql`select id from direct_debit_mandates where reference = ${input.mandateReference} for update`);
    const [row] = await tx.select({ mandate: directDebitMandates, accountNumber: bankAccounts.accountNumber }).from(directDebitMandates)
      .innerJoin(bankAccounts, eq(directDebitMandates.sourceAccountId, bankAccounts.id)).where(eq(directDebitMandates.reference, input.mandateReference)).limit(1);
    if (!row) throw new BankingError("MANDATE_NOT_FOUND", "The direct debit mandate could not be found.");
    const amount = normalizedPositiveMoney(input.amount);
    const policy = validateDirectDebitCollection({ status: row.mandate.status, amount, maximumSingleAmount: row.mandate.maximumSingleAmount, collectionDate: input.collectionDate, validFrom: row.mandate.validFrom, validTo: row.mandate.validTo, today: input.today ?? new Date().toISOString().slice(0, 10) });
    if (!policy.ok) {
      const messages: Record<string, string> = { MANDATE_INACTIVE: "The mandate is not active.", OUTSIDE_MANDATE_PERIOD: "The collection date is outside the mandate period.", FUTURE_COLLECTION_DATE: "A direct debit collection cannot be future-dated.", MANDATE_LIMIT_EXCEEDED: "The collection exceeds the mandate's maximum single amount.", INVALID_AMOUNT: "Enter a valid collection amount.", INVALID_DATE: "Enter a valid collection date." };
      throw new BankingError(policy.code, messages[policy.code]);
    }
    const [collection] = await tx.insert(directDebitCollections).values({ reference: collectionReference, mandateId: row.mandate.id, status: "PROCESSING", amount, currency: row.mandate.currency, collectionDate: input.collectionDate, idempotencyKey: input.idempotencyKey, submittedBy: actor.id }).returning();
    return { collection, duplicate: false, mandate: row.mandate, accountNumber: row.accountNumber };
  });
  if (claim.duplicate || !claim.mandate || !claim.accountNumber) return { reference: claim.collection.reference, status: claim.collection.status, duplicate: true };
  const paymentIdempotencyKey = `direct-debit:${claim.collection.id}`;
  try {
    await bookExternalPayment({ sourceAccountNumber: claim.accountNumber, beneficiaryId: claim.mandate.creditorBeneficiaryId, amount: claim.collection.amount, description: `Direct debit ${claim.mandate.creditorMandateReference}`, idempotencyKey: paymentIdempotencyKey }, actor);
    const [payment] = await db.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, paymentIdempotencyKey)).limit(1);
    if (!payment) throw new BankingError("PAYMENT_NOT_CREATED", "The collection payment was not created.");
    const status = payment.status === "PENDING" ? "PENDING" as const : "BOOKED" as const;
    await db.update(directDebitCollections).set({ status, paymentOrderId: payment.id, completedAt: new Date(), updatedAt: new Date() }).where(eq(directDebitCollections.id, claim.collection.id));
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: status === "PENDING" ? "DIRECT_DEBIT_COLLECTION_PENDING" : "DIRECT_DEBIT_COLLECTION_BOOKED", entityType: "DIRECT_DEBIT_COLLECTION", entityReference: claim.collection.reference, correlationId: input.idempotencyKey, before: null, after: { mandateReference: input.mandateReference, paymentReference: payment.reference, amount: claim.collection.amount, currency: claim.collection.currency, status } });
    return { reference: claim.collection.reference, status, duplicate: false };
  } catch (error) {
    const code = error instanceof BankingError ? error.code : "COLLECTION_REJECTED";
    const message = error instanceof Error ? error.message : "The collection was rejected.";
    await db.update(directDebitCollections).set({ status: "REJECTED", failureCode: code, failureMessage: message, completedAt: new Date(), updatedAt: new Date() }).where(eq(directDebitCollections.id, claim.collection.id));
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "DIRECT_DEBIT_COLLECTION_REJECTED", entityType: "DIRECT_DEBIT_COLLECTION", entityReference: claim.collection.reference, correlationId: input.idempotencyKey, before: null, after: { mandateReference: input.mandateReference, amount: claim.collection.amount, currency: claim.collection.currency, code } });
    return { reference: claim.collection.reference, status: "REJECTED" as const, duplicate: false, code, message };
  }
}
