"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  accountHolds, auditEvents, bankAccounts, customerRestrictions, overdraftAlerts, overdraftFacilities,
  overdraftLimitHistory, workItemEvents, workItems,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { projectedAvailableBalance, validateLimitReduction } from "@/modules/domain/overdraft-policy";
import { BankingError } from "@/modules/services/errors";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "@/modules/services/workflow";
import { failedAction, formText, invalidAction } from "./action-utils";

const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);

export async function applyForOverdraftAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ accountNumber: z.string().min(10), requestedLimit: money, annualInterestRate: z.string().regex(/^\d+(?:\.\d{1,4})?$/), purpose: z.string().min(5), monthlyIncomeOrTurnover: money, monthlyCommittedOutgoings: money, riskGrade: z.string().min(1).max(3) }).safeParse({ accountNumber: formText(formData, "accountNumber"), requestedLimit: formText(formData, "requestedLimit"), annualInterestRate: formText(formData, "annualInterestRate"), purpose: formText(formData, "purpose"), monthlyIncomeOrTurnover: formText(formData, "monthlyIncomeOrTurnover"), monthlyCommittedOutgoings: formText(formData, "monthlyCommittedOutgoings"), riskGrade: formText(formData, "riskGrade").toUpperCase() });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("OVERDRAFT_INITIATE");
    const reference = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(738_204_032)`);
      const result = await tx.execute(sql`
        select a.id, a.customer_id, a.currency, a.status, p.kind, c.kyc_status
        from bank_accounts a join products p on p.id = a.product_id join customers c on c.id = a.customer_id
        where a.account_number = ${parsed.data.accountNumber} for update
      `);
      const account = (result.rows as unknown as Array<{ id: string; customer_id: string; currency: string; status: string; kind: string; kyc_status: string }>)[0];
      if (!account) throw new BankingError("ACCOUNT_NOT_FOUND", "Account not found.");
      if (account.kind !== "CURRENT" || account.status !== "ACTIVE") throw new BankingError("OVERDRAFT_INELIGIBLE", "Only active current accounts are eligible for arranged overdrafts.");
      if (account.kyc_status !== "APPROVED") throw new BankingError("KYC_NOT_APPROVED", "KYC must be approved before creating or increasing an overdraft.");
      const restrictions = await tx.select().from(customerRestrictions).where(and(eq(customerRestrictions.customerId, account.customer_id), eq(customerRestrictions.active, true), eq(customerRestrictions.type, "DEBIT_BLOCK")));
      if (restrictions.length) throw new BankingError("DEBITS_RESTRICTED", "An active debit restriction prevents overdraft changes.");
      const active = await tx.execute(sql`select reference from overdraft_facilities where account_id = ${account.id} and status not in ('DECLINED', 'EXPIRED', 'CLOSED') for update`);
      if (active.rows.length) throw new BankingError("FACILITY_EXISTS", "This account already has a current overdraft facility or application.");
      const sequence = await tx.execute(sql`select coalesce(max(substring(reference from 5)::int), 0)::int + 1 as next from overdraft_facilities where reference ~ '^ODF-[0-9]+$'`);
      const next = Number((sequence.rows as Array<{ next: number }>)[0]?.next ?? 1);
      const reference = `ODF-${next.toString().padStart(6, "0")}`;
      await tx.insert(overdraftFacilities).values({
        reference, accountId: account.id, requestedLimit: parsed.data.requestedLimit, currency: account.currency,
        annualInterestRate: parsed.data.annualInterestRate, purpose: parsed.data.purpose,
        affordabilityInformation: { monthlyIncomeOrTurnover: parsed.data.monthlyIncomeOrTurnover, monthlyCommittedOutgoings: parsed.data.monthlyCommittedOutgoings, fictional: true },
        riskGrade: parsed.data.riskGrade, status: "PENDING_APPROVAL", createdBy: actor.id, submittedAt: new Date(),
      });
      await createApprovalWorkItem(tx, { type: "OVERDRAFT_APPROVAL", entityType: "OVERDRAFT", entityReference: reference, title: `Approve overdraft ${reference}`, description: `Requested limit ${parsed.data.requestedLimit} ${account.currency}; review affordability and KYC.`, requiredRole: "SUPERVISOR", dueAt: new Date(Date.now() + 2 * 86_400_000) }, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "OVERDRAFT_SUBMITTED", entityType: "OVERDRAFT", entityReference: reference, correlationId: crypto.randomUUID(), before: null, after: parsed.data });
      return reference;
    });
    revalidatePath("/overdrafts"); revalidatePath("/work-queue");
    return { ok: true, code: "OVERDRAFT_SUBMITTED", message: `Overdraft application ${reference} was submitted for independent approval.` };
  } catch (error) { return failedAction(error); }
}

export async function requestOverdraftLimitChangeAction(facilityReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ requestedLimit: money, reason: z.string().min(5) }).safeParse({ requestedLimit: formText(formData, "requestedLimit"), reason: formText(formData, "reason") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("OVERDRAFT_INITIATE");
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, account_id, status, approved_limit, version from overdraft_facilities where reference = ${facilityReference} for update`);
      const facility = (result.rows as unknown as Array<{ id: string; account_id: string; status: string; approved_limit: string; version: number }>)[0];
      if (!facility || facility.status !== "ACTIVE") throw new BankingError("FACILITY_NOT_ACTIVE", "Only an active facility can be changed.");
      const accountResult = await tx.execute(sql`select balance from bank_accounts where id = ${facility.account_id} for update`);
      const account = (accountResult.rows as unknown as Array<{ balance: string }>)[0];
      const [holds] = await tx.select({ value: sql<string>`coalesce(sum(${accountHolds.amount}) filter (where ${accountHolds.status} = 'ACTIVE'), 0)::text` }).from(accountHolds).where(eq(accountHolds.accountId, facility.account_id));
      if (!validateLimitReduction(parsed.data.requestedLimit, account.balance, holds.value)) throw new BankingError("LIMIT_BELOW_COMMITMENTS", "The new limit cannot be below current utilization plus active holds.");
      await tx.update(overdraftFacilities).set({ requestedLimit: parsed.data.requestedLimit, status: "PENDING_CHANGE", version: facility.version + 1, updatedAt: new Date() }).where(eq(overdraftFacilities.id, facility.id));
      await createApprovalWorkItem(tx, { type: "OVERDRAFT_CHANGE", entityType: "OVERDRAFT", entityReference: facilityReference, title: `Approve limit change ${facilityReference}`, description: `${parsed.data.reason}; requested limit ${parsed.data.requestedLimit}.`, requiredRole: "SUPERVISOR", dueAt: new Date(Date.now() + 2 * 86_400_000) }, actor);
    });
    revalidatePath(`/overdrafts/${facilityReference}`); revalidatePath("/work-queue");
    return { ok: true, code: "OVERDRAFT_CHANGE_SUBMITTED", message: "The limit change was submitted for independent approval." };
  } catch (error) { return failedAction(error); }
}

