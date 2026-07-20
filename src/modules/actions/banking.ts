"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  accountStatusHistory, addresses, auditEvents, bankAccounts, beneficiaries, branches, clearingAccounts,
  clearingEntries, contactPoints, customers, ledgerEntries, ledgerTransactions, paymentOrders, products,
} from "@/db/schema";
import { resetBaseline } from "@/db/seed";
import { requireActionUser } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { moneyToMinorUnits, minorUnitsToMoney } from "@/modules/domain/transfer-policy";
import { BankingError, bookExternalPayment, bookInternalTransfer } from "@/modules/services/payments";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const optionalText = (formData: FormData, key: string) => text(formData, key) || null;
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places");

function invalid(error: z.ZodError): ActionState {
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened)) {
    if (Array.isArray(messages) && messages.length) fieldErrors[field] = messages.map(String);
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "Correct the highlighted fields and try again.",
    fieldErrors,
  };
}

function failure(error: unknown): ActionState {
  if (error instanceof BankingError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) {
    return { ok: false, code: error.message, message: error.message === "FORBIDDEN" ? "You are not authorized to perform this action." : "Your session has expired. Sign in again." };
  }
  return { ok: false, code: "UNEXPECTED_ERROR", message: "The operation could not be completed." };
}

async function audit(actor: { id: string; username: string }, action: string, entityType: string, entityReference: string, before: unknown, after: unknown) {
  await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action, entityType, entityReference, correlationId: crypto.randomUUID(), before, after });
}

const customerSchema = z.object({
  partyType: z.enum(["RETAIL", "SME"]), title: z.string().nullable(), givenName: z.string().nullable(), familyName: z.string().nullable(),
  legalName: z.string().nullable(), shortName: z.string().min(2), dateOfBirth: z.string().nullable(), registrationNumber: z.string().nullable(),
  gender: z.string().nullable(), maritalStatus: z.string().nullable(), nationality: z.string().length(2), residenceCountry: z.string().length(2),
  language: z.string().min(2), sector: z.string().min(2), industry: z.string().min(2), kycStatus: z.enum(["COMPLETE", "DUE", "REVIEW"]),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH"]), kycReviewDate: z.string().min(10), taxId: z.string().min(3), branchCode: z.string().min(3), relationshipManager: z.string().min(2),
  addressLine1: z.string().min(3), addressLine2: z.string().nullable(), city: z.string().min(2), region: z.string().nullable(), postalCode: z.string().min(2), country: z.string().length(2),
  email: z.email(), phone: z.string().min(7),
}).superRefine((value, context) => {
  if (value.partyType === "RETAIL" && (!value.givenName || !value.familyName || !value.dateOfBirth)) context.addIssue({ code: "custom", path: ["givenName"], message: "Retail customers require given name, family name, and date of birth" });
  if (value.partyType === "SME" && (!value.legalName || !value.registrationNumber)) context.addIssue({ code: "custom", path: ["legalName"], message: "SME customers require legal name and registration number" });
});

function customerForm(formData: FormData) {
  const residenceCountry = text(formData, "residenceCountry").toUpperCase();
  return {
    partyType: text(formData, "partyType"), title: optionalText(formData, "title"), givenName: optionalText(formData, "givenName"), familyName: optionalText(formData, "familyName"),
    legalName: optionalText(formData, "legalName"), shortName: text(formData, "shortName"), dateOfBirth: optionalText(formData, "dateOfBirth"), registrationNumber: optionalText(formData, "registrationNumber"),
    gender: optionalText(formData, "gender"), maritalStatus: optionalText(formData, "maritalStatus"), nationality: text(formData, "nationality").toUpperCase(), residenceCountry,
    language: text(formData, "language") || "English", sector: text(formData, "sector"), industry: text(formData, "industry"), kycStatus: text(formData, "kycStatus"), riskRating: text(formData, "riskRating"),
    kycReviewDate: text(formData, "kycReviewDate") || new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10), taxId: text(formData, "taxId") || "AUTO", branchCode: text(formData, "branchCode") || (residenceCountry === "AE" ? "DXB001" : "LON001"), relationshipManager: text(formData, "relationshipManager"),
    addressLine1: text(formData, "addressLine1"), addressLine2: optionalText(formData, "addressLine2"), city: text(formData, "city"), region: optionalText(formData, "region"), postalCode: text(formData, "postalCode"), country: (text(formData, "country") || residenceCountry).toUpperCase(),
    email: text(formData, "email").toLowerCase(), phone: text(formData, "phone"),
  };
}

