import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountHolds, accountingPeriods, bankAccounts, beneficiaries, customerDueDiligenceProfiles, customerRestrictions, customers, directDebitCollections, directDebitMandates, endOfDayPostings, endOfDayRuns, generalLedgerAccounts, generalLedgerJournals, generalLedgerLines, ledgerTransactions,
  kycCases, kycEvidence, kycRiskFactors, loanApplications, loanRepayments, overdraftAlerts, overdraftFacilities, overdraftLimitHistory,
  paymentInstructionExecutions, paymentInstructions, paymentOrders, paymentReversals, processingRuns, productChargeRules, products, reconciliationItems, reconciliationRuns, screeningChecks, settlementRecords, user, workItemEvents, workItems,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type {
  AccountingPeriodView, DirectDebitMandateView, EndOfDayRunView, GeneralLedgerAccountView, GeneralLedgerJournalView, KycCaseDetail, KycCaseSummary, LoanApplicationDetail, LoanApplicationStatus, LoanApplicationSummary, OverdraftFacilityDetail, OverdraftFacilitySummary, PaymentApprovalDetail, PaymentInstructionView, PaymentReversalView, ProcessingRunView, ReconciliationRunView, TrialBalanceView,
  WorkItemDetail, WorkQueueItem, WorkItemPriority, WorkItemStatus, WorkItemType,
} from "./contracts";
import { estimatedDailyInterest, overdraftHeadroom, overdraftUtilization } from "./domain/overdraft-policy";
import { naturalBalance } from "./domain/general-ledger-policy";
import { minorUnitsToMoney, moneyToMinorUnits } from "./domain/transfer-policy";

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
    jurisdiction: kycCase.jurisdiction, status: kycCase.status, locked: kycCase.locked, lockReason: kycCase.lockReason,
    lockedAt: kycCase.lockedAt ? iso(kycCase.lockedAt) : null, version: kycCase.version, riskScore: kycCase.calculatedRiskScore,
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
    jurisdiction: row.kycCase.jurisdiction, status: row.kycCase.status, locked: row.kycCase.locked, lockReason: row.kycCase.lockReason,
    lockedAt: row.kycCase.lockedAt ? iso(row.kycCase.lockedAt) : null, version: row.kycCase.version, riskScore: row.kycCase.calculatedRiskScore,
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
    evidence: evidenceRows.map((item) => ({ reference: item.reference, evidenceType: item.evidenceType, documentReference: item.documentReference, documentNumber: item.documentNumber, source: item.source, receivedAt: item.receivedAt, issuedAt: item.issuedAt, verificationStatus: item.verificationStatus, expiresAt: item.expiresAt, firstName: item.firstName, lastName: item.lastName, reviewerNotes: item.reviewerNotes })),
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

