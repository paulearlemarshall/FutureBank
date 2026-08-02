import { minorUnitsToMoney, moneyToMinorUnits } from "./transfer-policy";

const RATE = /^\d+(?:\.\d{1,4})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_PRINCIPAL = 100_000n;
const MAX_PRINCIPAL = 100_000_000n;
const MAX_DSR_BASIS_POINTS = 4_000n;

function rateToUnits(value: string): bigint {
  if (!RATE.test(value)) throw new Error("INVALID_RATE");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
}

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function addMonthsClamped(value: string, months: number): string {
  if (!validDate(value)) throw new Error("INVALID_DATE");
  const [year, month, day] = value.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

export type LoanScheduleLine = {
  sequence: number;
  dueDate: string;
  principal: string;
  interest: string;
  total: string;
  outstandingAfter: string;
};

export function generateLoanSchedule(input: { principal: string; annualInterestRate: string; termMonths: number; firstPaymentDate: string }): LoanScheduleLine[] {
  const principal = moneyToMinorUnits(input.principal);
  const rateUnits = rateToUnits(input.annualInterestRate);
  if (principal <= 0n || !Number.isInteger(input.termMonths) || input.termMonths < 1 || !validDate(input.firstPaymentDate)) throw new Error("INVALID_SCHEDULE");
  const months = BigInt(input.termMonths);
  const basePrincipal = principal / months;
  const remainder = principal % months;
  let outstanding = principal;
  const denominator = 12n * 100n * 10_000n;
  return Array.from({ length: input.termMonths }, (_, index) => {
    const principalDue = basePrincipal + (BigInt(index) < remainder ? 1n : 0n);
    const interestDue = roundHalfUp(outstanding * rateUnits, denominator);
    outstanding -= principalDue;
    return {
      sequence: index + 1,
      dueDate: addMonthsClamped(input.firstPaymentDate, index),
      principal: minorUnitsToMoney(principalDue),
      interest: minorUnitsToMoney(interestDue),
      total: minorUnitsToMoney(principalDue + interestDue),
      outstandingAfter: minorUnitsToMoney(outstanding),
    };
  });
}

export function debtServiceRatio(input: { monthlyIncome: string; monthlyCommitments: string; projectedInstallment: string }): string {
  const income = moneyToMinorUnits(input.monthlyIncome);
  const commitments = moneyToMinorUnits(input.monthlyCommitments);
  const installment = moneyToMinorUnits(input.projectedInstallment);
  if (income <= 0n) throw new Error("INVALID_INCOME");
  const basisPoints = roundHalfUp((commitments + installment) * 10_000n, income);
  return minorUnitsToMoney(basisPoints);
}

export function validateLoanApplication(input: {
  principal: string;
  annualInterestRate: string;
  termMonths: number;
  firstPaymentDate: string;
  monthlyIncome: string;
  monthlyCommitments: string;
  purpose: string;
  riskGrade: string;
  today: string;
}) {
  let principal: bigint;
  let income: bigint;
  let commitments: bigint;
  let rateUnits: bigint;
  try {
    principal = moneyToMinorUnits(input.principal);
    income = moneyToMinorUnits(input.monthlyIncome);
    commitments = moneyToMinorUnits(input.monthlyCommitments);
    rateUnits = rateToUnits(input.annualInterestRate);
  } catch {
    return { ok: false as const, code: "INVALID_LOAN_AMOUNT" as const };
  }
  if (principal < MIN_PRINCIPAL || principal > MAX_PRINCIPAL) return { ok: false as const, code: "PRINCIPAL_OUT_OF_RANGE" as const };
  if (rateUnits <= 0n || rateUnits > 500_000n) return { ok: false as const, code: "INVALID_INTEREST_RATE" as const };
  if (!Number.isInteger(input.termMonths) || input.termMonths < 6 || input.termMonths > 60) return { ok: false as const, code: "INVALID_TERM" as const };
  if (!validDate(input.firstPaymentDate) || !validDate(input.today) || input.firstPaymentDate <= input.today) return { ok: false as const, code: "INVALID_FIRST_PAYMENT_DATE" as const };
  if (income <= 0n || commitments < 0n || commitments >= income) return { ok: false as const, code: "INVALID_AFFORDABILITY" as const };
  if (input.purpose.trim().length < 10 || input.purpose.trim().length > 500) return { ok: false as const, code: "INVALID_PURPOSE" as const };
  if (!(["A", "B", "C"] as string[]).includes(input.riskGrade)) return { ok: false as const, code: "INVALID_RISK_GRADE" as const };
  const schedule = generateLoanSchedule({ principal: minorUnitsToMoney(principal), annualInterestRate: input.annualInterestRate, termMonths: input.termMonths, firstPaymentDate: input.firstPaymentDate });
  const ratio = debtServiceRatio({ monthlyIncome: minorUnitsToMoney(income), monthlyCommitments: minorUnitsToMoney(commitments), projectedInstallment: schedule[0].total });
  if (moneyToMinorUnits(ratio) > MAX_DSR_BASIS_POINTS) return { ok: false as const, code: "AFFORDABILITY_EXCEEDED" as const, debtServiceRatio: ratio };
  return {
    ok: true as const,
    principal: minorUnitsToMoney(principal),
    annualInterestRate: `${rateUnits / 10_000n}.${(rateUnits % 10_000n).toString().padStart(4, "0")}`,
    monthlyIncome: minorUnitsToMoney(income),
    monthlyCommitments: minorUnitsToMoney(commitments),
    purpose: input.purpose.trim(),
    riskGrade: input.riskGrade,
    debtServiceRatio: ratio,
    projectedInstallment: schedule[0].total,
    maturityDate: schedule.at(-1)!.dueDate,
    schedule,
  };
}