export async function createCustomerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = customerSchema.safeParse(customerForm(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const actor = await requireActionUser();
    const customerNumber = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(738_204_020)`);
      const result = await tx.execute(sql`select coalesce(max(substring(customer_number from 2)::int), 0)::int as max_number from customers`);
      const rows = result.rows as unknown as Array<{ max_number: number }>;
      const next = `C${(Number(rows[0]?.max_number ?? 0) + 1).toString().padStart(6, "0")}`;
      const value = parsed.data;
      const [created] = await tx.insert(customers).values({
        customerNumber: next, partyType: value.partyType, title: value.title, givenName: value.givenName, familyName: value.familyName,
        legalName: value.legalName, shortName: value.shortName, dateOfBirth: value.dateOfBirth, registrationNumber: value.registrationNumber,
        gender: value.gender, maritalStatus: value.maritalStatus, nationality: value.nationality, residenceCountry: value.residenceCountry,
        language: value.language, sector: value.sector, industry: value.industry, kycStatus: value.kycStatus, riskRating: value.riskRating,
        kycReviewDate: value.kycReviewDate, taxId: value.taxId === "AUTO" ? `FIC-${next}` : value.taxId, branchCode: value.branchCode, relationshipManager: value.relationshipManager,
      }).returning();
      await tx.insert(addresses).values({ customerId: created.id, type: "PRIMARY", line1: value.addressLine1, line2: value.addressLine2, city: value.city, region: value.region, postalCode: value.postalCode, country: value.country });
      await tx.insert(contactPoints).values([
        { customerId: created.id, type: "EMAIL", value: value.email, preferred: true },
        { customerId: created.id, type: "MOBILE", value: value.phone, preferred: false },
      ]);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "CUSTOMER_CREATED", entityType: "CUSTOMER", entityReference: next, correlationId: crypto.randomUUID(), before: null, after: { shortName: value.shortName, partyType: value.partyType } });
      return next;
    });
    revalidatePath("/customers");
    return { ok: true, code: "CUSTOMER_CREATED", message: `Customer ${customerNumber} was created.` };
  } catch (error) { return failure(error); }
}

const customerUpdateSchema = z.object({
  partyType: z.enum(["RETAIL", "SME"]), title: z.string().nullable(), givenName: z.string().nullable(), familyName: z.string().nullable(), legalName: z.string().nullable(),
  shortName: z.string().min(2), dateOfBirth: z.string().nullable(), registrationNumber: z.string().nullable(), nationality: z.string().length(2), residenceCountry: z.string().length(2),
  status: z.enum(["ACTIVE", "INACTIVE", "RESTRICTED"]), kycStatus: z.enum(["COMPLETE", "DUE", "REVIEW"]), riskRating: z.enum(["LOW", "MEDIUM", "HIGH"]),
  kycReviewDate: z.string().min(10), language: z.string().min(2), taxId: z.string().min(3), branchCode: z.string().min(3), relationshipManager: z.string().min(2), sector: z.string().min(2), industry: z.string().min(2),
  addressLine1: z.string().min(3), city: z.string().min(2), postalCode: z.string().min(2), country: z.string().length(2), email: z.email(), phone: z.string().min(7),
});

export async function updateCustomerAction(customerNumber: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = customerUpdateSchema.safeParse({ partyType: text(formData, "partyType"), title: optionalText(formData, "title"), givenName: optionalText(formData, "givenName"), familyName: optionalText(formData, "familyName"), legalName: optionalText(formData, "legalName"), shortName: text(formData, "shortName"), dateOfBirth: optionalText(formData, "dateOfBirth"), registrationNumber: optionalText(formData, "registrationNumber"), nationality: text(formData, "nationality").toUpperCase(), residenceCountry: text(formData, "residenceCountry").toUpperCase(), status: text(formData, "status"), kycStatus: text(formData, "kycStatus"), riskRating: text(formData, "riskRating"), kycReviewDate: text(formData, "kycReviewDate"), language: text(formData, "language"), taxId: text(formData, "taxId"), branchCode: text(formData, "branchCode"), relationshipManager: text(formData, "relationshipManager"), sector: text(formData, "sector"), industry: text(formData, "industry"), addressLine1: text(formData, "addressLine1"), city: text(formData, "city"), postalCode: text(formData, "postalCode"), country: text(formData, "country").toUpperCase(), email: text(formData, "email").toLowerCase(), phone: text(formData, "phone") });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const actor = await requireActionUser();
    const [existing] = await db.select().from(customers).where(eq(customers.customerNumber, customerNumber)).limit(1);
    if (!existing) return { ok: false, code: "CUSTOMER_NOT_FOUND", message: "Customer not found." };
    const { addressLine1, city, postalCode, country, email, phone, ...customerValues } = parsed.data;
    await db.transaction(async (tx) => {
      await tx.update(customers).set({ ...customerValues, updatedAt: new Date() }).where(eq(customers.id, existing.id));
      await tx.update(addresses).set({ line1: addressLine1, city, postalCode, country, updatedAt: new Date() }).where(and(eq(addresses.customerId, existing.id), eq(addresses.type, "PRIMARY")));
      await tx.update(contactPoints).set({ value: email, updatedAt: new Date() }).where(and(eq(contactPoints.customerId, existing.id), eq(contactPoints.type, "EMAIL")));
      await tx.update(contactPoints).set({ value: phone, updatedAt: new Date() }).where(and(eq(contactPoints.customerId, existing.id), eq(contactPoints.type, "MOBILE")));
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "CUSTOMER_UPDATED", entityType: "CUSTOMER", entityReference: customerNumber, correlationId: crypto.randomUUID(), before: { shortName: existing.shortName, kycStatus: existing.kycStatus, riskRating: existing.riskRating }, after: customerValues });
    });
    revalidatePath(`/customers/${customerNumber}`); revalidatePath("/customers");
    return { ok: true, code: "CUSTOMER_UPDATED", message: `Customer ${customerNumber} was updated.` };
  } catch (error) { return failure(error); }
}

const openAccountSchema = z.object({ customerNumber: z.string().min(2), productCode: z.string().min(2), branchCode: z.string().min(3), nickname: z.string().nullable(), initialDeposit: money });

export async function openAccountAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = openAccountSchema.safeParse({ customerNumber: text(formData, "customerNumber"), productCode: text(formData, "productCode"), branchCode: text(formData, "branchCode"), nickname: optionalText(formData, "nickname"), initialDeposit: text(formData, "openingBalance") || text(formData, "initialDeposit") || "0.00" });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const actor = await requireActionUser();
    const accountNumber = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(738_204_021)`);
      const [[customer], [product], [branch]] = await Promise.all([
        tx.select().from(customers).where(eq(customers.customerNumber, parsed.data.customerNumber)).limit(1),
        tx.select().from(products).where(and(eq(products.code, parsed.data.productCode), eq(products.active, true))).limit(1),
        tx.select().from(branches).where(eq(branches.code, parsed.data.branchCode)).limit(1),
      ]);
      if (!customer) throw new BankingError("CUSTOMER_NOT_FOUND", "Customer not found.");
      if (!product) throw new BankingError("PRODUCT_NOT_FOUND", "Product not found or inactive.");
      const selectedBranch = branch;
      if (!selectedBranch) throw new BankingError("BRANCH_NOT_FOUND", "Branch not found.");
      if (moneyToMinorUnits(parsed.data.initialDeposit) < moneyToMinorUnits(product.minimumOpeningBalance)) throw new BankingError("MINIMUM_BALANCE", `Minimum opening balance is ${product.minimumOpeningBalance} ${product.currency}.`);
      const result = await tx.execute(sql`select coalesce(max(account_number::bigint), 1000000000)::text as max_number from bank_accounts`);
      const numberRows = result.rows as unknown as Array<{ max_number: string }>;
      const next = (BigInt(numberRows[0]?.max_number ?? "1000000000") + 1n).toString();
      const [created] = await tx.insert(bankAccounts).values({ accountNumber: next, customerId: customer.id, productId: product.id, branchId: selectedBranch.id, nickname: parsed.data.nickname, currency: product.currency, balance: parsed.data.initialDeposit, availableBalance: parsed.data.initialDeposit, status: "ACTIVE", readOnly: product.kind === "LOAN", openedAt: new Date().toISOString().slice(0, 10) }).returning();
      await tx.insert(accountStatusHistory).values({ accountId: created.id, previousStatus: null, newStatus: "ACTIVE", reason: "Account opened", changedBy: actor.username });
      const deposit = moneyToMinorUnits(parsed.data.initialDeposit);
      if (deposit > 0n) {
        const clearingResult = await tx.execute(sql`select id, balance from clearing_accounts where currency = ${product.currency} order by code limit 1 for update`);
        const clearing = (clearingResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
        if (!clearing) throw new BankingError("CLEARING_UNAVAILABLE", "Opening deposit clearing is unavailable.");
        const clearingAfter = minorUnitsToMoney(moneyToMinorUnits(clearing.balance) - deposit);
        const [transaction] = await tx.insert(ledgerTransactions).values({ reference: `OPEN-${next}`, bookedAt: new Date(), valueDate: new Date().toISOString().slice(0, 10), description: "Opening deposit", type: "OPENING_DEPOSIT", status: "BOOKED", currency: product.currency, amount: parsed.data.initialDeposit, counterparty: "Opening Deposit Clearing" }).returning();
        await tx.insert(ledgerEntries).values({ transactionId: transaction.id, accountId: created.id, direction: "CREDIT", amount: parsed.data.initialDeposit, balanceAfter: parsed.data.initialDeposit });
        await tx.insert(clearingEntries).values({ transactionId: transaction.id, clearingAccountId: clearing.id, direction: "DEBIT", amount: parsed.data.initialDeposit, balanceAfter: clearingAfter });
        await tx.update(clearingAccounts).set({ balance: clearingAfter, updatedAt: new Date() }).where(eq(clearingAccounts.id, clearing.id));
      }
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "ACCOUNT_OPENED", entityType: "ACCOUNT", entityReference: next, correlationId: crypto.randomUUID(), before: null, after: { customerNumber: customer.customerNumber, productCode: product.code, balance: parsed.data.initialDeposit } });
      return next;
    });
    revalidatePath("/accounts");
    return { ok: true, code: "ACCOUNT_OPENED", message: `Account ${accountNumber} was opened.` };
  } catch (error) { return failure(error); }
}

