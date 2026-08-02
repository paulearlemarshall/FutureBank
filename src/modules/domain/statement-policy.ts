import type { AccountStatement } from "@/modules/contracts";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string): Date | null {
  if (!isoDatePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
}

export type StatementPeriodResult =
  | { ok: true; fromDate: string; toDate: string }
  | { ok: false; code: "INVALID_DATE" | "INVALID_PERIOD" | "PERIOD_TOO_LONG" };

export function validateStatementPeriod(fromDate: string, toDate: string): StatementPeriodResult {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from || !to) return { ok: false, code: "INVALID_DATE" };
  if (from > to) return { ok: false, code: "INVALID_PERIOD" };
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > 366) return { ok: false, code: "PERIOD_TOO_LONG" };
  return { ok: true, fromDate, toDate };
}

export function defaultStatementPeriod(today = new Date(), inclusiveDays = 90): { fromDate: string; toDate: string } {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, inclusiveDays) + 1);
  return { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
}

function csvText(value: string): string {
  const safe = /^[=+@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const csvNarrative = (value: string) => value.startsWith("-") ? `'${value}` : value;

export function renderAccountStatementCsv(statement: AccountStatement): string {
  const lines = [
    ["FutureBank fictional demonstration statement"],
    ["Account", statement.accountNumber],
    ["Customer", `${statement.customerNumber} · ${statement.customerName}`],
    ["Product", statement.productName],
    ["Period", statement.fromDate, statement.toDate],
    ["Opening balance", statement.openingBalance, statement.currency],
    ["Closing balance", statement.closingBalance, statement.currency],
    [],
    ["Value date", "Booked at", "Reference", "Description", "Counterparty", "Debit", "Credit", "Balance", "Currency"],
    ...statement.entries.map((entry) => [
      entry.valueDate,
      entry.bookedAt,
      entry.reference,
      csvNarrative(entry.description),
      csvNarrative(entry.counterparty ?? ""),
      entry.direction === "DEBIT" ? entry.amount : "",
      entry.direction === "CREDIT" ? entry.amount : "",
      entry.balanceAfter,
      entry.currency,
    ]),
  ];
  return `\uFEFF${lines.map((row) => row.map(csvText).join(",")).join("\r\n")}\r\n`;
}
