import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, bankAccounts, customerRestrictions, ledgerEntries, ledgerTransactions, loanApplications, loanDetails, loanRepayments,
} from "@/db/schema";
import type { SessionUser } from "@/modules/contracts";
import { generateLoanSchedule, validateLoanApplication } from "@/modules/domain/loan-origination-policy";
import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { assertPostingDateOpen } from "./accounting-periods";
import { BankingError } from "./errors";
import { postSubledgerToGeneralLedger } from "./general-ledger";
import { createApprovalWorkItem, decideWorkItem, lockApprovalWorkItem } from "./workflow";

type SubmissionInput = {
  customerNumber: string;
  productCode: string;
  destinationAccountNumber: string;
  principal: string;
  termMonths: number;
  firstPaymentDate: string;
  monthlyIncome: string;
  monthlyCommitments: string;
  purpose: string;
  riskGrade: string;
  idempotencyKey: string;
};

type LockedApplication = {
  id: string;
  reference: string;
  status: string;
  customer_id: string;
  customer_status: string;
  kyc_status: string;
  product_id: string;
  product_kind: string;
  product_active: boolean;
  product_currency: string;
  destination_account_id: string;
  destination_customer_id: string;
  destination_currency: string;
  destination_status: string;
  destination_read_only: boolean;
  destination_balance: string;
  destination_available_balance: string;
  branch_id: string;
  principal: string;
  currency: string;
  term_months: number;
  annual_interest_rate: string;
  first_payment_date: string;
  projected_installment: string;
  monthly_income: string;
  monthly_commitments: string;
  risk_grade: string;
  purpose: string;
  loan_account_id: string | null;
  origination_transaction_id: string | null;
  version: number;
};

function failureMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_LOAN_AMOUNT: "Enter valid monetary values and a valid product interest rate.",
    PRINCIPAL_OUT_OF_RANGE: "Loan principal must be between 1,000.00 and 1,000,000.00.",
    INVALID_INTEREST_RATE: "The loan product interest rate must be greater than zero and no more than 50%.",
    INVALID_TERM: "Loan term must be between 6 and 60 whole months.",
    INVALID_FIRST_PAYMENT_DATE: "The first payment date must be a valid future date.",
    INVALID_AFFORDABILITY: "Monthly income must exceed existing monthly commitments.",
    AFFORDABILITY_EXCEEDED: "Total monthly debt service must not exceed 40% of monthly income.",
    INVALID_PURPOSE: "Enter a loan purpose between 10 and 500 characters.",
    INVALID_RISK_GRADE: "Risk grade must be A, B, or C.",
  };
  return messages[code] ?? "The loan application failed policy validation.";
}

async function assertNoOriginationRestrictions(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], customerId: string) {
  const restrictions = await tx.select({ id: customerRestrictions.id }).from(customerRestrictions).where(and(
    eq(customerRestrictions.customerId, customerId), eq(customerRestrictions.active, true),
    inArray(customerRestrictions.type, ["DEBIT_BLOCK", "ONBOARDING_HOLD"]),
  ));
  if (restrictions.length) throw new BankingError("CUSTOMER_RESTRICTED", "An active customer restriction prevents loan origination.");
}

