import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountHolds, bankAccounts, beneficiaries, customerDueDiligenceProfiles, customerRestrictions, customers, directDebitCollections, directDebitMandates, ledgerTransactions,
  kycCases, kycEvidence, kycRiskFactors, overdraftAlerts, overdraftFacilities, overdraftLimitHistory,
  paymentInstructionExecutions, paymentInstructions, paymentOrders, paymentReversals, processingRuns, screeningChecks, user, workItemEvents, workItems,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type {
  DirectDebitMandateView, KycCaseDetail, KycCaseSummary, OverdraftFacilityDetail, OverdraftFacilitySummary, PaymentApprovalDetail, PaymentInstructionView, PaymentReversalView, ProcessingRunView,
  WorkItemDetail, WorkQueueItem, WorkItemPriority, WorkItemStatus, WorkItemType,
} from "./contracts";
import { estimatedDailyInterest, overdraftHeadroom, overdraftUtilization } from "./domain/overdraft-policy";

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
const displayName = (row: typeof customers.$inferSelect) => row.legalName ?? ([row.givenName, row.familyName].filter(Boolean).join(" ") || row.shortName);

export async function listWorkQueue(options: { status?: WorkItemStatus; type?: WorkItemType; priority?: WorkItemPriority; assignedTo?: string; overdueOnly?: boolean } = {}): Promise<WorkQueueItem[]> {
  await requireUser();
  const conditions = [
    options.status ? eq(workItems.status, options.status) : undefined,
    options.type ? eq(workItems.type, options.type) : undefined,
    options.priority ? eq(workItems.priority, options.priority) : undefined,
    options.assignedTo ? eq(workItems.assignedTo, options.assignedTo) : undefined,
    options.overdueOnly ? sql`${workItems.dueAt} < now()` : undefined,
  ].filter(Boolean);
  const rows = await db.select().from(workItems).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(workItems.dueAt), desc(workItems.priority));
  return rows.map(mapWorkItem);
}

function mapWorkItem(item: typeof workItems.$inferSelect): WorkQueueItem {
  return {
    reference: item.reference, type: item.type, status: item.status, priority: item.priority,
    entityType: item.entityType, entityReference: item.entityReference, title: item.title, requiredRole: item.requiredRole,
    createdBy: item.createdBy, assignedTo: item.assignedTo, dueAt: iso(item.dueAt), version: item.version,
  };
}

export async function getWorkItem(reference: string): Promise<WorkItemDetail | null> {
  await requireUser();
  const [item] = await db.select().from(workItems).where(eq(workItems.reference, reference)).limit(1);
  if (!item) return null;
  const events = await db.select().from(workItemEvents).where(eq(workItemEvents.workItemId, item.id)).orderBy(workItemEvents.occurredAt);
  return {
    ...mapWorkItem(item), description: item.description, decisionComment: item.decisionComment,
    events: events.map((event) => ({ eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, actorUsername: event.actorUsername, comment: event.comment, occurredAt: iso(event.occurredAt) })),
  };
}

export async function listKycCases(): Promise<KycCaseSummary[]> {
  await requireUser();
  const rows = await db.select({ kycCase: kycCases, customer: customers }).from(kycCases)
    .innerJoin(customers, eq(kycCases.customerId, customers.id)).orderBy(desc(kycCases.updatedAt), kycCases.reference);
  return rows.map(({ kycCase, customer }) => ({
    reference: kycCase.reference, customerNumber: customer.customerNumber, customerName: displayName(customer), type: kycCase.type,
    jurisdiction: kycCase.jurisdiction, status: kycCase.status, riskScore: kycCase.calculatedRiskScore,
    riskRating: kycCase.finalRiskRating ?? kycCase.calculatedRiskRating, enhancedDueDiligence: kycCase.enhancedDueDiligence, dueAt: iso(kycCase.dueAt),
  }));
}

