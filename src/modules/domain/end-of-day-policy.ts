import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "./transfer-policy";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validateEndOfDayDate(input: { businessDate: string; today: string }) {
  if (!validDate(input.businessDate) || !validDate(input.today)) return { ok: false as const, code: "INVALID_DATE" as const };
  if (input.businessDate > input.today) return { ok: false as const, code: "FUTURE_BUSINESS_DATE" as const };
  return { ok: true as const };
}

function rateToScaledUnits(rate: string): bigint {
  if (!/^\d+(?:\.\d{1,4})?$/.test(rate)) throw new Error("INVALID_RATE");
  const [whole, fraction = ""] = rate.split(".");
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
}

export function calculateDailyInterest(balance: string, annualRate: string, daysInYear = 365): string {
  if (!Number.isInteger(daysInYear) || daysInYear <= 0) throw new Error("INVALID_DAY_BASIS");
  const principal = signedMoneyToMinorUnits(balance);
  if (principal <= 0n) return "0.00";
  const rate = rateToScaledUnits(annualRate);
  if (rate <= 0n) return "0.00";
  const denominator = 100n * 10_000n * BigInt(daysInYear);
  const roundedMinorUnits = (principal * rate + denominator / 2n) / denominator;
  return minorUnitsToMoney(roundedMinorUnits);
}

export function validateDailyOverdraftCharge(input: { balance: string; availableBalance: string; amount: string; accountStatus: string; readOnly: boolean }) {
  if (input.accountStatus !== "ACTIVE" || input.readOnly) return { ok: false as const, code: "ACCOUNT_UNAVAILABLE" as const };
  try {
    if (signedMoneyToMinorUnits(input.balance) >= 0n) return { ok: false as const, code: "NO_OVERDRAFT_USAGE" as const };
    const amount = moneyToMinorUnits(input.amount);
    if (amount <= 0n) return { ok: false as const, code: "INVALID_AMOUNT" as const };
    if (amount > signedMoneyToMinorUnits(input.availableBalance)) return { ok: false as const, code: "INSUFFICIENT_AVAILABLE_BALANCE" as const };
  } catch { return { ok: false as const, code: "INVALID_AMOUNT" as const }; }
  return { ok: true as const };
}