export async function listLoanApplications(options: { status?: LoanApplicationStatus } = {}): Promise<LoanApplicationSummary[]> {
  await requireUser();
  const rows = await db.select({ application: loanApplications, customer: customers, product: products, destination: bankAccounts })
    .from(loanApplications).innerJoin(customers, eq(loanApplications.customerId, customers.id))
    .innerJoin(products, eq(loanApplications.productId, products.id))
    .innerJoin(bankAccounts, eq(loanApplications.destinationAccountId, bankAccounts.id))
    .where(options.status ? eq(loanApplications.status, options.status) : undefined)
    .orderBy(desc(loanApplications.submittedAt), loanApplications.reference);
  if (!rows.length) return [];
  const actorIds = [...new Set(rows.flatMap(({ application }) => [application.requestedBy, application.decidedBy]).filter((id): id is string => Boolean(id)))];
  const loanAccountIds = rows.map(({ application }) => application.loanAccountId).filter((id): id is string => Boolean(id));
  const references = rows.map(({ application }) => application.reference);
  const [actors, loanAccounts, workRows] = await Promise.all([
    db.select({ id: user.id, username: user.username, email: user.email }).from(user).where(inArray(user.id, actorIds)),
    loanAccountIds.length ? db.select({ id: bankAccounts.id, accountNumber: bankAccounts.accountNumber }).from(bankAccounts).where(inArray(bankAccounts.id, loanAccountIds)) : Promise.resolve([]),
    db.select().from(workItems).where(and(eq(workItems.entityType, "LOAN_APPLICATION"), inArray(workItems.entityReference, references))).orderBy(desc(workItems.createdAt)),
  ]);
  const actorById = new Map(actors.map((actor) => [actor.id, actor.username ?? actor.email]));
  const accountById = new Map(loanAccounts.map((account) => [account.id, account.accountNumber]));
  const workByReference = new Map<string, typeof workItems.$inferSelect>();
  for (const item of workRows) if (!workByReference.has(item.entityReference)) workByReference.set(item.entityReference, item);
  return rows.map(({ application, customer, product, destination }) => {
    const work = workByReference.get(application.reference);
    return {
      reference: application.reference, customerNumber: customer.customerNumber, customerName: displayName(customer),
      productCode: product.code, destinationAccountNumber: destination.accountNumber, principal: application.principal,
      approvedPrincipal: application.approvedPrincipal, currency: application.currency, termMonths: application.termMonths,
      annualInterestRate: application.annualInterestRate, firstPaymentDate: application.firstPaymentDate,
      projectedInstallment: application.projectedInstallment, debtServiceRatio: application.debtServiceRatio,
      riskGrade: application.riskGrade, purpose: application.purpose, status: application.status,
      loanAccountNumber: application.loanAccountId ? accountById.get(application.loanAccountId) ?? null : null,
      submittedBy: actorById.get(application.requestedBy) ?? "Unknown", submittedAt: iso(application.submittedAt),
      decidedBy: application.decidedBy ? actorById.get(application.decidedBy) ?? null : null,
      decisionComment: application.decisionComment, decidedAt: application.decidedAt ? iso(application.decidedAt) : null,
      version: application.version, workItem: work ? mapWorkItem(work) : null,
    };
  });
}