export async function getKycCase(reference: string): Promise<KycCaseDetail | null> {
  await requireUser();
  const [row] = await db.select({ kycCase: kycCases, customer: customers }).from(kycCases)
    .innerJoin(customers, eq(kycCases.customerId, customers.id)).where(eq(kycCases.reference, reference)).limit(1);
  if (!row) return null;
  const [profiles, factors, evidenceRows, screeningRows, restrictionRows] = await Promise.all([
    db.select().from(customerDueDiligenceProfiles).where(eq(customerDueDiligenceProfiles.kycCaseId, row.kycCase.id)).limit(1),
    db.select().from(kycRiskFactors).where(eq(kycRiskFactors.kycCaseId, row.kycCase.id)).orderBy(desc(kycRiskFactors.score)),
    db.select().from(kycEvidence).where(eq(kycEvidence.kycCaseId, row.kycCase.id)).orderBy(kycEvidence.reference),
    db.select().from(screeningChecks).where(eq(screeningChecks.kycCaseId, row.kycCase.id)).orderBy(screeningChecks.reference),
    db.select().from(customerRestrictions).where(eq(customerRestrictions.customerId, row.customer.id)).orderBy(desc(customerRestrictions.effectiveFrom)),
  ]);
  const profile = profiles[0];
  return {
    reference: row.kycCase.reference, customerNumber: row.customer.customerNumber, customerName: displayName(row.customer), type: row.kycCase.type,
    jurisdiction: row.kycCase.jurisdiction, status: row.kycCase.status, riskScore: row.kycCase.calculatedRiskScore,
    riskRating: row.kycCase.finalRiskRating ?? row.kycCase.calculatedRiskRating, finalRiskRating: row.kycCase.finalRiskRating,
    overrideReason: row.kycCase.overrideReason, enhancedDueDiligence: row.kycCase.enhancedDueDiligence, dueAt: iso(row.kycCase.dueAt),
    requirements: row.kycCase.requirements as KycCaseDetail["requirements"],
    profile: profile ? {
      accountPurpose: profile.accountPurpose, occupationOrBusiness: profile.occupationOrBusiness,
      expectedMonthlyCredits: profile.expectedMonthlyCredits, expectedMonthlyDebits: profile.expectedMonthlyDebits,
      expectedCountries: profile.expectedCountries as string[], cashUsage: profile.cashUsage, sourceOfFunds: profile.sourceOfFunds,
      sourceOfWealth: profile.sourceOfWealth, incomeOrTurnoverBand: profile.incomeOrTurnoverBand, netWorthBand: profile.netWorthBand,
    } : null,
    riskFactors: factors.map((factor) => ({ category: factor.category, rule: factor.rule, score: factor.score, explanation: factor.explanation })),
    evidence: evidenceRows.map((item) => ({ reference: item.reference, evidenceType: item.evidenceType, documentReference: item.documentReference, source: item.source, receivedAt: item.receivedAt, verificationStatus: item.verificationStatus, expiresAt: item.expiresAt, reviewerNotes: item.reviewerNotes })),
    screenings: screeningRows.map((item) => ({ reference: item.reference, subjectType: item.subjectType, subjectReference: item.subjectReference, subjectName: item.subjectName, screeningType: item.screeningType, matchScore: item.matchScore, outcome: item.outcome, resolutionComment: item.resolutionComment, createdAt: iso(item.createdAt) })),
    restrictions: restrictionRows.map((item) => ({ reference: item.reference, type: item.type, reason: item.reason, effectiveFrom: iso(item.effectiveFrom), effectiveTo: item.effectiveTo ? iso(item.effectiveTo) : null, active: item.active })),
  };
}

