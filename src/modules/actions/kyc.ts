"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditEvents, customerDueDiligenceProfiles, customerRestrictions, customers, kycCases, kycEvidence,
  screeningChecks, screeningWatchlistEntries,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState, RiskRating } from "@/modules/contracts";
import { canSubmitKyc, nextReviewDate, requirementsFor } from "@/modules/domain/kyc-policy";
import { BankingError } from "@/modules/services/errors";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "@/modules/services/workflow";
import { failedAction, formText, invalidAction, optionalFormText } from "./action-utils";

const decisionSchema = z.object({
  entityReference: z.string().min(5), workItemReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().min(5), finalRiskRating: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(), overrideReason: z.string().nullable(),
});

export async function openKycCaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ customerNumber: z.string().min(7), type: z.enum(["ONBOARDING", "PERIODIC_REVIEW", "TRIGGER_EVENT", "REMEDIATION"]) }).safeParse({ customerNumber: formText(formData, "customerNumber"), type: formText(formData, "caseType") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("KYC_GATHER");
    const reference = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(738_204_031)`);
      const [customer] = await tx.select().from(customers).where(eq(customers.customerNumber, parsed.data.customerNumber)).limit(1);
      if (!customer) throw new BankingError("CUSTOMER_NOT_FOUND", "Customer not found.");
      const active = await tx.execute(sql`select reference from kyc_cases where customer_id = ${customer.id} and status in ('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'PENDING_APPROVAL') for update`);
      if (active.rows.length) throw new BankingError("ACTIVE_KYC_CASE", "This customer already has an active KYC case.");
      const sequence = await tx.execute(sql`select coalesce(max(substring(reference from 5)::int), 0)::int + 1 as next from kyc_cases where reference ~ '^KYC-[0-9]+$'`);
      const next = Number((sequence.rows as Array<{ next: number }>)[0]?.next ?? 1);
      const reference = `KYC-${next.toString().padStart(6, "0")}`;
      await tx.insert(kycCases).values({
        reference, customerId: customer.id, type: parsed.data.type, jurisdiction: customer.residenceCountry, status: "IN_PROGRESS",
        requirements: requirementsFor(customer.residenceCountry, customer.partyType), dueAt: new Date(Date.now() + 30 * 86_400_000), createdBy: actor.id,
      });
      await tx.update(customers).set({ kycStatus: "IN_PROGRESS", updatedAt: new Date() }).where(eq(customers.id, customer.id));
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "KYC_CASE_OPENED", entityType: "KYC_CASE", entityReference: reference, correlationId: crypto.randomUUID(), before: null, after: { customerNumber: customer.customerNumber, type: parsed.data.type } });
      return reference;
    });
    revalidatePath("/kyc"); revalidatePath(`/customers/${parsed.data.customerNumber}`);
    return { ok: true, code: "KYC_CASE_OPENED", message: `KYC case ${reference} was opened.` };
  } catch (error) { return failedAction(error); }
}

export async function updateCddProfileAction(caseReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const schema = z.object({ accountPurpose: z.string().min(3), occupationOrBusiness: z.string().min(2), expectedMonthlyCredits: z.string().regex(/^\d+(\.\d{1,2})?$/), expectedMonthlyDebits: z.string().regex(/^\d+(\.\d{1,2})?$/), expectedCountries: z.string().min(2), cashUsage: z.string().min(2), sourceOfFunds: z.string().min(3), sourceOfWealth: z.string().min(3), incomeOrTurnoverBand: z.string().min(2), netWorthBand: z.string().min(2) });
  const parsed = schema.safeParse({ accountPurpose: formText(formData, "accountPurpose"), occupationOrBusiness: formText(formData, "occupationOrBusiness"), expectedMonthlyCredits: formText(formData, "expectedMonthlyCredits"), expectedMonthlyDebits: formText(formData, "expectedMonthlyDebits"), expectedCountries: formText(formData, "expectedCountries"), cashUsage: formText(formData, "cashUsage"), sourceOfFunds: formText(formData, "sourceOfFunds"), sourceOfWealth: formText(formData, "sourceOfWealth"), incomeOrTurnoverBand: formText(formData, "incomeOrTurnoverBand"), netWorthBand: formText(formData, "netWorthBand") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("KYC_GATHER");
    const [kycCase] = await db.select().from(kycCases).where(eq(kycCases.reference, caseReference)).limit(1);
    if (!kycCase) throw new BankingError("KYC_CASE_NOT_FOUND", "KYC case not found.");
    const values = { ...parsed.data, expectedCountries: parsed.data.expectedCountries.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean), updatedAt: new Date() };
    await db.insert(customerDueDiligenceProfiles).values({ kycCaseId: kycCase.id, ...values }).onConflictDoUpdate({ target: customerDueDiligenceProfiles.kycCaseId, set: values });
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "CDD_PROFILE_UPDATED", entityType: "KYC_CASE", entityReference: caseReference, correlationId: crypto.randomUUID(), before: null, after: values });
    revalidatePath(`/kyc/${caseReference}`);
    return { ok: true, code: "CDD_UPDATED", message: "Customer due diligence profile updated." };
  } catch (error) { return failedAction(error); }
}

