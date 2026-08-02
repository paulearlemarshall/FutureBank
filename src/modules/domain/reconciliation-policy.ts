import { moneyToMinorUnits } from "./transfer-policy";

export type ReconciliationSide = { direction: "DEBIT" | "CREDIT"; amount: string; currency: string };

export function classifyReconciliation(internal: ReconciliationSide | null, external: ReconciliationSide | null) {
  if (!internal) return { type: "MISSING_INTERNAL" as const, status: "OPEN" as const };
  if (!external) return { type: "MISSING_EXTERNAL" as const, status: "OPEN" as const };
  if (internal.currency !== external.currency) return { type: "CURRENCY_MISMATCH" as const, status: "OPEN" as const };
  if (moneyToMinorUnits(internal.amount) !== moneyToMinorUnits(external.amount)) return { type: "AMOUNT_MISMATCH" as const, status: "OPEN" as const };
  if (internal.direction !== external.direction) return { type: "DIRECTION_MISMATCH" as const, status: "OPEN" as const };
  return { type: "MATCHED" as const, status: "MATCHED" as const };
}

export function validateReconciliationDate(input: { businessDate: string; today: string }) {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  if (!valid(input.businessDate) || !valid(input.today)) return { ok: false as const, code: "INVALID_DATE" as const };
  if (input.businessDate > input.today) return { ok: false as const, code: "FUTURE_BUSINESS_DATE" as const };
  return { ok: true as const };
}
