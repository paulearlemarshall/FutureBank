import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountHolds, auditEvents, bankAccounts, beneficiaries, clearingAccounts, clearingEntries, customerRestrictions, customers,
  ledgerEntries, ledgerTransactions, paymentOrders, screeningChecks,
} from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits, validateTransfer } from "@/modules/domain/transfer-policy";
import { kycPaymentControl } from "@/modules/domain/kyc-policy";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "./workflow";
export { BankingError } from "./errors";
import { BankingError } from "./errors";
import { assertPostingDateOpen } from "./accounting-periods";
import { postSubledgerToGeneralLedger } from "./general-ledger";

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

type LockedPendingPayment = {
  id: string;
  reference: string;
  status: "PENDING" | "BOOKED" | "REJECTED" | "EXPIRED";
  source_account_id: string;
  beneficiary_id: string | null;
  amount: string;
  currency: string;
  description: string;
  initiated_by: string;
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

function reachesApprovalThreshold(currency: string, amount: string): boolean {
  const threshold = currency === "AED" ? 5_000_000n : ["GBP", "EUR", "USD"].includes(currency) ? 1_000_000n : 1_000_000n;
  return moneyToMinorUnits(amount) >= threshold;
}

async function paymentControls(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], customerId: string, beneficiaryId: string) {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const restrictions = await tx.select().from(customerRestrictions).where(and(eq(customerRestrictions.customerId, customerId), eq(customerRestrictions.active, true)));
  const screenings = await tx.select().from(screeningChecks).where(and(eq(screeningChecks.subjectType, "BENEFICIARY"), eq(screeningChecks.subjectReference, beneficiaryId)));
  if (!customer) throw new BankingError("CUSTOMER_NOT_FOUND", "The account customer could not be found.");
  if (restrictions.some((item) => item.type === "DEBIT_BLOCK")) throw new BankingError("DEBITS_RESTRICTED", "Customer debits are blocked by an active KYC restriction.");
  if (screenings.some((item) => item.screeningType === "SANCTIONS" && item.outcome === "CONFIRMED_MATCH")) throw new BankingError("BENEFICIARY_SANCTIONS_MATCH", "The beneficiary has a confirmed fictional sanctions match and the payment was rejected.");
  const pepChecks = await tx.select().from(screeningChecks).where(and(eq(screeningChecks.customerId, customerId), eq(screeningChecks.screeningType, "PEP")));
  const pep = pepChecks.some((item) => item.outcome === "CONFIRMED_MATCH");
  const possibleBeneficiaryMatch = screenings.some((item) => item.outcome === "POSSIBLE_MATCH");
  return { customer, pep, possibleBeneficiaryMatch, control: kycPaymentControl(customer.kycStatus, customer.riskRating, pep) };
}

async function assertCustomerDebitAllowed(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], customerId: string) {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const restrictions = await tx.select().from(customerRestrictions).where(and(eq(customerRestrictions.customerId, customerId), eq(customerRestrictions.active, true), eq(customerRestrictions.type, "DEBIT_BLOCK")));
  if (!customer) throw new BankingError("CUSTOMER_NOT_FOUND", "The account customer could not be found.");
  if (["REJECTED", "EXPIRED"].includes(customer.kycStatus) || restrictions.length) throw new BankingError("DEBITS_RESTRICTED", "Customer debits are blocked by KYC controls.");
}

