import { describe, expect, it } from "vitest";
import { estimatedDailyInterest, overdraftHeadroom, overdraftUtilization, projectedAvailableBalance, requiresOtherAccountReview, requiresUkRepeatUseReview, validateLimitReduction } from "@/modules/domain/overdraft-policy";

describe("arranged overdraft policy", () => {
  it("calculates utilization, headroom and available balance", () => {
    expect(overdraftUtilization("-240.50")).toBe("240.50");
    expect(overdraftUtilization("100.00")).toBe("0.00");
    expect(overdraftHeadroom("1000.00", "-240.50", "100.00", "ACTIVE")).toBe("659.50");
    expect(projectedAvailableBalance("-240.50", "1000.00", "100.00", "ACTIVE")).toBe("659.50");
    expect(projectedAvailableBalance("-240.50", "1000.00", "0.00", "SUSPENDED")).toBe("-240.50");
  });

  it("rejects reductions below utilization plus holds", () => {
    expect(validateLimitReduction("340.50", "-240.50", "100.00")).toBe(true);
    expect(validateLimitReduction("340.49", "-240.50", "100.00")).toBe(false);
  });

  it("calculates display-only daily interest", () => {
    expect(estimatedDailyInterest("1000.00", "18.2500")).toBe("0.50");
  });

  it("evaluates repeat-use demo triggers", () => {
    expect(requiresUkRepeatUseReview({ overdraftDaysByMonth: [15, 16, 18], averageUtilizationPercentByMonth: [10, 20, 30], regularCreditChangePercent: 0, utilizationRising: false })).toBe(true);
    expect(requiresUkRepeatUseReview({ overdraftDaysByMonth: [1, 2, 3], averageUtilizationPercentByMonth: [55, 51, 20], regularCreditChangePercent: 0, utilizationRising: false })).toBe(true);
    expect(requiresOtherAccountReview(30, 80)).toBe(true);
  });
});
