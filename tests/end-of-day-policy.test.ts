import { describe, expect, it } from "vitest";
import { calculateDailyInterest, validateDailyOverdraftCharge, validateEndOfDayDate } from "@/modules/domain/end-of-day-policy";

describe("end-of-day policy", () => {
  it("calculates daily interest exactly and rounds half up to minor units", () => {
    expect(calculateDailyInterest("24780.55", "3.2500")).toBe("2.21");
    expect(calculateDailyInterest("185000.00", "2.7500")).toBe("13.94");
    expect(calculateDailyInterest("-1.00", "3.2500")).toBe("0.00");
  });
  it.each([
    [{ businessDate: "2026-02-30", today: "2026-08-02" }, "INVALID_DATE"],
    [{ businessDate: "2026-08-03", today: "2026-08-02" }, "FUTURE_BUSINESS_DATE"],
  ])("rejects invalid run dates", (input, code) => expect(validateEndOfDayDate(input)).toEqual({ ok: false, code }));
  it("accepts an affordable daily overdraft charge", () => expect(validateDailyOverdraftCharge({ balance: "-240.50", availableBalance: "759.50", amount: "0.75", accountStatus: "ACTIVE", readOnly: false })).toEqual({ ok: true }));
  it("does not charge a positive balance", () => expect(validateDailyOverdraftCharge({ balance: "1.00", availableBalance: "1.00", amount: "0.75", accountStatus: "ACTIVE", readOnly: false })).toEqual({ ok: false, code: "NO_OVERDRAFT_USAGE" }));
});
