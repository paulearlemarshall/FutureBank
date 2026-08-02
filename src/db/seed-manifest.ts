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
  { customerNumber: "C000001", partyType: "RETAIL", title: "Ms", givenName: "Amelia", familyName: "Hart", legalName: null, shortName: "Amelia Hart", dateOfBirth: "1987-04-16", registrationNumber: null, gender: "Female", maritalStatus: "Married", nationality: "GB", residenceCountry: "GB", language: "English", sector: "Personal Banking", industry: "Healthcare", status: "ACTIVE", kycStatus: "APPROVED", riskRating: "LOW", kycReviewDate: "2029-04-16", taxId: "GB-FIC-000001", branchCode: "LON001", relationshipManager: "Sofia Bennett" },
  { customerNumber: "C000002", partyType: "RETAIL", title: "Mr", givenName: "عمر", familyName: "المنصوري", legalName: null, shortName: "Omar Al Mansoori / عمر المنصوري", dateOfBirth: "1979-11-03", registrationNumber: null, gender: "Male", maritalStatus: "Married", nationality: "AE", residenceCountry: "AE", language: "Arabic", sector: "الخدمات المصرفية الشخصية", industry: "الطيران", status: "ACTIVE", kycStatus: "APPROVED", riskRating: "MEDIUM", kycReviewDate: "2027-01-20", taxId: "AE-FIC-000002", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
  { customerNumber: "C000003", partyType: "RETAIL", title: "Dr", givenName: "Priya", familyName: "Nair", legalName: null, shortName: "Priya Nair", dateOfBirth: "1991-08-22", registrationNumber: null, gender: "Female", maritalStatus: "Single", nationality: "IN", residenceCountry: "AE", language: "English", sector: "Personal Banking", industry: "Technology", status: "ACTIVE", kycStatus: "DUE", riskRating: "LOW", kycReviewDate: "2026-08-15", taxId: "AE-FIC-000003", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
  { customerNumber: "C000004", partyType: "SME", title: null, givenName: null, familyName: null, legalName: "Northstar Sustainable Logistics Ltd", shortName: "Northstar Logistics", dateOfBirth: null, registrationNumber: "09990041", gender: null, maritalStatus: null, nationality: "GB", residenceCountry: "GB", language: "English", sector: "Corporate Banking", industry: "Logistics", status: "ACTIVE", kycStatus: "APPROVED", riskRating: "MEDIUM", kycReviewDate: "2027-02-10", taxId: "GB-FIC-SME004", branchCode: "LON001", relationshipManager: "Sofia Bennett" },
  { customerNumber: "C000005", partyType: "SME", title: null, givenName: null, familyName: null, legalName: "شركة الهلال للتجارة الرقمية ش.م.ح-ذ.م.م", shortName: "Crescent Digital / الهلال الرقمية", dateOfBirth: null, registrationNumber: "FIC-DDA-88210", gender: null, maritalStatus: null, nationality: "AE", residenceCountry: "AE", language: "Arabic", sector: "الخدمات المصرفية للأعمال", industry: "التجارة الإلكترونية", status: "RESTRICTED", kycStatus: "REJECTED", riskRating: "HIGH", kycReviewDate: "2026-07-20", taxId: "AE-FIC-SME005", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
  { customerNumber: "C000006", partyType: "RETAIL", title: "Ms", givenName: "Sophie", familyName: "Turner", legalName: null, shortName: "Sophie Turner", dateOfBirth: "1994-02-18", registrationNumber: null, gender: "Female", maritalStatus: "Single", nationality: "GB", residenceCountry: "GB", language: "English", sector: "Personal Banking", industry: "Education", status: "INACTIVE", kycStatus: "NOT_STARTED", riskRating: "LOW", kycReviewDate: "2026-08-19", taxId: "GB-FIC-000006", branchCode: "LON001", relationshipManager: "Sofia Bennett" },
  { customerNumber: "C000007", partyType: "RETAIL", title: "Mr", givenName: "Yousef", familyName: "Haddad", legalName: null, shortName: "Yousef Haddad", dateOfBirth: "1988-06-09", registrationNumber: null, gender: "Male", maritalStatus: "Married", nationality: "JO", residenceCountry: "AE", language: "English", sector: "Personal Banking", industry: "Construction", status: "ACTIVE", kycStatus: "IN_PROGRESS", riskRating: "MEDIUM", kycReviewDate: "2026-08-20", taxId: "AE-FIC-000007", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
  { customerNumber: "C000008", partyType: "SME", title: null, givenName: null, familyName: null, legalName: "Harbour Green Energy Ltd", shortName: "Harbour Green", dateOfBirth: null, registrationNumber: "12188008", gender: null, maritalStatus: null, nationality: "GB", residenceCountry: "GB", language: "English", sector: "Corporate Banking", industry: "Renewable Energy", status: "ACTIVE", kycStatus: "PENDING_APPROVAL", riskRating: "MEDIUM", kycReviewDate: "2026-08-21", taxId: "GB-FIC-SME008", branchCode: "LON001", relationshipManager: "Sofia Bennett" },
  { customerNumber: "C000009", partyType: "RETAIL", title: "Mrs", givenName: "Layla", familyName: "Rahman", legalName: null, shortName: "Layla Rahman", dateOfBirth: "1983-12-27", registrationNumber: null, gender: "Female", maritalStatus: "Married", nationality: "LB", residenceCountry: "AE", language: "English", sector: "Personal Banking", industry: "Hospitality", status: "INACTIVE", kycStatus: "EXPIRED", riskRating: "HIGH", kycReviewDate: "2026-06-30", taxId: "AE-FIC-000009", branchCode: "DXB001", relationshipManager: "Daniel Okafor" },
] as const;

export const baselineCustomerAddressOverrides = {
  C000002: { line1: "١١ شارع المثال", line2: "مبنى المستقبل، الطابق ٤", city: "دبي", region: "دبي" },
  C000005: { line1: "٤٧ مجمع الأعمال الافتراضي", line2: "مكتب ٤١٠", city: "دبي", region: "دبي" },
} as const;

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
  { accountNumber: "1000000015", customerNumber: "C000007", productCode: "CUR-AED", branchCode: "DXB001", nickname: "Review Controlled", balance: "18500.00", overdraftLimit: "0.00", openedAt: "2022-09-12" },
  { accountNumber: "1000000016", customerNumber: "C000008", productCode: "CUR-GBP", branchCode: "LON001", nickname: "Approval Pending", balance: "86500.00", overdraftLimit: "0.00", openedAt: "2021-04-06" },
  { accountNumber: "1000000017", customerNumber: "C000009", productCode: "CUR-AED", branchCode: "DXB001", nickname: "Expired KYC Block", balance: "4200.00", overdraftLimit: "0.00", openedAt: "2018-11-20", status: "BLOCKED" },
  { accountNumber: "1000000018", customerNumber: "C000004", productCode: "SAV-GBP", branchCode: "LON001", nickname: "Closed Reserve", balance: "0.00", overdraftLimit: "0.00", openedAt: "2019-03-01", status: "CLOSED", closedAt: "2026-05-31T16:00:00.000Z" },
  { accountNumber: "1000000019", customerNumber: "C000004", productCode: "CUR-GBP", branchCode: "LON001", nickname: "Facility Lifecycle", balance: "-12000.00", overdraftLimit: "25000.00", openedAt: "2022-01-10" },
] as const;

const beneficiaryNames = ["Alex Morgan", "Greenfield Utilities", "Harbour Property Services", "Emirates Telecom Demo", "Nadia Rahman", "Atlas Office Supplies", "Westbridge Insurance", "Fictional Revenue Authority", "Metro Fleet Services", "Cloud Nine Software", "Beacon Freight Partners", "Orchid Media Studio", "Prospect Utility Demo", "Desert Build Supplies", "Green Turbine Services", "Legacy Hotel Services"];
export const baselineBeneficiaries = beneficiaryNames.map((name, index) => ({
  id: stableUuid(`beneficiary-${index + 1}`),
  customerNumber: index < 12 ? BASELINE_CUSTOMER_NUMBERS[index % 5] : BASELINE_CUSTOMER_NUMBERS[index - 7],
  name,
  bankName: index % 2 ? "Demo International Bank" : "Example Clearing Bank",
  accountNumber: `900000${(index + 1).toString().padStart(4, "0")}`,
  iban: index % 3 === 0 ? `GB00FICT${(index + 1).toString().padStart(14, "0")}` : null,
  swiftBic: index % 2 ? "DEMOAEAD" : "FICTGB2L",
  currency: (["GBP", "AED", "USD", "EUR"] as const)[index % 4],
  status: index === 12 ? "INACTIVE" as const : "ACTIVE" as const,
}));

export const baselinePaymentInstructions = [
  {
    reference: "PIN-000001", type: "SCHEDULED" as const, status: "ACTIVE" as const, paymentType: "INTERNAL" as const,
    sourceAccountNumber: "1000000002", destinationAccountNumber: "1000000001", beneficiaryKey: null,
    amount: "125.00", currency: "GBP", description: "Future-dated savings transfer", frequency: "ONCE" as const,
    startOffsetDays: 2, endOffsetDays: null, createdBy: "operator" as const,
  },
  {
    reference: "PIN-000002", type: "STANDING_ORDER" as const, status: "ACTIVE" as const, paymentType: "EXTERNAL" as const,
    sourceAccountNumber: "1000000004", destinationAccountNumber: null, beneficiaryKey: "beneficiary-2",
    amount: "750.00", currency: "AED", description: "Monthly fictional service payment", frequency: "MONTHLY" as const,
    startOffsetDays: 5, endOffsetDays: 370, createdBy: "operator" as const,
  },
  {
    reference: "PIN-000003", type: "STANDING_ORDER" as const, status: "CANCELLED" as const, paymentType: "EXTERNAL" as const,
    sourceAccountNumber: "1000000009", destinationAccountNumber: null, beneficiaryKey: "beneficiary-9",
    amount: "980.00", currency: "GBP", description: "Cancelled fictional supplier schedule", frequency: "WEEKLY" as const,
    startOffsetDays: 10, endOffsetDays: null, createdBy: "operator" as const,
  },
] as const;

export const baselineProductChargeRules = [
  { reference: "PCR-000001", productCode: "CUR-GBP", type: "DAILY_OVERDRAFT_USAGE" as const, amount: "0.75", currency: "GBP", effectiveFrom: "2026-01-01" },
  { reference: "PCR-000002", productCode: "CUR-AED", type: "DAILY_OVERDRAFT_USAGE" as const, amount: "3.00", currency: "AED", effectiveFrom: "2026-01-01" },
] as const;

export const baselineDirectDebitMandates = [
  { reference: "DDM-000001", status: "ACTIVE" as const, sourceAccountNumber: "1000000002", beneficiaryKey: "beneficiary-1", creditorMandateReference: "UTILITY-C1-001", maximumSingleAmount: "500.00", currency: "GBP", validFromOffset: 0, validToOffset: 365 },
  { reference: "DDM-000002", status: "SUSPENDED" as const, sourceAccountNumber: "1000000004", beneficiaryKey: "beneficiary-2", creditorMandateReference: "SERVICE-C2-002", maximumSingleAmount: "2500.00", currency: "AED", validFromOffset: -30, validToOffset: 335 },
  { reference: "DDM-000003", status: "CANCELLED" as const, sourceAccountNumber: "1000000009", beneficiaryKey: "beneficiary-9", creditorMandateReference: "SUPPLIER-C4-003", maximumSingleAmount: "1500.00", currency: "GBP", validFromOffset: -60, validToOffset: null },
] as const;

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
    const endDate = new Date("closedAt" in account ? account.closedAt : Date.UTC(2026, 6, 18, 17, accountIndex % 60));
    const day = new Date(endDate.getTime() - (movements.length - 1 - index) * 5 * 86_400_000);
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
  const hasArabicScript = (value: string | null) => Boolean(value && /\p{Script=Arabic}/u.test(value));
  if (baselineCustomers.length !== 9) errors.push("Expected exactly nine customers");
  if (baselineCustomers.filter((item) => item.partyType === "RETAIL").length !== 6) errors.push("Expected six retail customers");
  if (baselineCustomers.filter((item) => item.partyType === "SME").length !== 3) errors.push("Expected three SME customers");
  const arabicCustomers = baselineCustomers.filter((item) => item.language === "Arabic");
  if (arabicCustomers.length !== 2) errors.push("Expected exactly two Arabic-language customers");
  for (const customer of arabicCustomers) {
    if (!hasArabicScript(customer.legalName ?? customer.givenName) || !hasArabicScript(customer.shortName)) errors.push(`${customer.customerNumber} must include Arabic-script names`);
    if (!/[A-Za-z]/.test(customer.shortName)) errors.push(`${customer.customerNumber} must retain a Latin transliteration in short name`);
    const address = baselineCustomerAddressOverrides[customer.customerNumber as keyof typeof baselineCustomerAddressOverrides];
    if (!address || !hasArabicScript(address.line1) || !hasArabicScript(address.city)) errors.push(`${customer.customerNumber} must include an Arabic-script address`);
  }
  if (baselineAccounts.length !== 19) errors.push("Expected exactly nineteen accounts");
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
  if (baselinePaymentInstructions.length !== 3) errors.push("Expected three payment instruction scenarios");
  if (baselineDirectDebitMandates.length !== 3) errors.push("Expected three direct debit mandate scenarios");
  if (baselineProductChargeRules.length !== 2) errors.push("Expected two daily overdraft charge rules");
  if (baselineTransactions.filter((item) => item.valueDate === "2026-07-18").length !== 18) errors.push("Expected eighteen internal clearing entries for the reconciliation scenario");
  return errors;
}