export async function submitLoanApplication(input: SubmissionInput, actor: SessionUser) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) throw new BankingError("IDEMPOTENCY_KEY_REQUIRED", "Provide an idempotency key between 8 and 100 characters.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
    const [duplicate] = await tx.select({ reference: loanApplications.reference }).from(loanApplications).where(eq(loanApplications.idempotencyKey, idempotencyKey)).limit(1);
    if (duplicate) return { reference: duplicate.reference, workItemReference: null, duplicate: true };
    const result = await tx.execute(sql`
      select customer.id as customer_id, customer.status::text as customer_status, customer.kyc_status::text,
             product.id as product_id, product.kind::text as product_kind, product.currency as product_currency,
             product.interest_rate::text, product.active as product_active,
             destination.id as destination_account_id, destination.customer_id as destination_customer_id,
             destination.currency as destination_currency, destination.status::text as destination_status,
             destination.read_only as destination_read_only, branch.id as branch_id
      from customers customer
      join products product on product.code = ${input.productCode}
      join bank_accounts destination on destination.account_number = ${input.destinationAccountNumber}
      join branches branch on branch.code = customer.branch_code
      where customer.customer_number = ${input.customerNumber}
      for share of customer, product, destination, branch
    `);
    const record = (result.rows as unknown as Array<{
      customer_id: string; customer_status: string; kyc_status: string; product_id: string; product_kind: string;
      product_currency: string; interest_rate: string; product_active: boolean; destination_account_id: string;
      destination_customer_id: string; destination_currency: string; destination_status: string; destination_read_only: boolean; branch_id: string;
    }>)[0];
    if (!record) throw new BankingError("LOAN_PARTY_NOT_FOUND", "The customer, loan product, destination account, or branch could not be found.");
    if (record.customer_status !== "ACTIVE" || record.kyc_status !== "APPROVED") throw new BankingError("KYC_NOT_APPROVED", "The customer must be active with approved KYC.");
    if (record.product_kind !== "LOAN" || !record.product_active) throw new BankingError("LOAN_PRODUCT_UNAVAILABLE", "Select an active loan product.");
    if (record.destination_customer_id !== record.customer_id || record.destination_status !== "ACTIVE" || record.destination_read_only) throw new BankingError("DESTINATION_INELIGIBLE", "Disbursement requires the customer's own active deposit account.");
    if (record.destination_currency !== record.product_currency) throw new BankingError("CURRENCY_MISMATCH", "Loan product and destination account currencies must match.");
    await assertNoOriginationRestrictions(tx, record.customer_id);
    const policy = validateLoanApplication({ ...input, annualInterestRate: record.interest_rate, today: new Date().toISOString().slice(0, 10) });
    if (!policy.ok) throw new BankingError(policy.code, failureMessage(policy.code));
    await tx.execute(sql`select pg_advisory_xact_lock(738_204_043)`);
    const sequence = await tx.execute(sql`select coalesce(max(substring(reference from 5)::int), 0)::int + 1 as next from loan_applications where reference ~ '^LOA-[0-9]+$'`);
    const next = Number((sequence.rows as Array<{ next: number }>)[0]?.next ?? 1);
    const reference = `LOA-${next.toString().padStart(6, "0")}`;
    await tx.insert(loanApplications).values({
      reference, customerId: record.customer_id, productId: record.product_id, destinationAccountId: record.destination_account_id,
      branchId: record.branch_id, principal: policy.principal, currency: record.product_currency, termMonths: input.termMonths,
      annualInterestRate: policy.annualInterestRate, firstPaymentDate: input.firstPaymentDate,
      projectedInstallment: policy.projectedInstallment, monthlyIncome: policy.monthlyIncome,
      monthlyCommitments: policy.monthlyCommitments, debtServiceRatio: policy.debtServiceRatio,
      riskGrade: policy.riskGrade, purpose: policy.purpose, idempotencyKey, requestedBy: actor.id,
    });
    const workItem = await createApprovalWorkItem(tx, {
      type: "LOAN_ORIGINATION", priority: "HIGH", entityType: "LOAN_APPLICATION", entityReference: reference,
      title: `Approve loan application ${reference}`,
      description: `${policy.principal} ${record.product_currency} over ${input.termMonths} months; DSR ${policy.debtServiceRatio}%.`,
      requiredRole: "SUPERVISOR", dueAt: new Date(Date.now() + 2 * 86_400_000),
    }, actor);
    await tx.insert(auditEvents).values({
      actorUserId: actor.id, actorUsername: actor.username, action: "LOAN_APPLICATION_SUBMITTED", entityType: "LOAN_APPLICATION",
      entityReference: reference, correlationId: idempotencyKey, before: null,
      after: { customerNumber: input.customerNumber, productCode: input.productCode, destinationAccountNumber: input.destinationAccountNumber,
        principal: policy.principal, currency: record.product_currency, termMonths: input.termMonths, projectedInstallment: policy.projectedInstallment,
        debtServiceRatio: policy.debtServiceRatio, riskGrade: policy.riskGrade, workItemReference: workItem.reference },
    });
    return { reference, workItemReference: workItem.reference, duplicate: false };
  });
}