export async function recordKycEvidenceAction(caseReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ evidenceType: z.string().min(2), documentReference: z.string().min(3), source: z.string().min(3), receivedAt: z.string().date(), expiresAt: z.string().date().nullable(), reviewerNotes: z.string().nullable() }).safeParse({ evidenceType: formText(formData, "evidenceType"), documentReference: formText(formData, "documentReference"), source: formText(formData, "source"), receivedAt: formText(formData, "receivedAt"), expiresAt: optionalFormText(formData, "expiresAt"), reviewerNotes: optionalFormText(formData, "reviewerNotes") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("KYC_GATHER");
    const [kycCase] = await db.select().from(kycCases).where(eq(kycCases.reference, caseReference)).limit(1);
    if (!kycCase) throw new BankingError("KYC_CASE_NOT_FOUND", "KYC case not found.");
    const reference = `EVD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    await db.insert(kycEvidence).values({ reference, kycCaseId: kycCase.id, ...parsed.data, verificationStatus: "PENDING" });
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "KYC_EVIDENCE_RECORDED", entityType: "KYC_EVIDENCE", entityReference: reference, correlationId: crypto.randomUUID(), before: null, after: { caseReference, evidenceType: parsed.data.evidenceType } });
    revalidatePath(`/kyc/${caseReference}`);
    return { ok: true, code: "EVIDENCE_RECORDED", message: `Evidence ${reference} was recorded.` };
  } catch (error) { return failedAction(error); }
}

export async function verifyKycEvidenceAction(caseReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ evidenceReference: z.string().min(5), outcome: z.enum(["VERIFIED", "REJECTED"]), reviewerNotes: z.string().min(3) }).safeParse({ evidenceReference: formText(formData, "evidenceReference"), outcome: formText(formData, "outcome"), reviewerNotes: formText(formData, "reviewerNotes") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("KYC_GATHER");
    const [evidence] = await db.select({ evidence: kycEvidence }).from(kycEvidence).innerJoin(kycCases, eq(kycEvidence.kycCaseId, kycCases.id)).where(and(eq(kycCases.reference, caseReference), eq(kycEvidence.reference, parsed.data.evidenceReference))).limit(1);
    if (!evidence) throw new BankingError("EVIDENCE_NOT_FOUND", "Evidence was not found in this case.");
    await db.update(kycEvidence).set({ verificationStatus: parsed.data.outcome, verifiedBy: actor.id, verifiedAt: new Date(), reviewerNotes: parsed.data.reviewerNotes, updatedAt: new Date() }).where(eq(kycEvidence.id, evidence.evidence.id));
    revalidatePath(`/kyc/${caseReference}`);
    return { ok: true, code: "EVIDENCE_VERIFIED", message: `Evidence ${parsed.data.evidenceReference} is ${parsed.data.outcome.toLowerCase()}.` };
  } catch (error) { return failedAction(error); }
}

export async function runScreeningAction(caseReference: string, _previous: ActionState, _formData: FormData): Promise<ActionState> {
  void _previous; void _formData;
  try {
    const actor = await requirePermission("KYC_SCREEN");
    const [row] = await db.select({ kycCase: kycCases, customer: customers }).from(kycCases).innerJoin(customers, eq(kycCases.customerId, customers.id)).where(eq(kycCases.reference, caseReference)).limit(1);
    if (!row) throw new BankingError("KYC_CASE_NOT_FOUND", "KYC case not found.");
    const name = row.customer.legalName ?? `${row.customer.givenName ?? ""} ${row.customer.familyName ?? ""}`.trim();
    const watchlist = await db.select().from(screeningWatchlistEntries).where(eq(screeningWatchlistEntries.active, true));
    const normalized = name.toLowerCase();
    const matches = watchlist.filter((entry) => normalized.includes(entry.subjectName.toLowerCase()) || entry.subjectName.toLowerCase().includes(normalized));
    const candidates = matches.length ? matches : [{ screeningType: "SANCTIONS" as const, subjectName: "No candidate", reference: "CLEAR" }];
    for (const candidate of candidates) {
      await db.insert(screeningChecks).values({
        reference: `SCR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`, kycCaseId: row.kycCase.id,
        customerId: row.customer.id, subjectType: "CUSTOMER", subjectReference: row.customer.customerNumber, subjectName: name,
        screeningType: candidate.screeningType, matchScore: matches.length ? 85 : 0, candidateDetails: matches.length ? { watchlistReference: candidate.reference, fictional: true } : null,
        outcome: matches.length ? "POSSIBLE_MATCH" : "CLEAR",
      });
    }
    await db.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "FICTIONAL_SCREENING_RUN", entityType: "KYC_CASE", entityReference: caseReference, correlationId: crypto.randomUUID(), before: null, after: { candidates: matches.length } });
    revalidatePath(`/kyc/${caseReference}`);
    return { ok: true, code: "SCREENING_COMPLETE", message: matches.length ? `${matches.length} possible fictional match(es) require Compliance resolution.` : "Fictional screening completed clear." };
  } catch (error) { return failedAction(error); }
}

export async function resolveScreeningAction(caseReference: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ screeningReference: z.string().min(5), outcome: z.enum(["FALSE_POSITIVE", "CONFIRMED_MATCH"]), comment: z.string().min(5) }).safeParse({ screeningReference: formText(formData, "screeningReference"), outcome: formText(formData, "outcome"), comment: formText(formData, "comment") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("KYC_DECIDE");
    const [check] = await db.select().from(screeningChecks).where(eq(screeningChecks.reference, parsed.data.screeningReference)).limit(1);
    if (!check || check.outcome !== "POSSIBLE_MATCH") throw new BankingError("SCREENING_NOT_OPEN", "The screening result is not an unresolved possible match.");
    await db.update(screeningChecks).set({ outcome: parsed.data.outcome, resolvedBy: actor.id, resolvedAt: new Date(), resolutionComment: parsed.data.comment, updatedAt: new Date() }).where(eq(screeningChecks.id, check.id));
    revalidatePath(`/kyc/${caseReference}`);
    return { ok: true, code: "SCREENING_RESOLVED", message: `Screening ${parsed.data.screeningReference} was resolved.` };
  } catch (error) { return failedAction(error); }
}

export async function submitKycCaseAction(caseReference: string, _previous: ActionState, _formData: FormData): Promise<ActionState> {
  void _previous; void _formData;
  try {
    const actor = await requirePermission("KYC_GATHER");
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, customer_id, status, requirements from kyc_cases where reference = ${caseReference} for update`);
      const kycCase = (result.rows as unknown as Array<{ id: string; customer_id: string; status: string; requirements: KycCaseRequirements }>)[0];
      if (!kycCase || !["OPEN", "IN_PROGRESS", "AWAITING_INFORMATION"].includes(kycCase.status)) throw new BankingError("KYC_CASE_NOT_SUBMITTABLE", "The KYC case cannot be submitted from its current state.");
      const evidence = await tx.select().from(kycEvidence).where(eq(kycEvidence.kycCaseId, kycCase.id));
      if (!canSubmitKyc(kycCase.requirements, evidence)) throw new BankingError("MANDATORY_EVIDENCE_MISSING", "Mandatory verified evidence is missing or expired.");
      const [profile] = await tx.select().from(customerDueDiligenceProfiles).where(eq(customerDueDiligenceProfiles.kycCaseId, kycCase.id)).limit(1);
      if (!profile) throw new BankingError("CDD_PROFILE_MISSING", "Complete the customer due diligence profile before submission.");
      const checks = await tx.select().from(screeningChecks).where(eq(screeningChecks.kycCaseId, kycCase.id));
      if (!checks.length) throw new BankingError("SCREENING_REQUIRED", "Run fictional screening before submission.");
      if (checks.some((check) => check.outcome === "POSSIBLE_MATCH")) throw new BankingError("SCREENING_UNRESOLVED", "Resolve all possible screening matches before submission.");
      await tx.update(kycCases).set({ status: "PENDING_APPROVAL", submittedAt: new Date(), updatedAt: new Date() }).where(eq(kycCases.id, kycCase.id));
      await tx.update(customers).set({ kycStatus: "PENDING_APPROVAL", updatedAt: new Date() }).where(eq(customers.id, kycCase.customer_id));
      await createApprovalWorkItem(tx, { type: "KYC_APPROVAL", entityType: "KYC_CASE", entityReference: caseReference, title: `Approve KYC case ${caseReference}`, description: "Review CDD, risk, fictional screening, evidence and ownership.", requiredRole: "COMPLIANCE", dueAt: new Date(Date.now() + 2 * 86_400_000) }, actor);
    });
    revalidatePath(`/kyc/${caseReference}`); revalidatePath("/work-queue");
    return { ok: true, code: "KYC_SUBMITTED", message: `KYC case ${caseReference} was submitted for independent approval.` };
  } catch (error) { return failedAction(error); }
}