const statusSchema = z.object({ status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]), reason: z.string().min(3) });
export async function updateAccountStatusAction(accountNumber: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse({ status: text(formData, "status"), reason: text(formData, "reason") });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const actor = await requireActionUser();
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, status, balance, read_only from bank_accounts where account_number = ${accountNumber} for update`);
      const existing = (result.rows as unknown as Array<{ id: string; status: "ACTIVE" | "BLOCKED" | "CLOSED"; balance: string; read_only: boolean }>)[0];
      if (!existing) throw new BankingError("ACCOUNT_NOT_FOUND", "Account not found.");
      if (existing.read_only) throw new BankingError("READ_ONLY_ACCOUNT", "Loan accounts are read-only.");
      if (parsed.data.status === "CLOSED") {
        if (moneyToMinorUnits(existing.balance) !== 0n) throw new BankingError("NON_ZERO_BALANCE", "An account must have a zero balance before it can be closed.");
        const [pending] = await tx.select({ value: sql<number>`count(*)::int` }).from(paymentOrders).where(and(eq(paymentOrders.sourceAccountId, existing.id), eq(paymentOrders.status, "PENDING")));
        if (pending.value > 0) throw new BankingError("PENDING_PAYMENTS", "Pending payments must be resolved before closing the account.");
      }
      await tx.update(bankAccounts).set({ status: parsed.data.status, closedAt: parsed.data.status === "CLOSED" ? new Date() : null, updatedAt: new Date() }).where(eq(bankAccounts.id, existing.id));
      await tx.insert(accountStatusHistory).values({ accountId: existing.id, previousStatus: existing.status, newStatus: parsed.data.status, reason: parsed.data.reason, changedBy: actor.username });
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "ACCOUNT_STATUS_UPDATED", entityType: "ACCOUNT", entityReference: accountNumber, correlationId: crypto.randomUUID(), before: { status: existing.status }, after: parsed.data });
    });
    revalidatePath(`/accounts/${accountNumber}`); revalidatePath("/accounts");
    return { ok: true, code: "ACCOUNT_STATUS_UPDATED", message: `Account ${accountNumber} is now ${parsed.data.status.toLowerCase()}.` };
  } catch (error) { return failure(error); }
}

const beneficiarySchema = z.object({ customerNumber: z.string().min(2), name: z.string().min(2), bankName: z.string().min(2), accountNumber: z.string().min(4), iban: z.string().nullable(), swiftBic: z.string().nullable(), currency: z.string().length(3) });
export async function createBeneficiaryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = beneficiarySchema.safeParse({ customerNumber: text(formData, "customerNumber"), name: text(formData, "name"), bankName: text(formData, "bankName"), accountNumber: text(formData, "accountNumber"), iban: optionalText(formData, "iban"), swiftBic: optionalText(formData, "swiftBic"), currency: text(formData, "currency").toUpperCase() });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const actor = await requireActionUser();
    const [customer] = await db.select().from(customers).where(eq(customers.customerNumber, parsed.data.customerNumber)).limit(1);
    if (!customer) return { ok: false, code: "CUSTOMER_NOT_FOUND", message: "Customer not found." };
    const [created] = await db.insert(beneficiaries).values({ customerId: customer.id, name: parsed.data.name, bankName: parsed.data.bankName, accountNumber: parsed.data.accountNumber, iban: parsed.data.iban, swiftBic: parsed.data.swiftBic, currency: parsed.data.currency, status: "ACTIVE" }).returning();
    await audit(actor, "BENEFICIARY_CREATED", "BENEFICIARY", created.id, null, parsed.data);
    revalidatePath("/beneficiaries");
    return { ok: true, code: "BENEFICIARY_CREATED", message: `Beneficiary ${created.name} was created.` };
  } catch (error) { return failure(error); }
}

export async function updateBeneficiaryAction(beneficiaryId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActionUser();
    const [existing] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, beneficiaryId)).limit(1);
    if (!existing) return { ok: false, code: "BENEFICIARY_NOT_FOUND", message: "Beneficiary not found." };
    const status = z.enum(["ACTIVE", "INACTIVE"]).safeParse(text(formData, "status"));
    if (!status.success) return invalid(status.error);
    await db.update(beneficiaries).set({ status: status.data, updatedAt: new Date() }).where(eq(beneficiaries.id, beneficiaryId));
    await audit(actor, "BENEFICIARY_UPDATED", "BENEFICIARY", beneficiaryId, { status: existing.status }, { status: status.data });
    revalidatePath("/beneficiaries");
    return { ok: true, code: "BENEFICIARY_UPDATED", message: `Beneficiary ${existing.name} was updated.` };
  } catch (error) { return failure(error); }
}

const paymentSchema = z.object({ paymentType: z.enum(["INTERNAL", "EXTERNAL"]), sourceAccountNumber: z.string().min(4), destinationAccountNumber: z.string().nullable(), beneficiaryId: z.string().nullable(), amount: money, description: z.string().min(3).max(140), idempotencyKey: z.string().min(8).max(100) });
export async function submitPaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paymentSchema.safeParse({ paymentType: text(formData, "paymentType"), sourceAccountNumber: text(formData, "sourceAccountNumber") || text(formData, "fromAccountNumber"), destinationAccountNumber: optionalText(formData, "destinationAccountNumber") ?? optionalText(formData, "toAccountNumber"), beneficiaryId: optionalText(formData, "beneficiaryId"), amount: text(formData, "amount"), description: text(formData, "description") || text(formData, "reference"), idempotencyKey: text(formData, "idempotencyKey") });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const actor = await requireActionUser();
    const base = { sourceAccountNumber: parsed.data.sourceAccountNumber, amount: parsed.data.amount, description: parsed.data.description, idempotencyKey: parsed.data.idempotencyKey };
    const result = parsed.data.paymentType === "INTERNAL"
      ? await bookInternalTransfer({ ...base, destinationAccountNumber: parsed.data.destinationAccountNumber ?? "" }, actor)
      : await bookExternalPayment({ ...base, beneficiaryId: parsed.data.beneficiaryId ?? "" }, actor);
    revalidatePath("/payments"); revalidatePath("/accounts");
    return { ok: true, code: result.duplicate ? "PAYMENT_ALREADY_BOOKED" : "PAYMENT_BOOKED", message: result.duplicate ? `Payment ${result.reference} was already booked; no duplicate was created.` : `Payment ${result.reference} was booked.` };
  } catch (error) { return failure(error); }
}

export async function resetDemoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (text(formData, "confirmation") !== "RESET FUTUREBANK") return { ok: false, code: "CONFIRMATION_REQUIRED", message: "Enter RESET FUTUREBANK exactly to confirm.", fieldErrors: { confirmation: ["Confirmation phrase does not match"] } };
  try {
    const actor = await requireActionUser("ADMIN");
    await resetBaseline(db, actor);
    revalidatePath("/", "layout");
    return { ok: true, code: "DEMO_RESET", message: "The FutureBank baseline has been restored." };
  } catch (error) { return failure(error); }
}