export async function getLoanApplication(reference: string): Promise<LoanApplicationDetail | null> {
  await requireUser();
  const [application] = await db.select().from(loanApplications).where(eq(loanApplications.reference, reference)).limit(1);
  if (!application) return null;
  const summaries = await listLoanApplications();
  const summary = summaries.find((item) => item.reference === reference);
  if (!summary) return null;
  const [schedule, transactionRows] = await Promise.all([
    application.loanAccountId ? db.select().from(loanRepayments).where(eq(loanRepayments.accountId, application.loanAccountId)).orderBy(asc(loanRepayments.sequence), asc(loanRepayments.dueDate)) : Promise.resolve([]),
    application.originationTransactionId ? db.select({ reference: ledgerTransactions.reference }).from(ledgerTransactions).where(eq(ledgerTransactions.id, application.originationTransactionId)).limit(1) : Promise.resolve([]),
  ]);
  return { ...summary, monthlyIncome: application.monthlyIncome, monthlyCommitments: application.monthlyCommitments,
    originationTransactionReference: transactionRows[0]?.reference ?? null,
    schedule: schedule.map((line) => ({ sequence: line.sequence, dueDate: line.dueDate, paidAt: line.paidAt,
      principal: line.principal, interest: line.interest, status: line.status })) };
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

export async function getEndOfDayRun(reference: string): Promise<EndOfDayRunView | null> {
  await requireUser();
  const [row] = await db.select({ run: endOfDayRuns, processing: processingRuns, requester: user })
    .from(endOfDayRuns).innerJoin(processingRuns, eq(endOfDayRuns.processingRunId, processingRuns.id))
    .innerJoin(user, eq(processingRuns.requestedBy, user.id)).where(eq(endOfDayRuns.reference, reference)).limit(1);
  if (!row) return null;
  const postings = await db.select({ posting: endOfDayPostings, account: bankAccounts, customer: customers, ruleReference: productChargeRules.reference, transactionReference: ledgerTransactions.reference })
    .from(endOfDayPostings).innerJoin(bankAccounts, eq(endOfDayPostings.accountId, bankAccounts.id))
    .innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .leftJoin(productChargeRules, eq(endOfDayPostings.chargeRuleId, productChargeRules.id))
    .leftJoin(ledgerTransactions, eq(endOfDayPostings.ledgerTransactionId, ledgerTransactions.id))
    .where(eq(endOfDayPostings.endOfDayRunId, row.run.id)).orderBy(asc(bankAccounts.accountNumber), asc(endOfDayPostings.type));
  const mappedPostings = postings.map(({ posting, account, customer, ruleReference, transactionReference }) => ({
    reference: posting.reference, accountNumber: account.accountNumber, customerNumber: customer.customerNumber,
    customerName: displayName(customer), businessDate: posting.businessDate, type: posting.type, status: posting.status,
    amount: posting.amount, currency: posting.currency, annualRate: posting.annualRate, chargeRuleReference: ruleReference,
    transactionReference, failureCode: posting.failureCode, failureMessage: posting.failureMessage,
    completedAt: posting.completedAt ? iso(posting.completedAt) : null,
  }));
  return {
    reference: row.run.reference, businessDate: row.run.businessDate, status: row.processing.status,
    attempted: row.processing.attempted, booked: row.processing.booked, failed: row.processing.failed,
    chargeCount: mappedPostings.filter((posting) => posting.type === "CHARGE" && posting.status === "BOOKED").length,
    interestCount: mappedPostings.filter((posting) => posting.type === "INTEREST" && posting.status === "BOOKED").length,
    requestedBy: row.requester.username ?? row.requester.email, startedAt: iso(row.processing.startedAt),
    completedAt: row.processing.completedAt ? iso(row.processing.completedAt) : null, errorMessage: row.processing.errorMessage,
    postings: mappedPostings,
  };
}

export async function listEndOfDayRuns(limit = 10): Promise<EndOfDayRunView[]> {
  await requireUser();
  const rows = await db.select({ reference: endOfDayRuns.reference }).from(endOfDayRuns)
    .orderBy(desc(endOfDayRuns.businessDate), desc(endOfDayRuns.createdAt)).limit(limit);
  const details = await Promise.all(rows.map((row) => getEndOfDayRun(row.reference)));
  return details.filter((item): item is EndOfDayRunView => item !== null);
}

export async function getReconciliationRun(reference: string): Promise<ReconciliationRunView | null> {
  await requireUser();
  const [row] = await db.select({ run: reconciliationRuns, processing: processingRuns, requester: user })
    .from(reconciliationRuns).innerJoin(processingRuns, eq(reconciliationRuns.processingRunId, processingRuns.id))
    .innerJoin(user, eq(processingRuns.requestedBy, user.id)).where(eq(reconciliationRuns.reference, reference)).limit(1);
  if (!row) return null;
  const items = await db.select({ item: reconciliationItems, resolverUsername: user.username, resolverEmail: user.email })
    .from(reconciliationItems).leftJoin(user, eq(reconciliationItems.resolvedBy, user.id))
    .where(eq(reconciliationItems.reconciliationRunId, row.run.id)).orderBy(asc(reconciliationItems.status), asc(reconciliationItems.transactionReference));
  const mappedItems = items.map(({ item, resolverUsername, resolverEmail }) => ({
    reference: item.reference, transactionReference: item.transactionReference, type: item.type, status: item.status,
    internalDirection: item.internalDirection, externalDirection: item.externalDirection,
    internalAmount: item.internalAmount, externalAmount: item.externalAmount,
    internalCurrency: item.internalCurrency, externalCurrency: item.externalCurrency,
    resolutionComment: item.resolutionComment, resolvedBy: resolverUsername ?? resolverEmail,
    resolvedAt: item.resolvedAt ? iso(item.resolvedAt) : null, version: item.version,
  }));
  const matched = mappedItems.filter((item) => item.status === "MATCHED").length;
  return {
    reference: row.run.reference, businessDate: row.run.businessDate, status: row.processing.status,
    attempted: row.processing.attempted, matched, exceptions: mappedItems.length - matched,
    openExceptions: mappedItems.filter((item) => item.status === "OPEN").length,
    requestedBy: row.requester.username ?? row.requester.email, startedAt: iso(row.processing.startedAt),
    completedAt: row.processing.completedAt ? iso(row.processing.completedAt) : null, errorMessage: row.processing.errorMessage,
    items: mappedItems,
  };
}

export async function listReconciliationRuns(limit = 10): Promise<ReconciliationRunView[]> {
  await requireUser();
  const rows = await db.select({ reference: reconciliationRuns.reference }).from(reconciliationRuns)
    .orderBy(desc(reconciliationRuns.businessDate), desc(reconciliationRuns.createdAt)).limit(limit);
  const details = await Promise.all(rows.map((row) => getReconciliationRun(row.reference)));
  return details.filter((item): item is ReconciliationRunView => item !== null);
}

export async function getLatestSettlementBusinessDate(): Promise<string | null> {
  await requireUser();
  const [row] = await db.select({ businessDate: settlementRecords.businessDate }).from(settlementRecords).orderBy(desc(settlementRecords.businessDate)).limit(1);
  return row?.businessDate ?? null;
}

export async function getAccountingPeriod(reference: string): Promise<AccountingPeriodView | null> {
  await requireUser();
  const [period] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.reference, reference)).limit(1);
  if (!period) return null;
  const [requesterRows, closerRows, workRows] = await Promise.all([
    period.closeRequestedBy ? db.select({ username: user.username, email: user.email }).from(user).where(eq(user.id, period.closeRequestedBy)).limit(1) : Promise.resolve([]),
    period.closedBy ? db.select({ username: user.username, email: user.email }).from(user).where(eq(user.id, period.closedBy)).limit(1) : Promise.resolve([]),
    db.select().from(workItems).where(and(eq(workItems.entityType, "ACCOUNTING_PERIOD"), eq(workItems.entityReference, period.reference))).orderBy(desc(workItems.createdAt)).limit(1),
  ]);
  return {
    reference: period.reference, code: period.code, startDate: period.startDate, endDate: period.endDate, status: period.status, version: period.version,
    closeRequestedBy: requesterRows[0]?.username ?? requesterRows[0]?.email ?? null, closeRequestComment: period.closeRequestComment,
    closeRequestedAt: period.closeRequestedAt ? iso(period.closeRequestedAt) : null,
    closedBy: closerRows[0]?.username ?? closerRows[0]?.email ?? null, closeDecisionComment: period.closeDecisionComment,
    closedAt: period.closedAt ? iso(period.closedAt) : null, workItem: workRows[0] ? mapWorkItem(workRows[0]) : null,
  };
}