export async function decideOverdraftAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ entityReference: z.string().min(5), workItemReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(), decision: z.enum(["APPROVE", "DECLINE"]), comment: z.string().min(5) }).safeParse({ entityReference: formText(formData, "entityReference"), workItemReference: formText(formData, "workItemReference"), expectedVersion: formText(formData, "expectedVersion"), decision: formText(formData, "decision"), comment: formText(formData, "comment") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("OVERDRAFT_DECIDE");
    await db.transaction(async (tx) => {
      const item = await lockApprovalWorkItem(tx, { reference: parsed.data.workItemReference, entityType: "OVERDRAFT", entityReference: parsed.data.entityReference, expectedVersion: parsed.data.expectedVersion }, actor);
      const result = await tx.execute(sql`
        select f.id, f.account_id, f.status, f.requested_limit, f.approved_limit, f.currency, f.version,
               a.balance, a.customer_id, a.status as account_status, p.kind, c.kyc_status
        from overdraft_facilities f join bank_accounts a on a.id = f.account_id join products p on p.id = a.product_id join customers c on c.id = a.customer_id
        where f.reference = ${parsed.data.entityReference} for update
      `);
      const facility = (result.rows as unknown as Array<{ id: string; account_id: string; status: string; requested_limit: string; approved_limit: string; currency: string; version: number; balance: string; customer_id: string; account_status: string; kind: string; kyc_status: string }>)[0];
      if (!facility || !["PENDING_APPROVAL", "PENDING_CHANGE"].includes(facility.status)) throw new BankingError("OVERDRAFT_NOT_PENDING", "The facility is not pending a decision.");
      const approved = parsed.data.decision === "APPROVE";
      if (approved) {
        if (facility.kind !== "CURRENT" || facility.account_status !== "ACTIVE") throw new BankingError("OVERDRAFT_INELIGIBLE", "The account is no longer eligible.");
        if (facility.kyc_status !== "APPROVED") throw new BankingError("KYC_NOT_APPROVED", "KYC must be approved at the time of decision.");
        const restrictions = await tx.select().from(customerRestrictions).where(and(eq(customerRestrictions.customerId, facility.customer_id), eq(customerRestrictions.active, true), eq(customerRestrictions.type, "DEBIT_BLOCK")));
        if (restrictions.length) throw new BankingError("DEBITS_RESTRICTED", "An active debit restriction prevents approval.");
        const [holds] = await tx.select({ value: sql<string>`coalesce(sum(${accountHolds.amount}) filter (where ${accountHolds.status} = 'ACTIVE'), 0)::text` }).from(accountHolds).where(eq(accountHolds.accountId, facility.account_id));
        if (!validateLimitReduction(facility.requested_limit, facility.balance, holds.value)) throw new BankingError("LIMIT_BELOW_COMMITMENTS", "The requested limit is below utilization plus active holds.");
        const today = new Date();
        const review = new Date(today); review.setUTCFullYear(review.getUTCFullYear() + 1);
        const expiry = new Date(today); expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
        await tx.update(overdraftFacilities).set({ status: "ACTIVE", approvedLimit: facility.requested_limit, startDate: facility.status === "PENDING_APPROVAL" ? today.toISOString().slice(0, 10) : undefined, reviewDate: review.toISOString().slice(0, 10), expiryDate: expiry.toISOString().slice(0, 10), approvedBy: actor.id, decisionComment: parsed.data.comment, decidedAt: new Date(), version: facility.version + 1, updatedAt: new Date() }).where(eq(overdraftFacilities.id, facility.id));
        await tx.insert(overdraftLimitHistory).values({ facilityId: facility.id, previousLimit: facility.approved_limit, newLimit: facility.requested_limit, reason: parsed.data.comment, effectiveDate: today.toISOString().slice(0, 10), approvedBy: actor.id });
        await tx.update(bankAccounts).set({ availableBalance: projectedAvailableBalance(facility.balance, facility.requested_limit, holds.value, "ACTIVE"), updatedAt: new Date() }).where(eq(bankAccounts.id, facility.account_id));
      } else {
        await tx.update(overdraftFacilities).set({ status: facility.status === "PENDING_CHANGE" ? "ACTIVE" : "DECLINED", requestedLimit: facility.status === "PENDING_CHANGE" ? facility.approved_limit : facility.requested_limit, approvedBy: actor.id, decisionComment: parsed.data.comment, decidedAt: new Date(), version: facility.version + 1, updatedAt: new Date() }).where(eq(overdraftFacilities.id, facility.id));
      }
      await decideWorkItem(tx, item, approved ? "APPROVED" : "REJECTED", parsed.data.comment, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: approved ? "OVERDRAFT_APPROVED" : "OVERDRAFT_DECLINED", entityType: "OVERDRAFT", entityReference: parsed.data.entityReference, correlationId: crypto.randomUUID(), before: { status: facility.status }, after: { status: approved ? "ACTIVE" : "DECLINED", limit: facility.requested_limit } });
    });
    revalidatePath(`/overdrafts/${parsed.data.entityReference}`); revalidatePath("/overdrafts"); revalidatePath("/work-queue"); revalidatePath("/accounts");
    return { ok: true, code: parsed.data.decision === "APPROVE" ? "OVERDRAFT_APPROVED" : "OVERDRAFT_DECLINED", message: `Overdraft ${parsed.data.entityReference} was ${parsed.data.decision === "APPROVE" ? "approved" : "declined"}.` };
  } catch (error) { return failedAction(error); }
}