type KycCaseRequirements = Array<{ code: string; label: string; mandatory: boolean }>;

export async function decideKycCaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse({ entityReference: formText(formData, "entityReference"), workItemReference: formText(formData, "workItemReference"), expectedVersion: formText(formData, "expectedVersion"), decision: formText(formData, "decision"), comment: formText(formData, "comment"), finalRiskRating: optionalFormText(formData, "finalRiskRating") ?? undefined, overrideReason: optionalFormText(formData, "overrideReason") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("KYC_DECIDE");
    await db.transaction(async (tx) => {
      const item = await lockApprovalWorkItem(tx, { reference: parsed.data.workItemReference, entityType: "KYC_CASE", entityReference: parsed.data.entityReference, expectedVersion: parsed.data.expectedVersion }, actor);
      const result = await tx.execute(sql`select id, customer_id, status, calculated_risk_rating from kyc_cases where reference = ${parsed.data.entityReference} for update`);
      const kycCase = (result.rows as unknown as Array<{ id: string; customer_id: string; status: string; calculated_risk_rating: RiskRating }>)[0];
      if (!kycCase || kycCase.status !== "PENDING_APPROVAL") throw new BankingError("KYC_NOT_PENDING", "The KYC case is not pending approval.");
      const checks = await tx.select().from(screeningChecks).where(eq(screeningChecks.kycCaseId, kycCase.id));
      const confirmedSanctions = checks.some((check) => check.screeningType === "SANCTIONS" && check.outcome === "CONFIRMED_MATCH");
      if (parsed.data.decision === "APPROVE" && confirmedSanctions) throw new BankingError("SANCTIONS_REQUIRES_REJECTION", "A confirmed fictional sanctions result cannot be approved.");
      const finalRating = parsed.data.finalRiskRating ?? kycCase.calculated_risk_rating;
      if (finalRating !== kycCase.calculated_risk_rating && !parsed.data.overrideReason) throw new BankingError("OVERRIDE_REASON_REQUIRED", "A risk-rating override requires a reason.");
      const approved = parsed.data.decision === "APPROVE";
      await tx.update(kycCases).set({ status: approved ? "APPROVED" : "REJECTED", finalRiskRating: finalRating, overrideReason: parsed.data.overrideReason, decidedBy: actor.id, decidedAt: new Date(), decisionComment: parsed.data.comment, updatedAt: new Date() }).where(eq(kycCases.id, kycCase.id));
      await tx.update(customers).set({ kycStatus: approved ? "APPROVED" : "REJECTED", status: approved ? "ACTIVE" : "RESTRICTED", riskRating: finalRating, kycReviewDate: approved ? nextReviewDate(new Date(), finalRating) : new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(customers.id, kycCase.customer_id));
      if (!approved && confirmedSanctions) {
        const existing = await tx.select().from(customerRestrictions).where(and(eq(customerRestrictions.customerId, kycCase.customer_id), eq(customerRestrictions.type, "DEBIT_BLOCK"), eq(customerRestrictions.active, true))).limit(1);
        if (!existing.length) await tx.insert(customerRestrictions).values({ reference: `RST-${Date.now().toString(36).toUpperCase()}`, customerId: kycCase.customer_id, type: "DEBIT_BLOCK", reason: "Confirmed fictional sanctions result", sourceKycCaseId: kycCase.id, appliedBy: actor.id });
      }
      await decideWorkItem(tx, item, approved ? "APPROVED" : "REJECTED", parsed.data.comment, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: approved ? "KYC_APPROVED" : "KYC_REJECTED", entityType: "KYC_CASE", entityReference: parsed.data.entityReference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" }, after: { status: approved ? "APPROVED" : "REJECTED", finalRating, overrideReason: parsed.data.overrideReason } });
    });
    revalidatePath(`/kyc/${parsed.data.entityReference}`); revalidatePath("/work-queue"); revalidatePath("/customers");
    return { ok: true, code: parsed.data.decision === "APPROVE" ? "KYC_APPROVED" : "KYC_REJECTED", message: `KYC case ${parsed.data.entityReference} was ${parsed.data.decision === "APPROVE" ? "approved" : "rejected"}.` };
  } catch (error) { return failedAction(error); }
}

export async function applyRestrictionAction(customerNumber: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ type: z.enum(["DEBIT_BLOCK", "PAYMENT_REVIEW", "ONBOARDING_HOLD"]), reason: z.string().min(5) }).safeParse({ type: formText(formData, "restrictionType"), reason: formText(formData, "reason") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("RESTRICTION_MAINTAIN");
    const [customer] = await db.select().from(customers).where(eq(customers.customerNumber, customerNumber)).limit(1);
    if (!customer) throw new BankingError("CUSTOMER_NOT_FOUND", "Customer not found.");
    const reference = `RST-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    await db.insert(customerRestrictions).values({ reference, customerId: customer.id, type: parsed.data.type, reason: parsed.data.reason, appliedBy: actor.id });
    if (parsed.data.type === "DEBIT_BLOCK") await db.update(customers).set({ status: "RESTRICTED", updatedAt: new Date() }).where(eq(customers.id, customer.id));
    revalidatePath(`/customers/${customerNumber}`);
    return { ok: true, code: "RESTRICTION_APPLIED", message: `Restriction ${reference} was applied.` };
  } catch (error) { return failedAction(error); }
}

export async function liftRestrictionAction(customerNumber: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ restrictionReference: z.string().min(5), reason: z.string().min(5) }).safeParse({ restrictionReference: formText(formData, "restrictionReference"), reason: formText(formData, "reason") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("RESTRICTION_MAINTAIN");
    const [restriction] = await db.select({ restriction: customerRestrictions, customer: customers }).from(customerRestrictions).innerJoin(customers, eq(customerRestrictions.customerId, customers.id)).where(and(eq(customerRestrictions.reference, parsed.data.restrictionReference), eq(customers.customerNumber, customerNumber))).limit(1);
    if (!restriction?.restriction.active) throw new BankingError("RESTRICTION_NOT_ACTIVE", "The restriction is not active.");
    await db.update(customerRestrictions).set({ active: false, effectiveTo: new Date(), liftedBy: actor.id, liftedAt: new Date(), liftReason: parsed.data.reason, updatedAt: new Date() }).where(eq(customerRestrictions.id, restriction.restriction.id));
    revalidatePath(`/customers/${customerNumber}`);
    return { ok: true, code: "RESTRICTION_LIFTED", message: `Restriction ${parsed.data.restrictionReference} was lifted.` };
  } catch (error) { return failedAction(error); }
}
