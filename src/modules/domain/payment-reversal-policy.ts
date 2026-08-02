import { moneyToMinorUnits, signedMoneyToMinorUnits } from "./transfer-policy";

export function validateReversalRequest(input: { paymentStatus: string; existingReversal: boolean; reason: string }) {
  if (input.paymentStatus !== "BOOKED") return { ok: false as const, code: "PAYMENT_NOT_BOOKED" as const };
  if (input.existingReversal) return { ok: false as const, code: "PAYMENT_ALREADY_REVERSED" as const };
  if (input.reason.trim().length < 10) return { ok: false as const, code: "REVERSAL_REASON_REQUIRED" as const };
  return { ok: true as const };
}

export function validateInternalReversalFunds(input: { amount: string; destinationAvailableBalance: string; destinationStatus: string; destinationReadOnly: boolean }) {
  if (input.destinationStatus !== "ACTIVE" || input.destinationReadOnly) return { ok: false as const, code: "DESTINATION_UNAVAILABLE" as const };
  try {
    if (moneyToMinorUnits(input.amount) > signedMoneyToMinorUnits(input.destinationAvailableBalance)) return { ok: false as const, code: "REVERSAL_FUNDS_UNAVAILABLE" as const };
  } catch { return { ok: false as const, code: "INVALID_AMOUNT" as const }; }
  return { ok: true as const };
}