export async function bookInternalTransfer(input: PaymentInput & { destinationAccountNumber: string }, actor: SessionUser) {
  if (input.sourceAccountNumber === input.destinationAccountNumber) throw new BankingError("SAME_ACCOUNT", "Source and destination accounts must be different.");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) return { reference: existing.reference, duplicate: true };
    const valueDate = new Date().toISOString().slice(0, 10);
    await assertPostingDateOpen(tx, valueDate);

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
    await assertCustomerDebitAllowed(tx, source.customer_id);
    const [concurrent] = await tx.select().from(paymentOrders).where(eq(paymentOrders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (concurrent) return { reference: concurrent.reference, duplicate: true };

    const policy = validateTransfer({
      amount: input.amount, sourceCurrency: source.currency, destinationCurrency: destination.currency,
      availableBalance: source.available_balance, sourceStatus: source.status, destinationStatus: destination.status,
      sourceReadOnly: source.read_only,
    });
    if (!policy.ok) throw new BankingError(policy.code, policyMessage(policy.code));

    const amount = moneyToMinorUnits(policy.amount);
    const sourceAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.balance) - amount);
    const sourceAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.available_balance) - amount);
    const destinationAfter = minorUnitsToMoney(signedMoneyToMinorUnits(destination.balance) + amount);
    const destinationAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(destination.available_balance) + amount);
    const paymentReference = reference("PAY");
    const transactionReference = reference("TX");

    const [order] = await tx.insert(paymentOrders).values({
      reference: paymentReference, type: "INTERNAL", status: "BOOKED", sourceAccountId: source.id,
      destinationAccountId: destination.id, amount: policy.amount, currency: source.currency,
      description: input.description, idempotencyKey: input.idempotencyKey, initiatedBy: actor.username, bookedAt: new Date(),
    }).returning();
    const [transaction] = await tx.insert(ledgerTransactions).values({
      reference: transactionReference, bookedAt: new Date(), valueDate,
      description: input.description, type: "INTERNAL_TRANSFER", status: "BOOKED", currency: source.currency,
      amount: policy.amount, counterparty: input.destinationAccountNumber, paymentOrderId: order.id,
    }).returning();
    await tx.insert(ledgerEntries).values([
      { transactionId: transaction.id, accountId: source.id, direction: "DEBIT", amount: policy.amount, balanceAfter: sourceAfter },
      { transactionId: transaction.id, accountId: destination.id, direction: "CREDIT", amount: policy.amount, balanceAfter: destinationAfter },
    ]);
    await postSubledgerToGeneralLedger(tx, transaction.id);
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

    const policy = validateTransfer({
      amount: input.amount, sourceCurrency: source.currency, destinationCurrency: beneficiary.currency,
      availableBalance: source.available_balance, sourceStatus: source.status, destinationStatus: "ACTIVE", sourceReadOnly: source.read_only,
    });
    if (!policy.ok) throw new BankingError(policy.code, policyMessage(policy.code));

    const controls = await paymentControls(tx, source.customer_id, beneficiary.id);
    if (controls.control === "BLOCK") throw new BankingError("KYC_DEBITS_BLOCKED", "The customer's KYC status prevents debit activity.");
    const approvalReasons = [
      reachesApprovalThreshold(source.currency, policy.amount) ? "Payment meets the FutureBank high-value approval threshold" : null,
      controls.control === "APPROVAL" ? controls.pep ? "Approved PEP or high-risk relationship requires external-payment approval" : "KYC is due or under review" : null,
      controls.possibleBeneficiaryMatch ? "Possible beneficiary-screening match requires Compliance resolution and payment approval" : null,
    ].filter((value): value is string => Boolean(value));

    if (approvalReasons.length) {
      const paymentReference = reference("EXT");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      const [order] = await tx.insert(paymentOrders).values({
        reference: paymentReference, type: "EXTERNAL", status: "PENDING", sourceAccountId: source.id,
        beneficiaryId: beneficiary.id, amount: policy.amount, currency: source.currency, description: input.description,
        idempotencyKey: input.idempotencyKey, initiatedBy: actor.username, approvalReason: approvalReasons.join("; "), expiresAt,
      }).returning();
      await tx.insert(accountHolds).values({
        reference: reference("HLD"), accountId: source.id, paymentOrderId: order.id, amount: policy.amount,
        currency: source.currency, status: "ACTIVE", expiresAt,
      });
      await tx.update(bankAccounts).set({
        availableBalance: minorUnitsToMoney(signedMoneyToMinorUnits(source.available_balance) - moneyToMinorUnits(policy.amount)), updatedAt: new Date(),
      }).where(eq(bankAccounts.id, source.id));
      await createApprovalWorkItem(tx, {
        type: "PAYMENT_APPROVAL", priority: reachesApprovalThreshold(source.currency, policy.amount) ? "HIGH" : "NORMAL",
        entityType: "PAYMENT", entityReference: paymentReference, title: `Approve external payment ${paymentReference}`,
        description: approvalReasons.join("; "), requiredRole: "SUPERVISOR", dueAt: expiresAt,
      }, actor);
      await tx.insert(auditEvents).values({
        actorUserId: actor.id, actorUsername: actor.username, action: "EXTERNAL_PAYMENT_PENDING", entityType: "PAYMENT",
        entityReference: paymentReference, correlationId: input.idempotencyKey, before: null,
        after: { source: input.sourceAccountNumber, beneficiary: beneficiary.name, amount: policy.amount, currency: source.currency, approvalReasons },
      });
      return { reference: paymentReference, duplicate: false, pending: true };
    }

    const valueDate = new Date().toISOString().slice(0, 10);
    await assertPostingDateOpen(tx, valueDate);

    const clearingResult = await tx.execute(sql`
      select id, balance from clearing_accounts where currency = ${source.currency} order by code limit 1 for update
    `);
    const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
    if (!clearing) throw new BankingError("CLEARING_UNAVAILABLE", "The clearing account is unavailable.");

    const amount = moneyToMinorUnits(policy.amount);
    const sourceAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.balance) - amount);
    const sourceAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.available_balance) - amount);
    const clearingAfter = minorUnitsToMoney(signedMoneyToMinorUnits(clearing.balance) + amount);
    const paymentReference = reference("EXT");
    const transactionReference = reference("TX");
    const [order] = await tx.insert(paymentOrders).values({
      reference: paymentReference, type: "EXTERNAL", status: "BOOKED", sourceAccountId: source.id,
      beneficiaryId: beneficiary.id, amount: policy.amount, currency: source.currency, description: input.description,
      idempotencyKey: input.idempotencyKey, initiatedBy: actor.username, bookedAt: new Date(),
    }).returning();
    const [transaction] = await tx.insert(ledgerTransactions).values({
      reference: transactionReference, bookedAt: new Date(), valueDate, description: input.description,
      type: "EXTERNAL_PAYMENT", status: "BOOKED", currency: source.currency, amount: policy.amount,
      counterparty: beneficiary.name, paymentOrderId: order.id,
    }).returning();
    await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: source.id, direction: "DEBIT", amount: policy.amount, balanceAfter: sourceAfter });
    await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "CREDIT", amount: policy.amount, balanceAfter: clearingAfter });
    await postSubledgerToGeneralLedger(tx, transaction.id);
    await tx.update(bankAccounts).set({ balance: sourceAfter, availableBalance: sourceAvailableAfter, updatedAt: new Date() }).where(eq(bankAccounts.id, source.id));
    await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: new Date() }).where(eq(clearingAccounts.id, clearing.id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.id, actorUsername: actor.username, action: "EXTERNAL_PAYMENT_BOOKED", entityType: "PAYMENT",
      entityReference: paymentReference, correlationId: input.idempotencyKey, before: null,
      after: { source: input.sourceAccountNumber, beneficiary: beneficiary.name, amount: policy.amount, currency: source.currency },
    });
    return { reference: paymentReference, duplicate: false, pending: false };
  });
}