export async function decideLoanApplication(input: {
  applicationReference: string;
  workItemReference: string;
  expectedVersion: number;
  decision: "APPROVE" | "REJECT";
  comment: string;
}, actor: SessionUser) {
  const comment = input.comment.trim();
  if (comment.length < 10 || comment.length > 500) throw new BankingError("COMMENT_REQUIRED", "Enter decision evidence between 10 and 500 characters.");
  return db.transaction(async (tx) => {
    const item = await lockApprovalWorkItem(tx, { reference: input.workItemReference, entityType: "LOAN_APPLICATION", entityReference: input.applicationReference, expectedVersion: input.expectedVersion }, actor);
    const result = await tx.execute(sql`
      select application.id, application.reference, application.status::text, application.customer_id,
             customer.status::text as customer_status, customer.kyc_status::text,
             application.product_id, product.kind::text as product_kind, product.active as product_active, product.currency as product_currency,
             application.destination_account_id, destination.customer_id as destination_customer_id,
             destination.currency as destination_currency, destination.status::text as destination_status,
             destination.read_only as destination_read_only, destination.balance::text as destination_balance,
             destination.available_balance::text as destination_available_balance, application.branch_id,
             application.principal::text, application.currency, application.term_months, application.annual_interest_rate::text,
             application.first_payment_date::text, application.projected_installment::text, application.monthly_income::text,
             application.monthly_commitments::text, application.risk_grade, application.purpose,
             application.loan_account_id, application.origination_transaction_id, application.version
      from loan_applications application
      join customers customer on customer.id = application.customer_id
      join products product on product.id = application.product_id
      join bank_accounts destination on destination.id = application.destination_account_id
      where application.reference = ${input.applicationReference}
      for update of application, destination
    `);
    const application = (result.rows as unknown as LockedApplication[])[0];
    if (!application) throw new BankingError("LOAN_APPLICATION_NOT_FOUND", "The loan application was not found.");
    if (application.status !== "PENDING_APPROVAL" || application.loan_account_id || application.origination_transaction_id) throw new BankingError("LOAN_APPLICATION_NOT_PENDING", "The loan application is no longer pending approval.");
    const now = new Date();
    if (input.decision === "REJECT") {
      await tx.update(loanApplications).set({ status: "REJECTED", decidedBy: actor.id, decisionComment: comment, decidedAt: now, version: application.version + 1, updatedAt: now }).where(eq(loanApplications.id, application.id));
      await decideWorkItem(tx, item, "REJECTED", comment, actor);
      await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "LOAN_APPLICATION_REJECTED", entityType: "LOAN_APPLICATION", entityReference: application.reference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" }, after: { status: "REJECTED", comment } });
      return { reference: application.reference, loanAccountNumber: null, transactionReference: null };
    }
    if (application.customer_status !== "ACTIVE" || application.kyc_status !== "APPROVED") throw new BankingError("KYC_NOT_APPROVED", "The customer must still be active with approved KYC.");
    if (application.product_kind !== "LOAN" || !application.product_active || application.product_currency !== application.currency) throw new BankingError("LOAN_PRODUCT_UNAVAILABLE", "The selected loan product is no longer eligible.");
    if (application.destination_customer_id !== application.customer_id || application.destination_status !== "ACTIVE" || application.destination_read_only || application.destination_currency !== application.currency) throw new BankingError("DESTINATION_INELIGIBLE", "The disbursement account is no longer eligible.");
    await assertNoOriginationRestrictions(tx, application.customer_id);
    const today = now.toISOString().slice(0, 10);
    const policy = validateLoanApplication({ principal: application.principal, annualInterestRate: application.annual_interest_rate,
      termMonths: application.term_months, firstPaymentDate: application.first_payment_date, monthlyIncome: application.monthly_income,
      monthlyCommitments: application.monthly_commitments, purpose: application.purpose, riskGrade: application.risk_grade, today });
    if (!policy.ok) throw new BankingError(policy.code, failureMessage(policy.code));
    if (policy.projectedInstallment !== application.projected_installment) throw new BankingError("LOAN_TERMS_INCONSISTENT", "The stored loan projection no longer matches the approved calculation policy.");
    await assertPostingDateOpen(tx, today);
    await tx.execute(sql`select pg_advisory_xact_lock(738_204_044)`);
    const accountSequence = await tx.execute(sql`select (coalesce(max(account_number::bigint), 1000000000) + 1)::text as next from bank_accounts where account_number ~ '^[0-9]{10}$'`);
    const accountNumber = String((accountSequence.rows as Array<{ next: string }>)[0]?.next);
    if (!/^\d{10}$/.test(accountNumber)) throw new BankingError("ACCOUNT_SEQUENCE_UNAVAILABLE", "A new loan account number could not be allocated.");
    const destinationAfter = minorUnitsToMoney(signedMoneyToMinorUnits(application.destination_balance) + moneyToMinorUnits(policy.principal));
    const destinationAvailableAfter = minorUnitsToMoney(signedMoneyToMinorUnits(application.destination_available_balance) + moneyToMinorUnits(policy.principal));
    const [loanAccount] = await tx.insert(bankAccounts).values({
      accountNumber, customerId: application.customer_id, productId: application.product_id, branchId: application.branch_id,
      nickname: `Loan ${application.reference}`, currency: application.currency, balance: policy.principal, availableBalance: "0.00",
      status: "ACTIVE", readOnly: true, openedAt: today, maturityDate: policy.maturityDate,
    }).returning();
    const transactionReference = `TX-${application.reference}`;
    const [transaction] = await tx.insert(ledgerTransactions).values({
      reference: transactionReference, bookedAt: now, valueDate: today, description: `Loan disbursement ${application.reference}`,
      type: "LOAN_ORIGINATION", status: "BOOKED", currency: application.currency, amount: policy.principal,
      counterparty: accountNumber,
    }).returning();
    await tx.insert(ledgerEntries).values([
      { transactionId: transaction.id, accountId: loanAccount.id, direction: "DEBIT", amount: policy.principal, balanceAfter: policy.principal },
      { transactionId: transaction.id, accountId: application.destination_account_id, direction: "CREDIT", amount: policy.principal, balanceAfter: destinationAfter },
    ]);
    await postSubledgerToGeneralLedger(tx, transaction.id);
    await tx.update(bankAccounts).set({ balance: destinationAfter, availableBalance: destinationAvailableAfter, updatedAt: now }).where(eq(bankAccounts.id, application.destination_account_id));
    await tx.insert(loanDetails).values({ accountId: loanAccount.id, originationApplicationId: application.id,
      originalPrincipal: policy.principal, outstandingPrincipal: policy.principal, interestRate: policy.annualInterestRate,
      installmentAmount: policy.projectedInstallment, nextPaymentDate: application.first_payment_date,
      termMonths: application.term_months, maturityDate: policy.maturityDate });
    const schedule = generateLoanSchedule({ principal: policy.principal, annualInterestRate: policy.annualInterestRate, termMonths: application.term_months, firstPaymentDate: application.first_payment_date });
    await tx.insert(loanRepayments).values(schedule.map((line) => ({ accountId: loanAccount.id, sequence: line.sequence,
      dueDate: line.dueDate, principal: line.principal, interest: line.interest, status: "SCHEDULED" })));
    await tx.update(loanApplications).set({ status: "APPROVED", approvedPrincipal: policy.principal, loanAccountId: loanAccount.id,
      originationTransactionId: transaction.id, decidedBy: actor.id, decisionComment: comment, decidedAt: now,
      version: application.version + 1, updatedAt: now }).where(eq(loanApplications.id, application.id));
    await decideWorkItem(tx, item, "APPROVED", comment, actor);
    await tx.insert(auditEvents).values({
      actorUserId: actor.id, actorUsername: actor.username, action: "LOAN_ORIGINATION_APPROVED", entityType: "LOAN_APPLICATION",
      entityReference: application.reference, correlationId: crypto.randomUUID(), before: { status: "PENDING_APPROVAL" },
      after: { status: "APPROVED", principal: policy.principal, currency: application.currency, accountNumber,
        transactionReference, scheduleCount: schedule.length, maturityDate: policy.maturityDate, comment },
    });
    return { reference: application.reference, loanAccountNumber: accountNumber, transactionReference };
  });
}