export async function setOverdraftStatusAction(facilityReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ action: z.enum(["SUSPEND", "CLOSE"]), reason: z.string().min(5) }).safeParse({ action: formText(formData, "action"), reason: formText(formData, "reason") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("OVERDRAFT_DECIDE");
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, account_id, approved_limit, status from overdraft_facilities where reference = ${facilityReference} for update`);
      const facility = (result.rows as unknown as Array<{ id: string; account_id: string; approved_limit: string; status: string }>)[0];
      if (!facility || !["ACTIVE", "SUSPENDED"].includes(facility.status)) throw new BankingError("FACILITY_NOT_ACTIVE", "The facility cannot be changed from its current state.");
      const accountResult = await tx.execute(sql`select id, balance from bank_accounts where id = ${facility.account_id} for update`);
      const account = (accountResult.rows as unknown as Array<{ id: string; balance: string }>)[0];
      const [holds] = await tx.select({ value: sql<string>`coalesce(sum(${accountHolds.amount}) filter (where ${accountHolds.status} = 'ACTIVE'), 0)::text` }).from(accountHolds).where(eq(accountHolds.accountId, facility.account_id));
      if (parsed.data.action === "CLOSE" && !validateLimitReduction("0.00", account.balance, holds.value)) throw new BankingError("FACILITY_IN_USE", "Clear utilization and holds before closing the facility.");
      const status = parsed.data.action === "SUSPEND" ? "SUSPENDED" as const : "CLOSED" as const;
      await tx.update(overdraftFacilities).set({ status, decisionComment: parsed.data.reason, updatedAt: new Date() }).where(eq(overdraftFacilities.id, facility.id));
      await tx.update(bankAccounts).set({ availableBalance: projectedAvailableBalance(account.balance, facility.approved_limit, holds.value, status), updatedAt: new Date() }).where(eq(bankAccounts.id, account.id));
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: `OVERDRAFT_${status}`, entityType: "OVERDRAFT", entityReference: facilityReference, correlationId: crypto.randomUUID(), before: { status: facility.status }, after: { status, reason: parsed.data.reason } });
    });
    revalidatePath(`/overdrafts/${facilityReference}`); revalidatePath("/accounts");
    const outcome = parsed.data.action === "SUSPEND" ? "suspended" : "closed";
    return { ok: true, code: `OVERDRAFT_${parsed.data.action}`, message: `The facility was ${outcome}.` };
  } catch (error) { return failedAction(error); }
}

export async function resolveOverdraftAlertAction(alertReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ intervention: z.enum(["CONTACT_ATTEMPTED", "CUSTOMER_CONTACTED", "REPAYMENT_DISCUSSION", "LIMIT_REVIEW", "SUSPENSION", "NO_ACTION"]), comment: z.string().min(5) }).safeParse({ intervention: formText(formData, "intervention"), comment: formText(formData, "comment") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("OVERDRAFT_ALERT_RESOLVE");
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, status from overdraft_alerts where reference = ${alertReference} for update`);
      const alert = (result.rows as unknown as Array<{ id: string; status: string }>)[0];
      if (!alert || alert.status === "RESOLVED") throw new BankingError("ALERT_NOT_OPEN", "The alert is not open.");
      await tx.update(overdraftAlerts).set({ status: "RESOLVED", intervention: parsed.data.intervention, resolutionComment: parsed.data.comment, resolvedBy: actor.id, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(overdraftAlerts.id, alert.id));
      const work = await tx.select().from(workItems).where(and(eq(workItems.entityType, "OVERDRAFT_ALERT"), eq(workItems.entityReference, alertReference))).limit(1);
      if (work[0] && ["OPEN", "ASSIGNED"].includes(work[0].status)) {
        await tx.update(workItems).set({ status: "COMPLETED", completedAt: new Date(), decisionComment: parsed.data.comment, version: work[0].version + 1, updatedAt: new Date() }).where(eq(workItems.id, work[0].id));
        await tx.insert(workItemEvents).values({ workItemId: work[0].id, eventType: "COMPLETED", fromStatus: work[0].status as "OPEN" | "ASSIGNED", toStatus: "COMPLETED", actorUserId: actor.id, actorUsername: actor.username, comment: parsed.data.comment });
      }
    });
    revalidatePath("/overdrafts"); revalidatePath("/work-queue");
    return { ok: true, code: "OVERDRAFT_ALERT_RESOLVED", message: `Alert ${alertReference} was resolved.` };
  } catch (error) { return failedAction(error); }
}