export async function listAccountingPeriods(): Promise<AccountingPeriodView[]> {
  await requireUser();
  const rows = await db.select({ reference: accountingPeriods.reference }).from(accountingPeriods).orderBy(desc(accountingPeriods.endDate));
  const details = await Promise.all(rows.map((row) => getAccountingPeriod(row.reference)));
  return details.filter((item): item is AccountingPeriodView => item !== null);
}

export async function listGeneralLedgerAccounts(): Promise<GeneralLedgerAccountView[]> {
  await requireUser();
  const rows = await db.select().from(generalLedgerAccounts).orderBy(asc(generalLedgerAccounts.code));
  return rows.map((account) => ({ code: account.code, name: account.name, type: account.type, currency: account.currency,
    systemControlled: account.systemControlled, postingAllowed: account.postingAllowed, active: account.active, version: account.version }));
}

export async function getGeneralLedgerJournal(reference: string): Promise<GeneralLedgerJournalView | null> {
  await requireUser();
  const [journal] = await db.select({ journal: generalLedgerJournals, sourceTransactionReference: ledgerTransactions.reference })
    .from(generalLedgerJournals).leftJoin(ledgerTransactions, eq(generalLedgerJournals.sourceLedgerTransactionId, ledgerTransactions.id))
    .where(eq(generalLedgerJournals.reference, reference)).limit(1);
  if (!journal) return null;
  const [creatorRows, deciderRows, lineRows, workRows] = await Promise.all([
    journal.journal.createdBy ? db.select({ username: user.username, email: user.email }).from(user).where(eq(user.id, journal.journal.createdBy)).limit(1) : Promise.resolve([]),
    journal.journal.decidedBy ? db.select({ username: user.username, email: user.email }).from(user).where(eq(user.id, journal.journal.decidedBy)).limit(1) : Promise.resolve([]),
    db.select({ line: generalLedgerLines, account: generalLedgerAccounts }).from(generalLedgerLines)
      .innerJoin(generalLedgerAccounts, eq(generalLedgerLines.accountId, generalLedgerAccounts.id))
      .where(eq(generalLedgerLines.journalId, journal.journal.id)).orderBy(asc(generalLedgerLines.lineNumber)),
    db.select().from(workItems).where(and(eq(workItems.entityType, "GENERAL_LEDGER_JOURNAL"), eq(workItems.entityReference, reference))).orderBy(desc(workItems.createdAt)).limit(1),
  ]);
  return {
    reference: journal.journal.reference, source: journal.journal.source, sourceTransactionReference: journal.sourceTransactionReference,
    valueDate: journal.journal.valueDate, status: journal.journal.status, currency: journal.journal.currency, description: journal.journal.description,
    totalDebit: journal.journal.totalDebit, totalCredit: journal.journal.totalCredit,
    createdBy: creatorRows[0]?.username ?? creatorRows[0]?.email ?? null, submittedComment: journal.journal.submittedComment,
    submittedAt: journal.journal.submittedAt ? iso(journal.journal.submittedAt) : null,
    decidedBy: deciderRows[0]?.username ?? deciderRows[0]?.email ?? null, decisionComment: journal.journal.decisionComment,
    decidedAt: journal.journal.decidedAt ? iso(journal.journal.decidedAt) : null, postedAt: journal.journal.postedAt ? iso(journal.journal.postedAt) : null,
    version: journal.journal.version, lines: lineRows.map(({ line, account }) => ({ lineNumber: line.lineNumber, accountCode: account.code,
      accountName: account.name, accountType: account.type, direction: line.direction, amount: line.amount, narrative: line.narrative })),
    workItem: workRows[0] ? mapWorkItem(workRows[0]) : null,
  };
}

