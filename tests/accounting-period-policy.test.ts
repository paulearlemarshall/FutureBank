import { describe, expect, it } from "vitest";
import { validateAccountingPeriodRange } from "@/modules/domain/accounting-period-policy";

describe("accounting period policy", () => {
  it("accepts a bounded period and rejects invalid or reversed dates", () => {
    expect(validateAccountingPeriodRange({ startDate: "2026-07-01", endDate: "2026-07-18" }).ok).toBe(true);
    expect(validateAccountingPeriodRange({ startDate: "2026-07-31", endDate: "2026-07-01" }).ok).toBe(false);
    expect(validateAccountingPeriodRange({ startDate: "2026-02-30", endDate: "2026-03-01" }).ok).toBe(false);
  });
});
