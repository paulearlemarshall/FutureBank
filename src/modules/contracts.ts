export type StaffRole = "OPERATOR" | "SUPERVISOR" | "COMPLIANCE" | "ADMIN";
export type PartyType = "RETAIL" | "SME";
export type CustomerStatus = "ACTIVE" | "INACTIVE" | "RESTRICTED";
export type KycStatus = "NOT_STARTED" | "IN_PROGRESS" | "AWAITING_INFORMATION" | "PENDING_APPROVAL" | "APPROVED" | "DUE" | "REJECTED" | "EXPIRED";
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
  openWorkItems: number;
  pendingPayments: number;
  overdraftExposure: string;
  repeatUseAlerts: number;
  recentActivity: AuditListItem[];
};

export type CustomerListItem = {
  customerNumber: string;
  rimNumber: string;
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
  documents: CustomerDocumentSlot[];
  relationships: RelationshipView[];
  accounts: AccountListItem[];
};

export type DocumentSlot = "PASSPORT" | "NATIONAL_ID";

export type DocumentMeta = {
  slot: DocumentSlot;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
};

export type EmptyDocumentSlot = {
  slot: DocumentSlot;
  empty: true;
};

export type CustomerDocumentSlot = DocumentMeta | EmptyDocumentSlot;

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
  verificationStatus: "NOT_VERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  verificationMethod: string | null;
  expiryAlertAt: string | null;
};

export type RelationshipView = {
  id: string;
  relatedCustomerNumber: string;
  relatedDisplayName: string;
  relationshipType: string;
  ownershipPercent: string | null;
  controlType: string | null;
  beneficialOwner: boolean;
  verificationStatus: "NOT_VERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
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
  status: "BOOKED" | "PENDING" | "REJECTED" | "EXPIRED";
};

export type AccountStatement = {
  accountNumber: string;
  customerNumber: string;
  customerName: string;
  productName: string;
  currency: string;
  fromDate: string;
  toDate: string;
  openingBalance: string;
  closingBalance: string;
  generatedAt: string;
  entries: TransactionView[];
};

export type AccountDetail = AccountListItem & {
  branchCode: string;
  nickname: string | null;
  overdraft: OverdraftFacilityDetail | null;
  maturityDate: string | null;
  transactions: TransactionView[];
  loan: LoanView | null;
};

export type WorkItemStatus = "OPEN" | "ASSIGNED" | "APPROVED" | "REJECTED" | "CANCELLED" | "COMPLETED";
export type WorkItemType = "KYC_APPROVAL" | "PAYMENT_APPROVAL" | "PAYMENT_REVERSAL" | "OVERDRAFT_APPROVAL" | "OVERDRAFT_CHANGE" | "OVERDRAFT_ALERT";
export type WorkItemPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type WorkQueueItem = {
  reference: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  entityType: string;
  entityReference: string;
  title: string;
  requiredRole: StaffRole;
  createdBy: string;
  assignedTo: string | null;
  dueAt: string;
  version: number;
};

export type WorkItemDetail = WorkQueueItem & {
  description: string;
  decisionComment: string | null;
  events: Array<{
    eventType: string;
    fromStatus: WorkItemStatus | null;
    toStatus: WorkItemStatus | null;
    actorUsername: string;
    comment: string | null;
    occurredAt: string;
  }>;
};

export type KycCaseSummary = {
  reference: string;
  customerNumber: string;
  customerName: string;
  type: "ONBOARDING" | "PERIODIC_REVIEW" | "TRIGGER_EVENT" | "REMEDIATION";
  jurisdiction: string;
  status: "OPEN" | "IN_PROGRESS" | "AWAITING_INFORMATION" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  riskScore: number;
  riskRating: RiskRating;
  enhancedDueDiligence: boolean;
  dueAt: string;
};

export type CddProfile = {
  accountPurpose: string;
  occupationOrBusiness: string;
  expectedMonthlyCredits: string;
  expectedMonthlyDebits: string;
  expectedCountries: string[];
  cashUsage: string;
  sourceOfFunds: string;
  sourceOfWealth: string;
  incomeOrTurnoverBand: string;
  netWorthBand: string;
};

