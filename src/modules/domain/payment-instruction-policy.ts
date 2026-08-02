import type { PaymentInstructionFrequency, PaymentInstructionType } from "@/modules/contracts";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string): Date | null {
  if (!isoDatePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return parsed;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type PaymentInstructionScheduleResult =
  | { ok: true; startDate: string; endDate: string | null; anchorDay: number }
  | { ok: false; code: "INVALID_DATE" | "START_DATE_IN_PAST" | "END_BEFORE_START" | "INVALID_FREQUENCY" };

export function validatePaymentInstructionSchedule(input: {
  type: PaymentInstructionType;
  frequency: PaymentInstructionFrequency;
  startDate: string;
  endDate?: string | null;
  today: string;
}): PaymentInstructionScheduleResult {
  const start = parseIsoDate(input.startDate);
  const today = parseIsoDate(input.today);
  const end = input.endDate ? parseIsoDate(input.endDate) : null;
  if (!start || !today || (input.endDate && !end)) return { ok: false, code: "INVALID_DATE" };
  if (input.startDate < input.today) return { ok: false, code: "START_DATE_IN_PAST" };
  if (end && input.endDate! < input.startDate) return { ok: false, code: "END_BEFORE_START" };
  if (
    (input.type === "SCHEDULED" && input.frequency !== "ONCE") ||
    (input.type === "STANDING_ORDER" && !["WEEKLY", "MONTHLY"].includes(input.frequency))
  ) return { ok: false, code: "INVALID_FREQUENCY" };
  return { ok: true, startDate: formatIsoDate(start), endDate: end ? formatIsoDate(end) : null, anchorDay: start.getUTCDate() };
}

export function nextPaymentInstructionDate(
  current: string,
  frequency: PaymentInstructionFrequency,
  anchorDay: number,
): string | null {
  const date = parseIsoDate(current);
  if (!date || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error("Invalid payment instruction schedule");
  }
  if (frequency === "ONCE") return null;
  if (frequency === "WEEKLY") {
    date.setUTCDate(date.getUTCDate() + 7);
    return formatIsoDate(date);
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const daysInNextMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatIsoDate(new Date(Date.UTC(year, month, Math.min(anchorDay, daysInNextMonth))));
}

export function isPaymentInstructionDue(nextExecutionDate: string, businessDate: string): boolean {
  if (!parseIsoDate(nextExecutionDate) || !parseIsoDate(businessDate)) throw new Error("Invalid payment instruction date");
  return nextExecutionDate <= businessDate;
}