export async function approvePendingPayment(input: { paymentReference: string; workItemReference: string; expectedVersion: number; comment: string }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const item = await lockApprovalWorkItem(tx, { reference: input.workItemReference, entityType: "PAYMENT", entityReference: input.paymentReference, expectedVersion: input.expectedVersion }, actor);
    const paymentResult = await tx.execute(sql`
      select id, reference, status, source_account_id, beneficiary_id, amount, currency, description, initiated_by
      from payment_orders where reference = ${input.paymentReference} for update
    `);
    const payment = (paymentResult.rows as unknown as LockedPendingPayment[])[0];
    if (!payment || payment.status !== "PENDING" || !payment.beneficiary_id) throw new BankingError("PAYMENT_NOT_PENDING", "The payment is no longer pending approval.");
    const accountResult = await tx.execute(sql`
      select id, account_number, customer_id, currency, balance, available_balance, status, read_only
      from bank_accounts where id = ${payment.source_account_id} for update
    `);
    const source = (accountResult.rows as unknown as LockedAccount[])[0];
    if (!source) throw new BankingError("ACCOUNT_NOT_FOUND", "The source account could not be found.");
    const holdResult = await tx.execute(sql`select id, amount, status from account_holds where payment_order_id = ${payment.id} for update`);
    const hold = (holdResult.rows as unknown as Array<{ id: string; amount: string; status: string }>)[0];
    if (!hold || hold.status !== "ACTIVE" || hold.amount !== payment.amount) throw new BankingError("HOLD_UNAVAILABLE", "The active payment hold is missing or inconsistent.");
    const [beneficiary] = await tx.select().from(beneficiaries).where(and(eq(beneficiaries.id, payment.beneficiary_id), eq(beneficiaries.customerId, source.customer_id), eq(beneficiaries.status, "ACTIVE"))).limit(1);
    if (!beneficiary) throw new BankingError("BENEFICIARY_NOT_FOUND", "The beneficiary is no longer active or owned by this customer.");
    const controls = await paymentControls(tx, source.customer_id, beneficiary.id);
    if (controls.control === "BLOCK") throw new BankingError("KYC_DEBITS_BLOCKED", "The customer's KYC status now prevents debit activity.");
    if (controls.possibleBeneficiaryMatch) throw new BankingError("SCREENING_UNRESOLVED", "Resolve the possible beneficiary-screening match before approving the payment.");
    const facilityResult = await tx.execute(sql`
      select id, status, approved_limit from overdraft_facilities
      where account_id = ${source.id} and status in ('ACTIVE', 'PENDING_CHANGE', 'SUSPENDED')
      order by updated_at desc limit 1 for update
    `);
    const facility = (facilityResult.rows as unknown as Array<{ id: string; status: string; approved_limit: string }>)[0];
    const availableIncludingHold = minorUnitsToMoney(signedMoneyToMinorUnits(source.available_balance) + moneyToMinorUnits(hold.amount));
    const policy = validateTransfer({ amount: payment.amount, sourceCurrency: source.currency, destinationCurrency: beneficiary.currency, availableBalance: availableIncludingHold, sourceStatus: source.status, destinationStatus: "ACTIVE", sourceReadOnly: source.read_only });
    if (!policy.ok) throw new BankingError(policy.code, policyMessage(policy.code));
    const sourceAfter = minorUnitsToMoney(signedMoneyToMinorUnits(source.balance) - moneyToMinorUnits(payment.amount));
    if (signedMoneyToMinorUnits(sourceAfter) < 0n && (!facility || !["ACTIVE", "PENDING_CHANGE"].includes(facility.status))) {
      throw new BankingError("OVERDRAFT_DRAWING_BLOCKED", "The payment would draw on an unavailable or suspended overdraft facility.");
    }
    const clearingResult = await tx.execute(sql`select id, balance from clearing_accounts where currency = ${source.currency} order by code limit 1 for update`);
    const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
    if (!clearing) throw new BankingError("CLEARING_UNAVAILABLE", "The clearing account is unavailable.");
    const valueDate = new Date().toISOString().slice(0, 10);
    await assertPostingDateOpen(tx, valueDate);
    const clearingAfter = minorUnitsToMoney(signedMoneyToMinorUnits(clearing.balance) + moneyToMinorUnits(payment.amount));
    const [transaction] = await tx.insert(ledgerTransactions).values({
      reference: reference("TX"), bookedAt: new Date(), valueDate, description: payment.description,
      type: "EXTERNAL_PAYMENT", status: "BOOKED", currency: payment.currency, amount: payment.amount, counterparty: beneficiary.name, paymentOrderId: payment.id,
    }).returning();
    await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: source.id, direction: "DEBIT", amount: payment.amount, balanceAfter: sourceAfter });
    await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "CREDIT", amount: payment.amount, balanceAfter: clearingAfter });
    await postSubledgerToGeneralLedger(tx, transaction.id);
    await tx.update(bankAccounts).set({ balance: sourceAfter, updatedAt: new Date() }).where(eq(bankAccounts.id, source.id));
    await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: new Date() }).where(eq(clearingAccounts.id, clearing.id));
    await tx.update(accountHolds).set({ status: "CONSUMED", releasedAt: new Date(), releaseReason: "Payment approved and booked", updatedAt: new Date() }).where(eq(accountHolds.id, hold.id));
    await tx.update(paymentOrders).set({ status: "BOOKED", decidedBy: actor.id, decisionComment: input.comment, decidedAt: new Date(), bookedAt: new Date() }).where(eq(paymentOrders.id, payment.id));
    await decideWorkItem(tx, item, "APPROVED", input.comment, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "PENDING_PAYMENT_APPROVED", entityType: "PAYMENT", entityReference: payment.reference, correlationId: crypto.randomUUID(), before: { status: "PENDING" }, after: { status: "BOOKED", amount: payment.amount } });
    return payment.reference;
  });
}