export type ScreeningCheck = {
  reference: string;
  subjectType: string;
  subjectReference: string;
  subjectName: string;
  screeningType: "SANCTIONS" | "PEP" | "ADVERSE_MEDIA";
  matchScore: number;
  outcome: "CLEAR" | "POSSIBLE_MATCH" | "FALSE_POSITIVE" | "CONFIRMED_MATCH";
  resolutionComment: string | null;
  createdAt: string;
};

export type KycEvidence = {
  reference: string;
  evidenceType: string;
  documentReference: string;
  source: string;
  receivedAt: string;
  verificationStatus: "NOT_VERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  expiresAt: string | null;
  reviewerNotes: string | null;
};

export type CustomerRestriction = {
  reference: string;
  type: "DEBIT_BLOCK" | "PAYMENT_REVIEW" | "ONBOARDING_HOLD";
  reason: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
};

export type KycCaseDetail = KycCaseSummary & {
  finalRiskRating: RiskRating | null;
  overrideReason: string | null;
  requirements: Array<{ code: string; label: string; mandatory: boolean }>;
  profile: CddProfile | null;
  riskFactors: Array<{ category: string; rule: string; score: number; explanation: string }>;
  screenings: ScreeningCheck[];
  evidence: KycEvidence[];
  restrictions: CustomerRestriction[];
};

export type OverdraftFacilitySummary = {
  reference: string;
  accountNumber: string;
  customerNumber: string;
  customerName: string;
  requestedLimit: string;
  approvedLimit: string;
  utilization: string;
  headroom: string;
  currency: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "DECLINED" | "PENDING_CHANGE" | "SUSPENDED" | "EXPIRED" | "CLOSED";
  reviewDate: string | null;
};

export type OverdraftAlert = {
  reference: string;
  type: "REPEAT_USE" | "HIGH_UTILIZATION" | "REVIEW_DUE" | "FINANCIAL_DIFFICULTY";
  status: "OPEN" | "ASSIGNED" | "RESOLVED";
  severity: WorkItemPriority;
  detectedAt: string;
  dueAt: string;
  details: string;
  intervention: string | null;
  resolutionComment: string | null;
};

export type OverdraftFacilityDetail = OverdraftFacilitySummary & {
  annualInterestRate: string;
  estimatedDailyInterest: string;
  purpose: string;
  affordabilityInformation: Record<string, unknown>;
  riskGrade: string;
  startDate: string | null;
  expiryDate: string | null;
  activeHolds: string;
  version: number;
  alerts: OverdraftAlert[];
  limitHistory: Array<{ previousLimit: string; newLimit: string; reason: string; effectiveDate: string; approvedBy: string }>;
};

export type AccountHold = {
  reference: string;
  accountNumber: string;
  paymentReference: string;
  amount: string;
  currency: string;
  status: "ACTIVE" | "RELEASED" | "CONSUMED" | "EXPIRED";
  expiresAt: string;
};

export type PaymentApprovalDetail = {
  reference: string;
  type: "INTERNAL" | "EXTERNAL";
  status: "BOOKED" | "PENDING" | "REJECTED" | "EXPIRED";
  sourceAccountNumber: string;
  customerNumber: string;
  customerName: string;
  destinationReference: string;
  amount: string;
  currency: string;
  description: string;
  approvalReason: string | null;
  initiatedBy: string;
  createdAt: string;
  expiresAt: string | null;
  hold: AccountHold | null;
  workItem: WorkQueueItem | null;
  reversal: PaymentReversalView | null;
};

export type PaymentReversalView = {
  reference: string;
  status: "PENDING_APPROVAL" | "BOOKED" | "REJECTED";
  originalPaymentReference: string;
  paymentType: "INTERNAL" | "EXTERNAL";
  sourceAccountNumber: string;
  destinationReference: string;
  customerNumber: string;
  customerName: string;
  amount: string;
  currency: string;
  reason: string;
  requestedBy: string;
  decisionComment: string | null;
  reversalTransactionReference: string | null;
  createdAt: string;
  decidedAt: string | null;
  version: number;
  workItem: WorkQueueItem | null;
};

