import { moneyToMinorUnits } from "./transfer-policy";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validateMandatePeriod(input: { validFrom: string; validTo?: string | null; today: string }) {
  if (!validDate(input.validFrom) || !validDate(input.today) || (input.validTo && !validDate(input.validTo))) return { ok: false as const, code: "INVALID_DATE" as const };
  if (input.validFrom < input.today) return { ok: false as const, code: "START_DATE_IN_PAST" as const };
  if (input.validTo && input.validTo < input.validFrom) return { ok: false as const, code: "END_BEFORE_START" as const };
  return { ok: true as const };
}

export function validateDirectDebitCollection(input: {
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
  amount: string;
  maximumSingleAmount: string;
  collectionDate: string;
  validFrom: string;
  validTo: string | null;
  today?: string;
}) {
  if (!validDate(input.collectionDate)) return { ok: false as const, code: "INVALID_DATE" as const };
  if (input.status !== "ACTIVE") return { ok: false as const, code: "MANDATE_INACTIVE" as const };
  if (input.collectionDate < input.validFrom || (input.validTo && input.collectionDate > input.validTo)) return { ok: false as const, code: "OUTSIDE_MANDATE_PERIOD" as const };
  if (input.today && (!validDate(input.today) || input.collectionDate > input.today)) return { ok: false as const, code: "FUTURE_COLLECTION_DATE" as const };
  try {
    const amount = moneyToMinorUnits(input.amount);
    if (amount <= 0n) return { ok: false as const, code: "INVALID_AMOUNT" as const };
    if (amount > moneyToMinorUnits(input.maximumSingleAmount)) return { ok: false as const, code: "MANDATE_LIMIT_EXCEEDED" as const };
  } catch { return { ok: false as const, code: "INVALID_AMOUNT" as const }; }
  return { ok: true as const };
}
