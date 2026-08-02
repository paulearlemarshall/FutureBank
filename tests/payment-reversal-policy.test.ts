import { describe, expect, it } from "vitest";
import { validateInternalReversalFunds, validateReversalRequest } from "@/modules/domain/payment-reversal-policy";

describe("payment reversal policy", () => {
  it("accepts a first full reversal of a booked payment", () => expect(validateReversalRequest({ paymentStatus: "BOOKED", existingReversal: false, reason: "Duplicate customer payment" })).toEqual({ ok: true }));
  it.each([
    [{ paymentStatus: "PENDING", existingReversal: false, reason: "Duplicate customer payment" }, "PAYMENT_NOT_BOOKED"],
    [{ paymentStatus: "BOOKED", existingReversal: true, reason: "Duplicate customer payment" }, "PAYMENT_ALREADY_REVERSED"],
    [{ paymentStatus: "BOOKED", existingReversal: false, reason: "short" }, "REVERSAL_REASON_REQUIRED"],
  ])("rejects an ineligible request", (input, code) => expect(validateReversalRequest(input)).toEqual({ ok: false, code }));
  it("requires internal destination funds", () => expect(validateInternalReversalFunds({ amount: "100.00", destinationAvailableBalance: "99.99", destinationStatus: "ACTIVE", destinationReadOnly: false })).toEqual({ ok: false, code: "REVERSAL_FUNDS_UNAVAILABLE" }));
  it("accepts exact internal destination funds", () => expect(validateInternalReversalFunds({ amount: "100.00", destinationAvailableBalance: "100.00", destinationStatus: "ACTIVE", destinationReadOnly: false })).toEqual({ ok: true }));
});