export type PaymentInstructionType = "SCHEDULED" | "STANDING_ORDER";
export type PaymentInstructionStatus = "ACTIVE" | "PAUSED" | "CANCELLED" | "COMPLETED" | "FAILED";
export type PaymentInstructionFrequency = "ONCE" | "WEEKLY" | "MONTHLY";
export type PaymentInstructionExecutionStatus = "PROCESSING" | "BOOKED" | "PENDING" | "FAILED";

export type PaymentInstructionExecutionView = {
  scheduledFor: string;
  status: PaymentInstructionExecutionStatus;
  paymentReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptedAt: string;
  completedAt: string | null;
};

export type PaymentInstructionView = {
  reference: string;
  type: PaymentInstructionType;
  status: PaymentInstructionStatus;
  paymentType: "INTERNAL" | "EXTERNAL";
  sourceAccountNumber: string;
  customerNumber: string;
  customerName: string;
  destinationReference: string;
  amount: string;
  currency: string;
  description: string;
  frequency: PaymentInstructionFrequency;
  startDate: string;
  nextExecutionDate: string;
  endDate: string | null;
  lastExecutionAt: string | null;
  createdBy: string;
  cancellationReason: string | null;
  version: number;
  executions: PaymentInstructionExecutionView[];
};

export type ProcessingRunView = {
  reference: string;
  type: "PAYMENT_INSTRUCTIONS";
  businessDate: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  attempted: number;
  booked: number;
  pending: number;
  failed: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

export type EndOfDayPostingView = {
  reference: string;
  accountNumber: string;
  customerNumber: string;
  customerName: string;
  businessDate: string;
  type: "CHARGE" | "INTEREST";
  status: "PROCESSING" | "BOOKED" | "FAILED";
  amount: string;
  currency: string;
  annualRate: string | null;
  chargeRuleReference: string | null;
  transactionReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  completedAt: string | null;
};

export type EndOfDayRunView = {
  reference: string;
  businessDate: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  attempted: number;
  booked: number;
  failed: number;
  chargeCount: number;
  interestCount: number;
  requestedBy: string;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  postings: EndOfDayPostingView[];
};

export type ReconciliationItemView = {
  reference: string;
  transactionReference: string;
  type: "MATCHED" | "AMOUNT_MISMATCH" | "DIRECTION_MISMATCH" | "CURRENCY_MISMATCH" | "MISSING_INTERNAL" | "MISSING_EXTERNAL";
  status: "MATCHED" | "OPEN" | "RESOLVED";
  internalDirection: "DEBIT" | "CREDIT" | null;
  externalDirection: "DEBIT" | "CREDIT" | null;
  internalAmount: string | null;
  externalAmount: string | null;
  internalCurrency: string | null;
  externalCurrency: string | null;
  resolutionComment: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  version: number;
};

export type ReconciliationRunView = {
  reference: string;
  businessDate: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  attempted: number;
  matched: number;
  exceptions: number;
  openExceptions: number;
  requestedBy: string;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  items: ReconciliationItemView[];
};

export type DirectDebitCollectionView = {
  reference: string;
  status: "PROCESSING" | "BOOKED" | "PENDING" | "REJECTED";
  amount: string;
  currency: string;
  collectionDate: string;
  paymentReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DirectDebitMandateView = {
  reference: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
  sourceAccountNumber: string;
  customerNumber: string;
  customerName: string;
  creditorBeneficiaryId: string;
  creditorName: string;
  creditorAccountNumber: string;
  creditorMandateReference: string;
  maximumSingleAmount: string;
  currency: string;
  validFrom: string;
  validTo: string | null;
  cancellationReason: string | null;
  version: number;
  collections: DirectDebitCollectionView[];
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
  "C000006",
  "C000007",
  "C000008",
  "C000009",
] as const;

export const BASELINE_ACCOUNT_NUMBERS = [
  "1000000001", "1000000002", "1000000003", "1000000004",
  "1000000005", "1000000006", "1000000007", "1000000008",
  "1000000009", "1000000010", "1000000011", "1000000012",
  "1000000013", "1000000014",
  "1000000015", "1000000016", "1000000017", "1000000018",
  "1000000019",
] as const;
