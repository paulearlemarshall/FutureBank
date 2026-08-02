import { describe, expect, it } from "vitest";
import {
  isPaymentInstructionDue,
  nextPaymentInstructionDate,
  validatePaymentInstructionSchedule,
} from "@/modules/domain/payment-instruction-policy";

describe("payment instruction schedules", () => {
  it("accepts a future-dated one-off payment", () => {
    expect(validatePaymentInstructionSchedule({
      type: "SCHEDULED", frequency: "ONCE", startDate: "2026-08-12", today: "2026-08-02",
    })).toEqual({ ok: true, startDate: "2026-08-12", endDate: null, anchorDay: 12 });
  });

  it.each([
    [{ type: "SCHEDULED" as const, frequency: "MONTHLY" as const, startDate: "2026-08-12", today: "2026-08-02" }, "INVALID_FREQUENCY"],
    [{ type: "STANDING_ORDER" as const, frequency: "ONCE" as const, startDate: "2026-08-12", today: "2026-08-02" }, "INVALID_FREQUENCY"],
    [{ type: "SCHEDULED" as const, frequency: "ONCE" as const, startDate: "2026-02-30", today: "2026-02-01" }, "INVALID_DATE"],
    [{ type: "SCHEDULED" as const, frequency: "ONCE" as const, startDate: "2026-08-01", today: "2026-08-02" }, "START_DATE_IN_PAST"],
    [{ type: "STANDING_ORDER" as const, frequency: "WEEKLY" as const, startDate: "2026-08-12", endDate: "2026-08-11", today: "2026-08-02" }, "END_BEFORE_START"],
  ])("rejects an invalid schedule with %s", (input, code) => {
    expect(validatePaymentInstructionSchedule(input)).toEqual({ ok: false, code });
  });

  it("advances weekly schedules by seven days", () => {
    expect(nextPaymentInstructionDate("2026-08-12", "WEEKLY", 12)).toBe("2026-08-19");
  });

  it("preserves a monthly anchor and clamps short months", () => {
    expect(nextPaymentInstructionDate("2026-01-31", "MONTHLY", 31)).toBe("2026-02-28");
    expect(nextPaymentInstructionDate("2026-02-28", "MONTHLY", 31)).toBe("2026-03-31");
  });

  it("marks all instructions on or before the business date as due", () => {
    expect(isPaymentInstructionDue("2026-08-02", "2026-08-02")).toBe(true);
    expect(isPaymentInstructionDue("2026-08-01", "2026-08-02")).toBe(true);
    expect(isPaymentInstructionDue("2026-08-03", "2026-08-02")).toBe(false);
  });
});
