import { describe, expect, it } from "vitest";
import { validateDirectDebitCollection, validateMandatePeriod } from "@/modules/domain/direct-debit-policy";

describe("direct debit mandate policy", () => {
  it("accepts a current bounded mandate", () => expect(validateMandatePeriod({ validFrom: "2026-08-02", validTo: "2027-08-02", today: "2026-08-02" })).toEqual({ ok: true }));
  it.each([
    [{ validFrom: "2026-02-30", today: "2026-02-01" }, "INVALID_DATE"],
    [{ validFrom: "2026-08-01", today: "2026-08-02" }, "START_DATE_IN_PAST"],
    [{ validFrom: "2026-08-03", validTo: "2026-08-02", today: "2026-08-02" }, "END_BEFORE_START"],
  ])("rejects invalid periods", (input, code) => expect(validateMandatePeriod(input)).toEqual({ ok: false, code }));

  const collection = { status: "ACTIVE" as const, amount: "25.00", maximumSingleAmount: "100.00", collectionDate: "2026-08-10", validFrom: "2026-08-01", validTo: "2027-08-01" };
  it("accepts a collection inside the live mandate and amount cap", () => expect(validateDirectDebitCollection(collection)).toEqual({ ok: true }));
  it.each([
    [{ status: "CANCELLED" as const }, "MANDATE_INACTIVE"],
    [{ amount: "100.01" }, "MANDATE_LIMIT_EXCEEDED"],
    [{ collectionDate: "2027-08-02" }, "OUTSIDE_MANDATE_PERIOD"],
  ])("rejects invalid collection conditions", (override, code) => expect(validateDirectDebitCollection({ ...collection, ...override })).toEqual({ ok: false, code }));
});
