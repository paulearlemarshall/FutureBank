const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validateAccountingPeriodRange(input: { startDate: string; endDate: string }) {
  if (!validDate(input.startDate) || !validDate(input.endDate)) return { ok: false as const, code: "INVALID_DATE" as const };
  if (input.startDate > input.endDate) return { ok: false as const, code: "INVALID_RANGE" as const };
  return { ok: true as const };
}
