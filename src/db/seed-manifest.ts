import { createHash } from "node:crypto";
import { BASELINE_CUSTOMER_NUMBERS } from "@/modules/contracts";
import { assertBalancedEntries, minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "@/modules/domain/transfer-policy";

export function stableUuid(key: string): string {
  const hex = createHash("sha256").update(`futurebank:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export const baselineCustomers = [
  { customerNumber: "C000001", partyType: "RETAIL", title: "Ms", givenName: "Amelia", familyName: "Hart", legalName: null, shortName: "Amelia Hart", dateOfBirth: "1987-04-16", registrationNumber: null, gender: "Female", maritalStatus: "Married", nationality: "GB", residenceCountry: "GB", sector: "Personal Banking", industry: "Healthcare", status: "ACTIVE", kycStatus: "APPROVED", riskRating: "LOW", kycReviewDate: "2029-04-16", taxId: "GB-FIC-000001", branchCode: "LON001", relationshipManager: "Sofia Bennett" },
  { customerNumber: "C000002", partyType: "RETAIL", title: "Mr", givenName: "Omar", familyName: "Al Mansoori", legalName: null, shortName: "Omar Al Mansoori", dateOfBirth: "1979-11-03", registrationNumber: null, gender: "Male", maritalStatus: "Married", nationality: "AE", residenceCountry: "AE", sector: "Personal Banking", industry: "Aviation", status: "ACTIVE", kycStatus: "APPROVED", riskRating: "MEDIUM", kycReviewDate: "2027-01-20", taxId: "AE-FIC-000002", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
  { customerNumber: "C000003", partyType: "RETAIL", title: "Dr", givenName: "Priya", familyName: "Nair", legalName: null, shortName: "Priya Nair", dateOfBirth: "1991-08-22", registrationNumber: null, gender: "Female", maritalStatus: "Single", nationality: "IN", residenceCountry: "AE", sector: "Personal Banking", industry: "Technology", status: "ACTIVE", kycStatus: "DUE", riskRating: "LOW", kycReviewDate: "2026-08-15", taxId: "AE-FIC-000003", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
  { customerNumber: "C000004", partyType: "SME", title: null, givenName: null, familyName: null, legalName: "Northstar Sustainable Logistics Ltd", shortName: "Northstar Logistics", dateOfBirth: null, registrationNumber: "09990041", gender: null, maritalStatus: null, nationality: "GB", residenceCountry: "GB", sector: "Corporate Banking", industry: "Logistics", status: "ACTIVE", kycStatus: "APPROVED", riskRating: "MEDIUM", kycReviewDate: "2027-02-10", taxId: "GB-FIC-SME004", branchCode: "LON001", relationshipManager: "Sofia Bennett" },
  { customerNumber: "C000005", partyType: "SME", title: null, givenName: null, familyName: null, legalName: "Crescent Digital Trading FZ-LLC", shortName: "Crescent Digital", dateOfBirth: null, registrationNumber: "FIC-DDA-88210", gender: null, maritalStatus: null, nationality: "AE", residenceCountry: "AE", sector: "Business Banking", industry: "E-commerce", status: "RESTRICTED", kycStatus: "REJECTED", riskRating: "HIGH", kycReviewDate: "2026-07-20", taxId: "AE-FIC-SME005", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
] as const;

export const baselineBranches = [
  { code: "LON001", name: "London City", country: "GB" },
  { code: "DXB001", name: "Dubai Central", country: "AE" },
] as const;

export const baselineProducts = [
  { code: "CUR-GBP", name: "Future Current GBP", kind: "CURRENT", currency: "GBP", interestRate: "0.0000", minimumOpeningBalance: "0.00" },
  { code: "SAV-GBP", name: "Future Saver GBP", kind: "SAVINGS", currency: "GBP", interestRate: "3.2500", minimumOpeningBalance: "100.00" },
  { code: "CUR-AED", name: "Future Current AED", kind: "CURRENT", currency: "AED", interestRate: "0.0000", minimumOpeningBalance: "0.00" },
  { code: "SAV-AED", name: "Future Saver AED", kind: "SAVINGS", currency: "AED", interestRate: "2.7500", minimumOpeningBalance: "500.00" },
  { code: "FCY-USD", name: "Foreign Currency USD", kind: "FOREIGN_CURRENCY", currency: "USD", interestRate: "0.2500", minimumOpeningBalance: "100.00" },
  { code: "FCY-EUR", name: "Foreign Currency EUR", kind: "FOREIGN_CURRENCY", currency: "EUR", interestRate: "0.1500", minimumOpeningBalance: "100.00" },
  { code: "TD-GBP", name: "Term Deposit GBP", kind: "TERM_DEPOSIT", currency: "GBP", interestRate: "4.1000", minimumOpeningBalance: "5000.00" },
  { code: "LOAN-GBP", name: "Business Loan GBP", kind: "LOAN", currency: "GBP", interestRate: "6.2500", minimumOpeningBalance: "0.00" },
  { code: "LOAN-AED", name: "Business Loan AED", kind: "LOAN", currency: "AED", interestRate: "5.9000", minimumOpeningBalance: "0.00" },
] as const;

export const baselineAccounts = [
  { accountNumber: "1000000001", customerNumber: "C000001", productCode: "CUR-GBP", branchCode: "LON001", nickname: "Everyday", balance: "-240.50", overdraftLimit: "1000.00", openedAt: "2019-06-14" },
  { accountNumber: "1000000002", customerNumber: "C000001", productCode: "SAV-GBP", branchCode: "LON001", nickname: "Rainy Day", balance: "24780.55", overdraftLimit: "0.00", openedAt: "2020-02-11" },
  { accountNumber: "1000000003", customerNumber: "C000001", productCode: "FCY-EUR", branchCode: "LON001", nickname: "Travel EUR", balance: "3260.80", overdraftLimit: "0.00", openedAt: "2022-05-04" },
  { accountNumber: "1000000004", customerNumber: "C000002", productCode: "CUR-AED", branchCode: "DXB001", nickname: "Daily Banking", balance: "62150.25", overdraftLimit: "10000.00", openedAt: "2017-09-19" },
  { accountNumber: "1000000005", customerNumber: "C000002", productCode: "SAV-AED", branchCode: "DXB001", nickname: "Family Savings", balance: "185000.00", overdraftLimit: "0.00", openedAt: "2018-01-12" },
  { accountNumber: "1000000006", customerNumber: "C000002", productCode: "FCY-USD", branchCode: "DXB001", nickname: "USD Reserve", balance: "19540.10", overdraftLimit: "0.00", openedAt: "2021-10-08" },
  { accountNumber: "1000000007", customerNumber: "C000003", productCode: "CUR-AED", branchCode: "DXB001", nickname: "Salary", balance: "28455.73", overdraftLimit: "5000.00", openedAt: "2023-03-26" },
  { accountNumber: "1000000008", customerNumber: "C000003", productCode: "SAV-AED", branchCode: "DXB001", nickname: "Goals", balance: "74500.00", overdraftLimit: "0.00", openedAt: "2023-04-01" },
  { accountNumber: "1000000009", customerNumber: "C000004", productCode: "CUR-GBP", branchCode: "LON001", nickname: "Operating", balance: "342190.44", overdraftLimit: "50000.00", openedAt: "2020-08-17" },
  { accountNumber: "1000000010", customerNumber: "C000004", productCode: "TD-GBP", branchCode: "LON001", nickname: "Reserve Deposit", balance: "250000.00", overdraftLimit: "0.00", openedAt: "2025-11-01", maturityDate: "2026-11-01" },
  { accountNumber: "1000000011", customerNumber: "C000004", productCode: "LOAN-GBP", branchCode: "LON001", nickname: "Fleet Finance", balance: "58500.00", overdraftLimit: "0.00", openedAt: "2024-01-15", readOnly: true },
  { accountNumber: "1000000012", customerNumber: "C000005", productCode: "CUR-AED", branchCode: "DXB001", nickname: "Trading", balance: "895420.32", overdraftLimit: "100000.00", openedAt: "2021-07-05" },
  { accountNumber: "1000000013", customerNumber: "C000005", productCode: "FCY-USD", branchCode: "DXB001", nickname: "Supplier USD", balance: "125300.00", overdraftLimit: "25000.00", openedAt: "2022-02-14" },
  { accountNumber: "1000000014", customerNumber: "C000005", productCode: "LOAN-AED", branchCode: "DXB001", nickname: "Warehouse Finance", balance: "115000.00", overdraftLimit: "0.00", openedAt: "2024-06-10", readOnly: true },
] as const;

const beneficiaryNames = ["Alex Morgan", "Greenfield Utilities", "Harbour Property Services", "Emirates Telecom Demo", "Nadia Rahman", "Atlas Office Supplies", "Westbridge Insurance", "Fictional Revenue Authority", "Metro Fleet Services", "Cloud Nine Software", "Beacon Freight Partners", "Orchid Media Studio"];
export const baselineBeneficiaries = beneficiaryNames.map((name, index) => ({
  id: stableUuid(`beneficiary-${index + 1}`),
  customerNumber: BASELINE_CUSTOMER_NUMBERS[index % 5],
  name,
  bankName: index % 2 ? "Demo International Bank" : "Example Clearing Bank",
  accountNumber: `900000${(index + 1).toString().padStart(4, "0")}`,
  iban: index % 3 === 0 ? `GB00FICT${(index + 1).toString().padStart(14, "0")}` : null,
  swiftBic: index % 2 ? "DEMOAEAD" : "FICTGB2L",
  currency: (["GBP", "AED", "USD", "EUR"] as const)[index % 4],
}));

const transactionDescriptions = ["Salary credit", "Card purchase", "Utility payment", "Online transfer", "Account fee", "Interest payment", "Standing order", "Cash withdrawal", "Supplier payment", "Insurance premium"];

export type BaselineTransaction = {
  id: string;
  reference: string;
  accountNumber: string;
  bookedAt: string;
  valueDate: string;
  description: string;
  type: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  balanceAfter: string;
  currency: string;
  counterparty: string;
};

export const baselineTransactions: BaselineTransaction[] = baselineAccounts.flatMap((account, accountIndex) => {
  const product = baselineProducts.find((item) => item.code === account.productCode)!;
  const movements = Array.from({ length: 25 }, (_, index) => {
    const direction: "DEBIT" | "CREDIT" = index % 5 === 0 ? "CREDIT" : "DEBIT";
    const amount = `${40 + ((accountIndex + 3) * (index + 7) * 17) % 950}.${((accountIndex + index) * 13 % 100).toString().padStart(2, "0")}`;
    return { direction, amount };
  });
  const target = signedMoneyToMinorUnits(account.balance);
  const net = movements.reduce((sum, item) => sum + (item.direction === "CREDIT" ? moneyToMinorUnits(item.amount) : -moneyToMinorUnits(item.amount)), 0n);
  let running = target - net;
  return movements.map((movement, index) => {
    running += movement.direction === "CREDIT" ? moneyToMinorUnits(movement.amount) : -moneyToMinorUnits(movement.amount);
    const day = new Date(Date.UTC(2026, 6, 18 - index * 5, 9 + (index % 8), accountIndex % 60));
    return {
      id: stableUuid(`transaction-${account.accountNumber}-${index + 1}`),
      reference: `TX-${account.accountNumber}-${(index + 1).toString().padStart(3, "0")}`,
      accountNumber: account.accountNumber,
      bookedAt: day.toISOString(),
      valueDate: day.toISOString().slice(0, 10),
      description: transactionDescriptions[(index + accountIndex) % transactionDescriptions.length],
      type: movement.direction === "CREDIT" ? "CREDIT" : "PAYMENT",
      direction: movement.direction,
      amount: movement.amount,
      balanceAfter: minorUnitsToMoney(running),
      currency: product.currency,
      counterparty: `Fictional Counterparty ${(index % 8) + 1}`,
    };
  });
});

export function validateBaselineSeed(): string[] {
  const errors: string[] = [];
  if (baselineCustomers.length !== 5) errors.push("Expected exactly five customers");
  if (baselineCustomers.filter((item) => item.partyType === "RETAIL").length !== 3) errors.push("Expected three retail customers");
  if (baselineCustomers.filter((item) => item.partyType === "SME").length !== 2) errors.push("Expected two SME customers");
  if (baselineAccounts.length !== 14) errors.push("Expected exactly fourteen accounts");
  for (const account of baselineAccounts) {
    const transactions = baselineTransactions.filter((item) => item.accountNumber === account.accountNumber);
    if (transactions.length < 25) errors.push(`${account.accountNumber} has fewer than 25 transactions`);
    for (const transaction of transactions) {
      const opposite = transaction.direction === "DEBIT" ? "CREDIT" : "DEBIT";
      if (!assertBalancedEntries([{ direction: transaction.direction, amount: transaction.amount }, { direction: opposite, amount: transaction.amount }])) {
        errors.push(`${transaction.reference} is unbalanced`);
      }
    }
  }
  const ids = [...baselineCustomers.map((item) => item.customerNumber), ...baselineAccounts.map((item) => item.accountNumber), ...baselineTransactions.map((item) => item.reference)];
  if (new Set(ids).size !== ids.length) errors.push("Baseline identifiers must be unique");
  if (baselineBeneficiaries.length < 12) errors.push("Expected at least twelve beneficiaries");
  return errors;
}