async function facilityProjection(facility: typeof overdraftFacilities.$inferSelect, account: typeof bankAccounts.$inferSelect, customer: typeof customers.$inferSelect): Promise<OverdraftFacilitySummary> {
  const [holds] = await db.select({ value: sql<string>`coalesce(sum(${accountHolds.amount}) filter (where ${accountHolds.status} = 'ACTIVE'), 0)::text` })
    .from(accountHolds).where(eq(accountHolds.accountId, account.id));
  const utilization = overdraftUtilization(account.balance);
  return {
    reference: facility.reference, accountNumber: account.accountNumber, customerNumber: customer.customerNumber, customerName: displayName(customer),
    requestedLimit: facility.requestedLimit, approvedLimit: facility.approvedLimit, utilization,
    headroom: overdraftHeadroom(facility.approvedLimit, account.balance, holds.value, facility.status), currency: facility.currency,
    status: facility.status, reviewDate: facility.reviewDate,
  };
}

export async function listOverdraftFacilities(): Promise<OverdraftFacilitySummary[]> {
  await requireUser();
  const rows = await db.select({ facility: overdraftFacilities, account: bankAccounts, customer: customers }).from(overdraftFacilities)
    .innerJoin(bankAccounts, eq(overdraftFacilities.accountId, bankAccounts.id)).innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .orderBy(overdraftFacilities.reference);
  return Promise.all(rows.map((row) => facilityProjection(row.facility, row.account, row.customer)));
}

export async function getOverdraftFacility(reference: string): Promise<OverdraftFacilityDetail | null> {
  await requireUser();
  const [row] = await db.select({ facility: overdraftFacilities, account: bankAccounts, customer: customers }).from(overdraftFacilities)
    .innerJoin(bankAccounts, eq(overdraftFacilities.accountId, bankAccounts.id)).innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .where(eq(overdraftFacilities.reference, reference)).limit(1);
  if (!row) return null;
  const [summary, alerts, history, holds] = await Promise.all([
    facilityProjection(row.facility, row.account, row.customer),
    db.select().from(overdraftAlerts).where(eq(overdraftAlerts.facilityId, row.facility.id)).orderBy(desc(overdraftAlerts.detectedAt)),
    db.select().from(overdraftLimitHistory).where(eq(overdraftLimitHistory.facilityId, row.facility.id)).orderBy(desc(overdraftLimitHistory.effectiveDate)),
    db.select({ value: sql<string>`coalesce(sum(${accountHolds.amount}) filter (where ${accountHolds.status} = 'ACTIVE'), 0)::text` }).from(accountHolds).where(eq(accountHolds.accountId, row.account.id)),
  ]);
  return {
    ...summary, annualInterestRate: row.facility.annualInterestRate, estimatedDailyInterest: estimatedDailyInterest(summary.utilization, row.facility.annualInterestRate),
    purpose: row.facility.purpose, affordabilityInformation: row.facility.affordabilityInformation as Record<string, unknown>, riskGrade: row.facility.riskGrade,
    startDate: row.facility.startDate, expiryDate: row.facility.expiryDate, activeHolds: holds[0].value, version: row.facility.version,
    alerts: alerts.map((alert) => ({ reference: alert.reference, type: alert.type, status: alert.status, severity: alert.severity, detectedAt: iso(alert.detectedAt), dueAt: iso(alert.dueAt), details: alert.details, intervention: alert.intervention, resolutionComment: alert.resolutionComment })),
    limitHistory: history.map((item) => ({ previousLimit: item.previousLimit, newLimit: item.newLimit, reason: item.reason, effectiveDate: item.effectiveDate, approvedBy: item.approvedBy })),
  };
}

