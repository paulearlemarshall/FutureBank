import { describe, expect, it } from "vitest";
import { hasPermission, hasRequiredRole } from "@/modules/domain/auth-policy";

describe("role boundaries", () => {
  it("allows operators to perform operator work", () => {
    expect(hasRequiredRole("OPERATOR", "OPERATOR")).toBe(true);
  });

  it("denies operators access to administrator work", () => {
    expect(hasRequiredRole("OPERATOR", "ADMIN")).toBe(false);
  });

  it.each(["OPERATOR", "ADMIN"] as const)(
    "allows administrators to satisfy the %s requirement",
    (required) => expect(hasRequiredRole("ADMIN", required)).toBe(true),
  );

  it("separates operator, supervisor and compliance duties", () => {
    expect(hasPermission("OPERATOR", "PAYMENT_INITIATE")).toBe(true);
    expect(hasPermission("OPERATOR", "PAYMENT_DECIDE")).toBe(false);
    expect(hasPermission("OPERATOR", "PAYMENT_REVERSAL_INITIATE")).toBe(true);
    expect(hasPermission("OPERATOR", "PAYMENT_REVERSAL_DECIDE")).toBe(false);
    expect(hasPermission("SUPERVISOR", "PAYMENT_REVERSAL_DECIDE")).toBe(true);
    expect(hasPermission("OPERATOR", "PAYMENT_INSTRUCTION_MAINTAIN")).toBe(true);
    expect(hasPermission("OPERATOR", "PAYMENT_SCHEDULE_EXECUTE")).toBe(false);
    expect(hasPermission("SUPERVISOR", "PAYMENT_SCHEDULE_EXECUTE")).toBe(true);
    expect(hasPermission("OPERATOR", "END_OF_DAY_EXECUTE")).toBe(false);
    expect(hasPermission("SUPERVISOR", "END_OF_DAY_EXECUTE")).toBe(true);
    expect(hasPermission("OPERATOR", "RECONCILIATION_EXECUTE")).toBe(false);
    expect(hasPermission("SUPERVISOR", "RECONCILIATION_EXECUTE")).toBe(true);
    expect(hasPermission("SUPERVISOR", "RECONCILIATION_RESOLVE")).toBe(true);
    expect(hasPermission("SUPERVISOR", "ACCOUNTING_PERIOD_CLOSE_INITIATE")).toBe(true);
    expect(hasPermission("SUPERVISOR", "ACCOUNTING_PERIOD_CLOSE_DECIDE")).toBe(false);
    expect(hasPermission("SUPERVISOR", "GENERAL_LEDGER_JOURNAL_INITIATE")).toBe(true);
    expect(hasPermission("SUPERVISOR", "GENERAL_LEDGER_JOURNAL_DECIDE")).toBe(false);
    expect(hasPermission("OPERATOR", "LOAN_ORIGINATION_INITIATE")).toBe(true);
    expect(hasPermission("OPERATOR", "LOAN_ORIGINATION_DECIDE")).toBe(false);
    expect(hasPermission("SUPERVISOR", "LOAN_ORIGINATION_DECIDE")).toBe(true);
    expect(hasPermission("SUPERVISOR", "PAYMENT_INSTRUCTION_MAINTAIN")).toBe(false);
    expect(hasPermission("OPERATOR", "DIRECT_DEBIT_MAINTAIN")).toBe(true);
    expect(hasPermission("OPERATOR", "DIRECT_DEBIT_COLLECT")).toBe(true);
    expect(hasPermission("SUPERVISOR", "DIRECT_DEBIT_COLLECT")).toBe(false);
    expect(hasPermission("SUPERVISOR", "OVERDRAFT_DECIDE")).toBe(true);
    expect(hasPermission("SUPERVISOR", "KYC_DECIDE")).toBe(false);
    expect(hasPermission("COMPLIANCE", "KYC_DECIDE")).toBe(true);
    expect(hasPermission("COMPLIANCE", "PAYMENT_DECIDE")).toBe(false);
    expect(hasPermission("ADMIN", "DEMO_RESET")).toBe(true);
    expect(hasPermission("ADMIN", "END_OF_DAY_EXECUTE")).toBe(true);
    expect(hasPermission("ADMIN", "RECONCILIATION_RESOLVE")).toBe(true);
    expect(hasPermission("ADMIN", "ACCOUNTING_PERIOD_CLOSE_INITIATE")).toBe(false);
    expect(hasPermission("ADMIN", "ACCOUNTING_PERIOD_CLOSE_DECIDE")).toBe(true);
    expect(hasPermission("ADMIN", "GENERAL_LEDGER_JOURNAL_INITIATE")).toBe(false);
    expect(hasPermission("ADMIN", "GENERAL_LEDGER_JOURNAL_DECIDE")).toBe(true);
    expect(hasPermission("ADMIN", "LOAN_ORIGINATION_INITIATE")).toBe(true);
    expect(hasPermission("ADMIN", "LOAN_ORIGINATION_DECIDE")).toBe(true);
  });
});
