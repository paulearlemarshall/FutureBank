import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "./transfer-policy";

export type FacilityStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "DECLINED" | "PENDING_CHANGE" | "SUSPENDED" | "EXPIRED" | "CLOSED";

export function overdraftUtilization(ledgerBalance: string): string {
  const balance = signedMoneyToMinorUnits(ledgerBalance);
  return minorUnitsToMoney(balance < 0n ? -balance : 0n);
}

export function overdraftHeadroom(approvedLimit: string, ledgerBalance: string, activeHolds: string, status: FacilityStatus): string {
  if (status !== "ACTIVE" && status !== "PENDING_CHANGE") return "0.00";
  const result = moneyToMinorUnits(approvedLimit) - moneyToMinorUnits(overdraftUtilization(ledgerBalance)) - moneyToMinorUnits(activeHolds);
  return minorUnitsToMoney(result > 0n ? result : 0n);
}

export function projectedAvailableBalance(ledgerBalance: string, approvedLimit: string, activeHolds: string, status: FacilityStatus): string {
  const drawableLimit = status === "ACTIVE" || status === "PENDING_CHANGE" ? moneyToMinorUnits(approvedLimit) : 0n;
  return minorUnitsToMoney(signedMoneyToMinorUnits(ledgerBalance) + drawableLimit - moneyToMinorUnits(activeHolds));
}

export function validateLimitReduction(newLimit: string, ledgerBalance: string, activeHolds: string): boolean {
  return moneyToMinorUnits(newLimit) >= moneyToMinorUnits(overdraftUtilization(ledgerBalance)) + moneyToMinorUnits(activeHolds);
}

export function estimatedDailyInterest(utilization: string, annualRate: string): string {
  const amount = Number(utilization);
  const rate = Number(annualRate) / 100;
  return Number.isFinite(amount) && Number.isFinite(rate) ? (amount * rate / 365).toFixed(2) : "0.00";
}

export function requiresOtherAccountReview(consecutiveDays: number, utilizationPercent: number): boolean {
  return consecutiveDays >= 30 && utilizationPercent >= 80;
}

export function requiresUkRepeatUseReview(input: {
  overdraftDaysByMonth: [number, number, number];
  averageUtilizationPercentByMonth: [number, number, number];
  regularCreditChangePercent: number;
  utilizationRising: boolean;
}): boolean {
  const threeMonthUse = input.overdraftDaysByMonth.every((days) => days >= 15);
  const highAverage = input.averageUtilizationPercentByMonth.filter((value) => value >= 50).length >= 2;
  const deterioratingCredits = input.regularCreditChangePercent <= -25 && input.utilizationRising;
  return threeMonthUse || highAverage || deterioratingCredits;
}