export async function getPaymentApproval(reference: string): Promise<PaymentApprovalDetail | null> {
  await requireUser();
  const [row] = await db.select({ payment: paymentOrders, account: bankAccounts, customer: customers, beneficiary: beneficiaries }).from(paymentOrders)
    .innerJoin(bankAccounts, eq(paymentOrders.sourceAccountId, bankAccounts.id)).innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .leftJoin(beneficiaries, eq(paymentOrders.beneficiaryId, beneficiaries.id)).where(eq(paymentOrders.reference, reference)).limit(1);
  if (!row) return null;
  const [holdRows, workRows, reversalRows] = await Promise.all([
    db.select().from(accountHolds).where(eq(accountHolds.paymentOrderId, row.payment.id)).limit(1),
    db.select().from(workItems).where(and(eq(workItems.entityType, "PAYMENT"), eq(workItems.entityReference, row.payment.reference))).limit(1),
    db.select({ reference: paymentReversals.reference }).from(paymentReversals).where(eq(paymentReversals.originalPaymentOrderId, row.payment.id)).limit(1),
  ]);
  const hold = holdRows[0];
  const reversal = reversalRows[0] ? await getPaymentReversal(reversalRows[0].reference) : null;
  return {
    reference: row.payment.reference, type: row.payment.type, status: row.payment.status, sourceAccountNumber: row.account.accountNumber,
    customerNumber: row.customer.customerNumber, customerName: displayName(row.customer),
    destinationReference: row.beneficiary?.name ?? row.payment.destinationAccountId ?? "—", amount: row.payment.amount, currency: row.payment.currency,
    description: row.payment.description, approvalReason: row.payment.approvalReason, initiatedBy: row.payment.initiatedBy,
    createdAt: iso(row.payment.createdAt), expiresAt: row.payment.expiresAt ? iso(row.payment.expiresAt) : null,
    hold: hold ? { reference: hold.reference, accountNumber: row.account.accountNumber, paymentReference: row.payment.reference, amount: hold.amount, currency: hold.currency, status: hold.status, expiresAt: iso(hold.expiresAt) } : null,
    workItem: workRows[0] ? mapWorkItem(workRows[0]) : null,
    reversal,
  };
}

export async function listPendingPayments(): Promise<PaymentApprovalDetail[]> {
  return listPayments({ status: "PENDING" });
}

export async function listPayments(options: { status?: PaymentApprovalDetail["status"] } = {}): Promise<PaymentApprovalDetail[]> {
  await requireUser();
  const rows = await db.select({ reference: paymentOrders.reference }).from(paymentOrders)
    .where(options.status ? eq(paymentOrders.status, options.status) : undefined)
    .orderBy(desc(paymentOrders.createdAt));
  const details = await Promise.all(rows.map((row) => getPaymentApproval(row.reference)));
  return details.filter((item): item is PaymentApprovalDetail => item !== null);
}

export async function getPaymentReversal(reference: string): Promise<PaymentReversalView | null> {
  await requireUser();
  const [row] = await db.select({ reversal: paymentReversals, payment: paymentOrders, account: bankAccounts, customer: customers })
    .from(paymentReversals).innerJoin(paymentOrders, eq(paymentReversals.originalPaymentOrderId, paymentOrders.id))
    .innerJoin(bankAccounts, eq(paymentOrders.sourceAccountId, bankAccounts.id)).innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .where(eq(paymentReversals.reference, reference)).limit(1);
  if (!row) return null;
  const [destinationRows, beneficiaryRows, requesterRows, transactionRows, workRows] = await Promise.all([
    row.payment.destinationAccountId ? db.select({ accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.id, row.payment.destinationAccountId)).limit(1) : Promise.resolve([]),
    row.payment.beneficiaryId ? db.select({ name: beneficiaries.name }).from(beneficiaries).where(eq(beneficiaries.id, row.payment.beneficiaryId)).limit(1) : Promise.resolve([]),
    db.select({ username: user.username, email: user.email }).from(user).where(eq(user.id, row.reversal.requestedBy)).limit(1),
    row.reversal.reversalTransactionId ? db.select({ reference: ledgerTransactions.reference }).from(ledgerTransactions).where(eq(ledgerTransactions.id, row.reversal.reversalTransactionId)).limit(1) : Promise.resolve([]),
    db.select().from(workItems).where(and(eq(workItems.entityType, "PAYMENT_REVERSAL"), eq(workItems.entityReference, row.reversal.reference))).limit(1),
  ]);
  return {
    reference: row.reversal.reference, status: row.reversal.status, originalPaymentReference: row.payment.reference, paymentType: row.payment.type,
    sourceAccountNumber: row.account.accountNumber, destinationReference: destinationRows[0]?.accountNumber ?? beneficiaryRows[0]?.name ?? "—",
    customerNumber: row.customer.customerNumber, customerName: displayName(row.customer), amount: row.reversal.amount, currency: row.reversal.currency,
    reason: row.reversal.reason, requestedBy: requesterRows[0]?.username ?? requesterRows[0]?.email ?? "Unknown", decisionComment: row.reversal.decisionComment,
    reversalTransactionReference: transactionRows[0]?.reference ?? null, createdAt: iso(row.reversal.createdAt), decidedAt: row.reversal.decidedAt ? iso(row.reversal.decidedAt) : null,
    version: row.reversal.version, workItem: workRows[0] ? mapWorkItem(workRows[0]) : null,
  };
}

