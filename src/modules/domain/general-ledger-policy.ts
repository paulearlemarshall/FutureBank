import { minorUnitsToMoney, moneyToMinorUnits } from "./transfer-policy";

export type GeneralLedgerAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type GeneralLedgerDirection = "DEBIT" | "CREDIT";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function generalLedgerAccountCode(kind: "SETTLEMENT" | "LOAN" | "CUSTOMER" | "FEE_INCOME" | "INTEREST_EXPENSE", currency: string): string {
  const prefix = kind === "SETTLEMENT" ? "1100" : kind === "LOAN" ? "1200" : kind === "CUSTOMER" ? "2100" : kind === "FEE_INCOME" ? "4100" : "5100";
  return `${prefix}-${currency}`;
}

export function generalLedgerAccountCodeForLeg(input: { transactionType: string; legType: "ACCOUNT" | "CLEARING"; accountKind?: string | null; currency: string }): string {
  if (input.legType === "ACCOUNT") return generalLedgerAccountCode(input.accountKind === "LOAN" ? "LOAN" : "CUSTOMER", input.currency);
  if (input.transactionType === "ACCOUNT_CHARGE") return generalLedgerAccountCode("FEE_INCOME", input.currency);
  if (input.transactionType === "DEPOSIT_INTEREST") return generalLedgerAccountCode("INTEREST_EXPENSE", input.currency);
  return generalLedgerAccountCode("SETTLEMENT", input.currency);
}

export function validateManualJournalInput(input: { valueDate: string; currency: string; debitAccountCode: string; creditAccountCode: string; amount: string; description: string; comment: string }) {
  if (!isValidDate(input.valueDate)) return { ok: false as const, code: "INVALID_DATE" as const };
  if (!CURRENCY.test(input.currency)) return { ok: false as const, code: "INVALID_CURRENCY" as const };
  if (input.debitAccountCode === input.creditAccountCode) return { ok: false as const, code: "SAME_GL_ACCOUNT" as const };
  let amount: bigint;
  try { amount = moneyToMinorUnits(input.amount); } catch { return { ok: false as const, code: "INVALID_AMOUNT" as const }; }
  if (amount <= 0n) return { ok: false as const, code: "INVALID_AMOUNT" as const };
  if (input.description.trim().length < 5 || input.description.trim().length > 200) return { ok: false as const, code: "INVALID_DESCRIPTION" as const };
  if (input.comment.trim().length < 10 || input.comment.trim().length > 500) return { ok: false as const, code: "COMMENT_REQUIRED" as const };
  return { ok: true as const, amount: minorUnitsToMoney(amount), description: input.description.trim(), comment: input.comment.trim() };
}

export function isBalancedGeneralLedger(lines: Array<{ direction: GeneralLedgerDirection; amount: string }>): boolean {
  const debit = lines.filter((line) => line.direction === "DEBIT").reduce((sum, line) => sum + moneyToMinorUnits(line.amount), 0n);
  const credit = lines.filter((line) => line.direction === "CREDIT").reduce((sum, line) => sum + moneyToMinorUnits(line.amount), 0n);
  return debit > 0n && debit === credit;
}

export function naturalBalance(type: GeneralLedgerAccountType, debit: string, credit: string): string {
  const debitMinor = moneyToMinorUnits(debit);
  const creditMinor = moneyToMinorUnits(credit);
  return minorUnitsToMoney(["LIABILITY", "EQUITY", "INCOME"].includes(type) ? creditMinor - debitMinor : debitMinor - creditMinor);
}
