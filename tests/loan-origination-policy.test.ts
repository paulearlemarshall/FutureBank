import { describe, expect, it } from "vitest";
import { addMonthsClamped, debtServiceRatio, generateLoanSchedule, validateLoanApplication } from "@/modules/domain/loan-origination-policy";
import { moneyToMinorUnits } from "@/modules/domain/transfer-policy";

describe("loan origination policy", () => {
  it("builds an exact declining-interest schedule whose principal reconciles", () => {
    const schedule = generateLoanSchedule({ principal: "10000.00", annualInterestRate: "6.2500", termMonths: 12, firstPaymentDate: "2026-09-30" });
    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toMatchObject({ sequence: 1, dueDate: "2026-09-30", principal: "833.34", interest: "52.08", total: "885.42" });
    expect(schedule[1].dueDate).toBe("2026-10-30");
    expect(schedule.at(-1)?.outstandingAfter).toBe("0.00");
    expect(schedule.reduce((sum, line) => sum + moneyToMinorUnits(line.principal), 0n)).toBe(1_000_000n);
    expect(moneyToMinorUnits(schedule[1].interest)).toBeLessThan(moneyToMinorUnits(schedule[0].interest));
  });

  it("clamps month-end due dates without local-time drift", () => {
    expect(addMonthsClamped("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("calculates debt-service ratio in exact basis points", () => {
    expect(debtServiceRatio({ monthlyIncome: "5000.00", monthlyCommitments: "900.00", projectedInstallment: "1100.00" })).toBe("40.00");
  });

  it("accepts the boundary and rejects unaffordable or invalid applications", () => {
    const base = { principal: "10000.00", annualInterestRate: "6.2500", termMonths: 12, firstPaymentDate: "2026-09-15", monthlyIncome: "5000.00", monthlyCommitments: "1000.00", purpose: "Purchase fictional delivery vehicles", riskGrade: "B", today: "2026-08-02" };
    expect(validateLoanApplication(base)).toMatchObject({ ok: true, principal: "10000.00", debtServiceRatio: "37.71", projectedInstallment: "885.42", maturityDate: "2027-08-15" });
    expect(validateLoanApplication({ ...base, monthlyCommitments: "1500.00" })).toMatchObject({ ok: false, code: "AFFORDABILITY_EXCEEDED" });
    expect(validateLoanApplication({ ...base, principal: "999.99" })).toEqual({ ok: false, code: "PRINCIPAL_OUT_OF_RANGE" });
    expect(validateLoanApplication({ ...base, firstPaymentDate: "2026-08-02" })).toEqual({ ok: false, code: "INVALID_FIRST_PAYMENT_DATE" });
  });
});
