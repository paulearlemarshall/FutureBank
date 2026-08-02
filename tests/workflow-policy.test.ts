import { describe, expect, it } from "vitest";
import { assertMakerChecker, canCheckWorkItem, isActiveApprovalStatus } from "@/modules/domain/workflow-policy";

describe("maker-checker policy", () => {
  it("maps work types to independent checker roles", () => {
    expect(canCheckWorkItem("KYC_APPROVAL", "COMPLIANCE")).toBe(true);
    expect(canCheckWorkItem("KYC_APPROVAL", "SUPERVISOR")).toBe(false);
    expect(canCheckWorkItem("PAYMENT_APPROVAL", "SUPERVISOR")).toBe(true);
    expect(canCheckWorkItem("PAYMENT_REVERSAL", "SUPERVISOR")).toBe(true);
    expect(canCheckWorkItem("OVERDRAFT_APPROVAL", "ADMIN")).toBe(true);
    expect(canCheckWorkItem("ACCOUNTING_PERIOD_CLOSE", "ADMIN")).toBe(true);
    expect(canCheckWorkItem("ACCOUNTING_PERIOD_CLOSE", "SUPERVISOR")).toBe(false);
    expect(canCheckWorkItem("GENERAL_LEDGER_JOURNAL", "ADMIN")).toBe(true);
    expect(canCheckWorkItem("GENERAL_LEDGER_JOURNAL", "SUPERVISOR")).toBe(false);
  });

  it("rejects self approval, stale versions and completed work", () => {
    expect(() => assertMakerChecker({ makerUserId: "a", checkerUserId: "a", expectedVersion: 1, actualVersion: 1, status: "OPEN" })).toThrow("SELF_APPROVAL_FORBIDDEN");
    expect(() => assertMakerChecker({ makerUserId: "a", checkerUserId: "b", expectedVersion: 1, actualVersion: 2, status: "OPEN" })).toThrow("STALE_WORK_ITEM");
    expect(() => assertMakerChecker({ makerUserId: "a", checkerUserId: "b", expectedVersion: 1, actualVersion: 1, status: "COMPLETED" })).toThrow("WORK_ITEM_NOT_ACTIVE");
  });

  it("recognizes the two active queue states", () => {
    expect(isActiveApprovalStatus("OPEN")).toBe(true);
    expect(isActiveApprovalStatus("ASSIGNED")).toBe(true);
    expect(isActiveApprovalStatus("APPROVED")).toBe(false);
  });
});