export async function rejectPendingPayment(input: { paymentReference: string; workItemReference: string; expectedVersion: number; comment: string }, actor: SessionUser) {
  return db.transaction(async (tx) => {
    const item = await lockApprovalWorkItem(tx, { reference: input.workItemReference, entityType: "PAYMENT", entityReference: input.paymentReference, expectedVersion: input.expectedVersion }, actor);
    const result = await tx.execute(sql`select id, reference, status, source_account_id, amount from payment_orders where reference = ${input.paymentReference} for update`);
    const payment = (result.rows as unknown as Array<{ id: string; reference: string; status: string; source_account_id: string; amount: string }>)[0];
    if (!payment || payment.status !== "PENDING") throw new BankingError("PAYMENT_NOT_PENDING", "The payment is no longer pending approval.");
    const accountResult = await tx.execute(sql`select id, available_balance from bank_accounts where id = ${payment.source_account_id} for update`);
    const account = (accountResult.rows as unknown as Array<{ id: string; available_balance: string }>)[0];
    const holdResult = await tx.execute(sql`select id, amount, status from account_holds where payment_order_id = ${payment.id} for update`);
    const hold = (holdResult.rows as unknown as Array<{ id: string; amount: string; status: string }>)[0];
    if (!account || !hold || hold.status !== "ACTIVE") throw new BankingError("HOLD_UNAVAILABLE", "The active payment hold is missing.");
    await tx.update(bankAccounts).set({ availableBalance: minorUnitsToMoney(signedMoneyToMinorUnits(account.available_balance) + moneyToMinorUnits(hold.amount)), updatedAt: new Date() }).where(eq(bankAccounts.id, account.id));
    await tx.update(accountHolds).set({ status: "RELEASED", releasedAt: new Date(), releaseReason: "Payment rejected", updatedAt: new Date() }).where(eq(accountHolds.id, hold.id));
    await tx.update(paymentOrders).set({ status: "REJECTED", decidedBy: actor.id, decisionComment: input.comment, decidedAt: new Date() }).where(eq(paymentOrders.id, payment.id));
    await decideWorkItem(tx, item, "REJECTED", input.comment, actor);
    await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "PENDING_PAYMENT_REJECTED", entityType: "PAYMENT", entityReference: payment.reference, correlationId: crypto.randomUUID(), before: { status: "PENDING" }, after: { status: "REJECTED", reason: input.comment } });
    return payment.reference;
  });
}

