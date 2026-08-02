import { describe, expect, it } from "vitest";
import { getTableConfig, type AnyPgTable } from "drizzle-orm/pg-core";
import {
  addresses,
  auditEvents,
  bankAccounts,
  beneficiaries,
  clearingAccounts,
  clearingEntries,
  contactPoints,
  customerDocumentFiles,
  customerRelationships,
  customers,
  directDebitCollections,
  directDebitMandates,
  endOfDayPostings,
  endOfDayRuns,
  identityDocuments,
  ledgerEntries,
  ledgerTransactions,
  loanDetails,
  loanApplications,
  loanRepayments,
  overdraftFacilities,
  paymentInstructionExecutions,
  paymentInstructions,
  paymentOrders,
  paymentReversals,
  processingRuns,
  productChargeRules,
  reconciliationItems,
  reconciliationRuns,
  settlementRecords,
  products,
  session,
  staffProfiles,
  user,
} from "@/db/schema";

const tableName = (table: AnyPgTable) => getTableConfig(table).name;

describe("database model contract", () => {
  it("contains authentication, customer, account, payment, loan and audit entities", () => {
    const actual = [
      user,
      session,
      staffProfiles,
      customers,
      addresses,
      contactPoints,
      customerDocumentFiles,
      identityDocuments,
      customerRelationships,
      products,
      bankAccounts,
      beneficiaries,
      paymentOrders,
      paymentReversals,
      directDebitMandates,
      directDebitCollections,
      paymentInstructions,
      paymentInstructionExecutions,
      processingRuns,
      endOfDayRuns,
      endOfDayPostings,
      productChargeRules,
      settlementRecords,
      reconciliationRuns,
      reconciliationItems,
      ledgerTransactions,
      ledgerEntries,
      clearingAccounts,
      clearingEntries,
      loanDetails,
      loanApplications,
      loanRepayments,
      auditEvents,
    ].map(tableName);

    expect(actual).toEqual(expect.arrayContaining([
      "user",
      "session",
      "staff_profiles",
      "customers",
      "customer_document_files",
      "bank_accounts",
      "payment_orders",
      "payment_reversals",
      "direct_debit_mandates",
      "direct_debit_collections",
      "payment_instructions",
      "payment_instruction_executions",
      "processing_runs",
      "end_of_day_runs",
      "end_of_day_postings",
      "product_charge_rules",
      "settlement_records",
      "reconciliation_runs",
      "reconciliation_items",
      "ledger_transactions",
      "ledger_entries",
      "clearing_entries",
      "loan_details",
      "loan_applications",
      "audit_events",
    ]));
  });

  it("stores all material monetary values as numeric(18,2)", () => {
    const moneyColumns = [
      bankAccounts.balance,
      bankAccounts.availableBalance,
      overdraftFacilities.approvedLimit,
      paymentOrders.amount,
      paymentReversals.amount,
      paymentInstructions.amount,
      directDebitMandates.maximumSingleAmount,
      directDebitCollections.amount,
      productChargeRules.amount,
      endOfDayPostings.amount,
      settlementRecords.amount,
      ledgerTransactions.amount,
      ledgerEntries.amount,
      ledgerEntries.balanceAfter,
      clearingAccounts.balance,
      clearingEntries.amount,
      clearingEntries.balanceAfter,
      loanDetails.originalPrincipal,
      loanDetails.outstandingPrincipal,
      loanDetails.installmentAmount,
      loanApplications.principal,
      loanApplications.projectedInstallment,
      loanApplications.monthlyIncome,
      loanApplications.monthlyCommitments,
      loanRepayments.principal,
      loanRepayments.interest,
    ];
    for (const column of moneyColumns) {
      expect(column.getSQLType(), column.name).toBe("numeric(18, 2)");
      expect(column.notNull, column.name).toBe(true);
    }
  });

  it("enforces unique human references and payment idempotency keys", () => {
    expect(customers.customerNumber.isUnique).toBe(true);
    expect(bankAccounts.accountNumber.isUnique).toBe(true);
    expect(paymentOrders.reference.isUnique).toBe(true);
    expect(paymentOrders.idempotencyKey.isUnique).toBe(true);
    expect(paymentReversals.reference.isUnique).toBe(true);
    expect(paymentReversals.idempotencyKey.isUnique).toBe(true);
    expect(paymentInstructions.reference.isUnique).toBe(true);
    expect(loanApplications.reference.isUnique).toBe(true);
    expect(loanApplications.idempotencyKey.isUnique).toBe(true);
    expect(paymentInstructionExecutions.idempotencyKey.isUnique).toBe(true);
    expect(processingRuns.reference.isUnique).toBe(true);
    expect(endOfDayRuns.reference.isUnique).toBe(true);
    expect(endOfDayRuns.businessDate.isUnique).toBe(true);
    expect(productChargeRules.reference.isUnique).toBe(true);
    expect(endOfDayPostings.reference.isUnique).toBe(true);
    expect(endOfDayPostings.idempotencyKey.isUnique).toBe(true);
    expect(settlementRecords.reference.isUnique).toBe(true);
    expect(settlementRecords.transactionReference.isUnique).toBe(true);
    expect(reconciliationRuns.reference.isUnique).toBe(true);
    expect(reconciliationRuns.businessDate.isUnique).toBe(true);
    expect(reconciliationItems.reference.isUnique).toBe(true);
    expect(directDebitMandates.reference.isUnique).toBe(true);
    expect(directDebitCollections.reference.isUnique).toBe(true);
    expect(directDebitCollections.idempotencyKey.isUnique).toBe(true);
    expect(ledgerTransactions.reference.isUnique).toBe(true);
  });

  it("captures the append-only audit payload contract", () => {
    const config = getTableConfig(auditEvents);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    for (const required of [
      "occurred_at",
      "actor_username",
      "action",
      "entity_type",
      "entity_reference",
      "correlation_id",
    ]) {
      expect(columns.get(required)?.notNull, required).toBe(true);
    }
    expect(columns.has("before")).toBe(true);
    expect(columns.has("after")).toBe(true);
  });
});