export async function listPaymentReversals(options: { status?: PaymentReversalView["status"] } = {}): Promise<PaymentReversalView[]> {
  await requireUser();
  const rows = await db.select({ reference: paymentReversals.reference }).from(paymentReversals)
    .where(options.status ? eq(paymentReversals.status, options.status) : undefined).orderBy(desc(paymentReversals.createdAt));
  const details = await Promise.all(rows.map((row) => getPaymentReversal(row.reference)));
  return details.filter((item): item is PaymentReversalView => item !== null);
}

export async function getPaymentInstruction(reference: string): Promise<PaymentInstructionView | null> {
  await requireUser();
  const [instruction] = await db.select().from(paymentInstructions).where(eq(paymentInstructions.reference, reference)).limit(1);
  if (!instruction) return null;
  const [[source], destinationRows, beneficiaryRows, [creator], executions] = await Promise.all([
    db.select({ account: bankAccounts, customer: customers }).from(bankAccounts)
      .innerJoin(customers, eq(bankAccounts.customerId, customers.id))
      .where(eq(bankAccounts.id, instruction.sourceAccountId)).limit(1),
    instruction.destinationAccountId
      ? db.select({ accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(eq(bankAccounts.id, instruction.destinationAccountId)).limit(1)
      : Promise.resolve([]),
    instruction.beneficiaryId
      ? db.select({ name: beneficiaries.name }).from(beneficiaries).where(eq(beneficiaries.id, instruction.beneficiaryId)).limit(1)
      : Promise.resolve([]),
    db.select({ username: user.username, email: user.email }).from(user).where(eq(user.id, instruction.createdBy)).limit(1),
    db.select({ execution: paymentInstructionExecutions, paymentReference: paymentOrders.reference })
      .from(paymentInstructionExecutions)
      .leftJoin(paymentOrders, eq(paymentInstructionExecutions.paymentOrderId, paymentOrders.id))
      .where(eq(paymentInstructionExecutions.instructionId, instruction.id))
      .orderBy(desc(paymentInstructionExecutions.scheduledFor)),
  ]);
  if (!source) return null;
  return {
    reference: instruction.reference,
    type: instruction.type,
    status: instruction.status,
    paymentType: instruction.paymentType,
    sourceAccountNumber: source.account.accountNumber,
    customerNumber: source.customer.customerNumber,
    customerName: displayName(source.customer),
    destinationReference: destinationRows[0]?.accountNumber ?? beneficiaryRows[0]?.name ?? "—",
    amount: instruction.amount,
    currency: instruction.currency,
    description: instruction.description,
    frequency: instruction.frequency,
    startDate: instruction.startDate,
    nextExecutionDate: instruction.nextExecutionDate,
    endDate: instruction.endDate,
    lastExecutionAt: instruction.lastExecutionAt ? iso(instruction.lastExecutionAt) : null,
    createdBy: creator?.username ?? creator?.email ?? "Unknown",
    cancellationReason: instruction.cancellationReason,
    version: instruction.version,
    executions: executions.map(({ execution, paymentReference }) => ({
      scheduledFor: execution.scheduledFor,
      status: execution.status,
      paymentReference,
      failureCode: execution.failureCode,
      failureMessage: execution.failureMessage,
      attemptedAt: iso(execution.attemptedAt),
      completedAt: execution.completedAt ? iso(execution.completedAt) : null,
    })),
  };
}

export async function listPaymentInstructions(): Promise<PaymentInstructionView[]> {
  await requireUser();
  const rows = await db.select({ reference: paymentInstructions.reference }).from(paymentInstructions)
    .orderBy(asc(paymentInstructions.nextExecutionDate), asc(paymentInstructions.reference));
  const details = await Promise.all(rows.map((row) => getPaymentInstruction(row.reference)));
  return details.filter((item): item is PaymentInstructionView => item !== null);
}

export async function listPaymentInstructionRuns(limit = 10): Promise<ProcessingRunView[]> {
  await requireUser();
  const rows = await db.select().from(processingRuns).where(eq(processingRuns.type, "PAYMENT_INSTRUCTIONS"))
    .orderBy(desc(processingRuns.startedAt)).limit(limit);
  return rows.map((run) => ({
    reference: run.reference,
    type: "PAYMENT_INSTRUCTIONS",
    businessDate: run.businessDate,
    status: run.status,
    attempted: run.attempted,
    booked: run.booked,
    pending: run.pending,
    failed: run.failed,
    startedAt: iso(run.startedAt),
    completedAt: run.completedAt ? iso(run.completedAt) : null,
    errorMessage: run.errorMessage,
  }));
}

export async function getDirectDebitMandate(reference: string): Promise<DirectDebitMandateView | null> {
  await requireUser();
  const [row] = await db.select({ mandate: directDebitMandates, account: bankAccounts, customer: customers, creditor: beneficiaries })
    .from(directDebitMandates).innerJoin(bankAccounts, eq(directDebitMandates.sourceAccountId, bankAccounts.id))
    .innerJoin(customers, eq(bankAccounts.customerId, customers.id)).innerJoin(beneficiaries, eq(directDebitMandates.creditorBeneficiaryId, beneficiaries.id))
    .where(eq(directDebitMandates.reference, reference)).limit(1);
  if (!row) return null;
  const collections = await db.select({ collection: directDebitCollections, paymentReference: paymentOrders.reference }).from(directDebitCollections)
    .leftJoin(paymentOrders, eq(directDebitCollections.paymentOrderId, paymentOrders.id))
    .where(eq(directDebitCollections.mandateId, row.mandate.id)).orderBy(desc(directDebitCollections.createdAt));
  return {
    reference: row.mandate.reference, status: row.mandate.status, sourceAccountNumber: row.account.accountNumber,
    customerNumber: row.customer.customerNumber, customerName: displayName(row.customer), creditorBeneficiaryId: row.creditor.id,
    creditorName: row.creditor.name, creditorAccountNumber: row.creditor.accountNumber,
    creditorMandateReference: row.mandate.creditorMandateReference, maximumSingleAmount: row.mandate.maximumSingleAmount,
    currency: row.mandate.currency, validFrom: row.mandate.validFrom, validTo: row.mandate.validTo,
    cancellationReason: row.mandate.cancellationReason, version: row.mandate.version,
    collections: collections.map(({ collection, paymentReference }) => ({ reference: collection.reference, status: collection.status,
      amount: collection.amount, currency: collection.currency, collectionDate: collection.collectionDate, paymentReference,
      failureCode: collection.failureCode, failureMessage: collection.failureMessage, createdAt: iso(collection.createdAt), completedAt: collection.completedAt ? iso(collection.completedAt) : null })),
  };
}

export async function listDirectDebitMandates(): Promise<DirectDebitMandateView[]> {
  await requireUser();
  const rows = await db.select({ reference: directDebitMandates.reference }).from(directDebitMandates).orderBy(asc(directDebitMandates.reference));
  const details = await Promise.all(rows.map((row) => getDirectDebitMandate(row.reference)));
  return details.filter((item): item is DirectDebitMandateView => item !== null);
}