export async function expirePendingPayments(now = new Date()): Promise<number> {
  const expired = await db.select({ reference: paymentOrders.reference }).from(paymentOrders).where(and(eq(paymentOrders.status, "PENDING"), lt(paymentOrders.expiresAt, now)));
  for (const candidate of expired) {
    await db.transaction(async (tx) => {
      const paymentResult = await tx.execute(sql`select id, source_account_id, status from payment_orders where reference = ${candidate.reference} for update`);
      const payment = (paymentResult.rows as unknown as Array<{ id: string; source_account_id: string; status: string }>)[0];
      if (!payment || payment.status !== "PENDING") return;
      const holdResult = await tx.execute(sql`select id, amount, status from account_holds where payment_order_id = ${payment.id} for update`);
      const hold = (holdResult.rows as unknown as Array<{ id: string; amount: string; status: string }>)[0];
      const accountResult = await tx.execute(sql`select id, available_balance from bank_accounts where id = ${payment.source_account_id} for update`);
      const account = (accountResult.rows as unknown as Array<{ id: string; available_balance: string }>)[0];
      if (hold?.status === "ACTIVE" && account) {
        await tx.update(bankAccounts).set({ availableBalance: minorUnitsToMoney(signedMoneyToMinorUnits(account.available_balance) + moneyToMinorUnits(hold.amount)), updatedAt: now }).where(eq(bankAccounts.id, account.id));
        await tx.update(accountHolds).set({ status: "EXPIRED", releasedAt: now, releaseReason: "Payment approval expired", updatedAt: now }).where(eq(accountHolds.id, hold.id));
      }
      await tx.update(paymentOrders).set({ status: "EXPIRED", decidedAt: now, decisionComment: "Approval window expired after 24 hours" }).where(eq(paymentOrders.id, payment.id));
      await tx.execute(sql`update work_items set status = 'CANCELLED', completed_at = ${now}, updated_at = ${now}, version = version + 1 where entity_type = 'PAYMENT' and entity_reference = ${candidate.reference} and status in ('OPEN', 'ASSIGNED')`);
    });
  }
  return expired.length;
}