export async function listGeneralLedgerJournals(limit = 50): Promise<GeneralLedgerJournalView[]> {
  await requireUser();
  const rows = await db.select({ journal: generalLedgerJournals, sourceTransactionReference: ledgerTransactions.reference })
    .from(generalLedgerJournals).leftJoin(ledgerTransactions, eq(generalLedgerJournals.sourceLedgerTransactionId, ledgerTransactions.id))
    .orderBy(desc(generalLedgerJournals.valueDate), desc(generalLedgerJournals.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
  if (!rows.length) return [];
  const journalIds = rows.map((row) => row.journal.id);
  const journalReferences = rows.map((row) => row.journal.reference);
  const actorIds = [...new Set(rows.flatMap((row) => [row.journal.createdBy, row.journal.decidedBy]).filter((id): id is string => Boolean(id)))];
  const [lineRows, actorRows, workRows] = await Promise.all([
    db.select({ journalId: generalLedgerLines.journalId, line: generalLedgerLines, account: generalLedgerAccounts }).from(generalLedgerLines)
      .innerJoin(generalLedgerAccounts, eq(generalLedgerLines.accountId, generalLedgerAccounts.id))
      .where(inArray(generalLedgerLines.journalId, journalIds)).orderBy(asc(generalLedgerLines.lineNumber)),
    actorIds.length ? db.select({ id: user.id, username: user.username, email: user.email }).from(user).where(inArray(user.id, actorIds)) : Promise.resolve([]),
    db.select().from(workItems).where(and(eq(workItems.entityType, "GENERAL_LEDGER_JOURNAL"), inArray(workItems.entityReference, journalReferences))).orderBy(desc(workItems.createdAt)),
  ]);
  const actorById = new Map(actorRows.map((actor) => [actor.id, actor.username ?? actor.email]));
  const workByReference = new Map<string, typeof workItems.$inferSelect>();
  for (const item of workRows) if (!workByReference.has(item.entityReference)) workByReference.set(item.entityReference, item);
  const linesByJournal = new Map<string, GeneralLedgerJournalView["lines"]>();
  for (const { journalId, line, account } of lineRows) {
    const lines = linesByJournal.get(journalId) ?? [];
    lines.push({ lineNumber: line.lineNumber, accountCode: account.code, accountName: account.name, accountType: account.type,
      direction: line.direction, amount: line.amount, narrative: line.narrative });
    linesByJournal.set(journalId, lines);
  }
  return rows.map(({ journal, sourceTransactionReference }) => {
    const workItem = workByReference.get(journal.reference);
    return {
      reference: journal.reference, source: journal.source, sourceTransactionReference, valueDate: journal.valueDate,
      status: journal.status, currency: journal.currency, description: journal.description, totalDebit: journal.totalDebit, totalCredit: journal.totalCredit,
      createdBy: journal.createdBy ? actorById.get(journal.createdBy) ?? null : null, submittedComment: journal.submittedComment,
      submittedAt: journal.submittedAt ? iso(journal.submittedAt) : null, decidedBy: journal.decidedBy ? actorById.get(journal.decidedBy) ?? null : null,
      decisionComment: journal.decisionComment, decidedAt: journal.decidedAt ? iso(journal.decidedAt) : null,
      postedAt: journal.postedAt ? iso(journal.postedAt) : null, version: journal.version, lines: linesByJournal.get(journal.id) ?? [],
      workItem: workItem ? mapWorkItem(workItem) : null,
    };
  });
}

export async function getTrialBalance(input: { fromDate?: string; toDate: string; currency?: string }): Promise<TrialBalanceView> {
  await requireUser();
  const fromClause = input.fromDate ? sql`and journal.value_date >= ${input.fromDate}` : sql``;
  const currencyClause = input.currency ? sql`and account.currency = ${input.currency}` : sql``;
  const result = await db.execute(sql`
    select account.code, account.name, account.type::text, account.currency, account.system_controlled, account.posting_allowed, account.active, account.version,
      coalesce(sum(case when journal.id is not null and line.direction = 'DEBIT' then line.amount else 0 end), 0)::text as debit,
      coalesce(sum(case when journal.id is not null and line.direction = 'CREDIT' then line.amount else 0 end), 0)::text as credit
    from general_ledger_accounts account
    left join general_ledger_lines line on line.account_id = account.id
    left join general_ledger_journals journal on journal.id = line.journal_id and journal.status = 'POSTED' and journal.value_date <= ${input.toDate} ${fromClause}
    where account.active ${currencyClause}
    group by account.id order by account.code
  `);
  const rows = result.rows as unknown as Array<{ code: string; name: string; type: GeneralLedgerAccountView["type"]; currency: string; system_controlled: boolean; posting_allowed: boolean; active: boolean; version: number; debit: string; credit: string }>;
  const lines = rows.map((row) => ({ code: row.code, name: row.name, type: row.type, currency: row.currency, systemControlled: row.system_controlled,
    postingAllowed: row.posting_allowed, active: row.active, version: row.version, debit: row.debit, credit: row.credit,
    balance: naturalBalance(row.type, row.debit, row.credit) }));
  const totalDebitMinor = lines.reduce((sum, line) => sum + moneyToMinorUnits(line.debit), 0n);
  const totalCreditMinor = lines.reduce((sum, line) => sum + moneyToMinorUnits(line.credit), 0n);
  return { fromDate: input.fromDate ?? null, toDate: input.toDate, currency: input.currency ?? null,
    totalDebit: minorUnitsToMoney(totalDebitMinor), totalCredit: minorUnitsToMoney(totalCreditMinor), balanced: totalDebitMinor === totalCreditMinor, lines };
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
