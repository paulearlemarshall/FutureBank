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
  identityDocuments,
  ledgerEntries,
  ledgerTransactions,
  loanDetails,
  loanRepayments,
  overdraftFacilities,
  paymentOrders,
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
      ledgerTransactions,
      ledgerEntries,
      clearingAccounts,
      clearingEntries,
      loanDetails,
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
      "ledger_transactions",
      "ledger_entries",
      "clearing_entries",
      "loan_details",
      "audit_events",
    ]));
  });

  it("stores all material monetary values as numeric(18,2)", () => {
    const moneyColumns = [
      bankAccounts.balance,
      bankAccounts.availableBalance,
      overdraftFacilities.approvedLimit,
      paymentOrders.amount,
      ledgerTransactions.amount,
      ledgerEntries.amount,
      ledgerEntries.balanceAfter,
      clearingAccounts.balance,
      clearingEntries.amount,
      clearingEntries.balanceAfter,
      loanDetails.originalPrincipal,
      loanDetails.outstandingPrincipal,
      loanDetails.installmentAmount,
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
