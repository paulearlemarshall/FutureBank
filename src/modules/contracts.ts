export type StaffRole = "OPERATOR" | "ADMIN";
export type PartyType = "RETAIL" | "SME";
export type CustomerStatus = "ACTIVE" | "INACTIVE" | "RESTRICTED";
export type KycStatus = "COMPLETE" | "DUE" | "REVIEW";
export type RiskRating = "LOW" | "MEDIUM" | "HIGH";
export type AccountStatus = "ACTIVE" | "BLOCKED" | "CLOSED";
export type AccountKind = "CURRENT" | "SAVINGS" | "TERM_DEPOSIT" | "FOREIGN_CURRENCY" | "LOAN";

export type FieldErrors = Record<string, string[]>;

export type ActionState = {
  ok: boolean;
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
};

export const initialActionState: ActionState = {
  ok: false,
  code: "IDLE",
  message: "",
};

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
};

export type DashboardSummary = {
  customers: number;
  activeAccounts: number;
  totalDeposits: string;
  pendingKycReviews: number;
  paymentsToday: number;
  recentActivity: AuditListItem[];
};

export type CustomerListItem = {
  customerNumber: string;
  partyType: PartyType;
  displayName: string;
  status: CustomerStatus;
  kycStatus: KycStatus;
  riskRating: RiskRating;
  nationality: string;
  updatedAt: string;
};

export type CustomerDetail = CustomerListItem & {
  title: string | null;
  givenName: string | null;
  familyName: string | null;
  legalName: string | null;
  shortName: string;
  dateOfBirth: string | null;
  registrationNumber: string | null;
  gender: string | null;
  maritalStatus: string | null;
  residenceCountry: string;
  language: string;
  sector: string;
  industry: string;
  taxId: string;
  branchCode: string;
  relationshipManager: string;
  kycReviewDate: string;
  addresses: AddressView[];
  contacts: ContactView[];
  identityDocuments: IdentityDocumentView[];
  relationships: RelationshipView[];
  accounts: AccountListItem[];
};

export type AddressView = {
  id: string;
  type: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
};

export type ContactView = {
  id: string;
  type: string;
  value: string;
  preferred: boolean;
};

export type IdentityDocumentView = {
  id: string;
  type: string;
  documentNumber: string;
  issuingCountry: string;
  issuedAt: string;
  expiresAt: string;
};

export type RelationshipView = {
  id: string;
  relatedCustomerNumber: string;
  relatedDisplayName: string;
  relationshipType: string;
  ownershipPercent: string | null;
};

export type ProductView = {
  code: string;
  name: string;
  kind: AccountKind;
  currency: string;
  interestRate: string;
  minimumOpeningBalance: string;
  active: boolean;
};

export type AccountListItem = {
  accountNumber: string;
  customerNumber: string;
  customerName: string;
  productCode: string;
  productName: string;
  kind: AccountKind;
  currency: string;
  balance: string;
  availableBalance: string;
  status: AccountStatus;
  readOnly: boolean;
  openedAt: string;
};

export type TransactionView = {
  reference: string;
  bookedAt: string;
  valueDate: string;
  description: string;
  type: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  currency: string;
  balanceAfter: string;
  counterparty: string | null;
  status: "BOOKED" | "PENDING" | "REJECTED";
};

export type AccountDetail = AccountListItem & {
  branchCode: string;
  nickname: string | null;
  overdraftLimit: string;
  maturityDate: string | null;
  transactions: TransactionView[];
  loan: LoanView | null;
};

export type LoanView = {
  originalPrincipal: string;
  outstandingPrincipal: string;
  interestRate: string;
  installmentAmount: string;
  nextPaymentDate: string;
  repayments: Array<{
    dueDate: string;
    paidAt: string | null;
    principal: string;
    interest: string;
    status: string;
  }>;
};

export type BeneficiaryView = {
  id: string;
  customerNumber: string;
  name: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
  swiftBic: string | null;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
};

export type AuditListItem = {
  id: string;
  occurredAt: string;
  actorUsername: string;
  action: string;
  entityType: string;
  entityReference: string;
  correlationId: string;
};

export type ListOptions = {
  query?: string;
  limit?: number;
  offset?: number;
};

export const BASELINE_CUSTOMER_NUMBERS = [
  "C000001",
  "C000002",
  "C000003",
  "C000004",
  "C000005",
] as const;

export const BASELINE_ACCOUNT_NUMBERS = [
  "1000000001", "1000000002", "1000000003", "1000000004",
  "1000000005", "1000000006", "1000000007", "1000000008",
  "1000000009", "1000000010", "1000000011", "1000000012",
  "1000000013", "1000000014",
] as const;
