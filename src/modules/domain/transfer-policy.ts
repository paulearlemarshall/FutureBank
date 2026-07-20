export type TransferPolicyInput = {
  amount: string;
  sourceCurrency: string;
  destinationCurrency: string;
  availableBalance: string;
  sourceStatus: "ACTIVE" | "BLOCKED" | "CLOSED";
  destinationStatus?: "ACTIVE" | "BLOCKED" | "CLOSED";
  sourceReadOnly?: boolean;
};

export type TransferPolicyResult =
  | { ok: true; amount: string }
  | { ok: false; code: "INVALID_AMOUNT" | "ACCOUNT_UNAVAILABLE" | "READ_ONLY_ACCOUNT" | "CURRENCY_MISMATCH" | "INSUFFICIENT_FUNDS" };

const MONEY = /^\d+(?:\.\d{1,2})?$/;
const SIGNED_MONEY = /^-?\d+(?:\.\d{1,2})?$/;

export function moneyToMinorUnits(value: string): bigint {
  if (!MONEY.test(value)) throw new Error("Invalid monetary value");
  return signedMoneyToMinorUnits(value);
}

export function signedMoneyToMinorUnits(value: string): bigint {
  if (!SIGNED_MONEY.test(value)) throw new Error("Invalid monetary value");
  const [whole, fraction = ""] = value.split(".");
  const negative = whole.startsWith("-");
  const wholeMinor = BigInt(whole) * 100n;
  const fractionMinor = BigInt(fraction.padEnd(2, "0"));
  return negative ? wholeMinor - fractionMinor : wholeMinor + fractionMinor;
}

export function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function validateTransfer(input: TransferPolicyInput): TransferPolicyResult {
  let amount: bigint;
  try {
    amount = moneyToMinorUnits(input.amount);
  } catch {
    return { ok: false, code: "INVALID_AMOUNT" };
  }
  if (amount <= 0n) return { ok: false, code: "INVALID_AMOUNT" };
  if (input.sourceStatus !== "ACTIVE" || (input.destinationStatus && input.destinationStatus !== "ACTIVE")) {
    return { ok: false, code: "ACCOUNT_UNAVAILABLE" };
  }
  if (input.sourceReadOnly) return { ok: false, code: "READ_ONLY_ACCOUNT" };
  if (input.sourceCurrency !== input.destinationCurrency) return { ok: false, code: "CURRENCY_MISMATCH" };
  if (signedMoneyToMinorUnits(input.availableBalance) < amount) return { ok: false, code: "INSUFFICIENT_FUNDS" };
  return { ok: true, amount: minorUnitsToMoney(amount) };
}

export function assertBalancedEntries(entries: Array<{ direction: "DEBIT" | "CREDIT"; amount: string }>): boolean {
  return entries.reduce((sum, entry) => sum + (entry.direction === "DEBIT" ? -moneyToMinorUnits(entry.amount) : moneyToMinorUnits(entry.amount)), 0n) === 0n;
}
