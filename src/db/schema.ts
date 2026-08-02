import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const staffRoleEnum = pgEnum("staff_role", ["OPERATOR", "SUPERVISOR", "COMPLIANCE", "ADMIN"]);
export const partyTypeEnum = pgEnum("party_type", ["RETAIL", "SME"]);
export const customerStatusEnum = pgEnum("customer_status", ["ACTIVE", "INACTIVE", "RESTRICTED"]);
export const kycStatusEnum = pgEnum("kyc_status", ["NOT_STARTED", "IN_PROGRESS", "AWAITING_INFORMATION", "PENDING_APPROVAL", "APPROVED", "DUE", "REJECTED", "EXPIRED"]);
export const riskRatingEnum = pgEnum("risk_rating", ["LOW", "MEDIUM", "HIGH"]);
export const accountKindEnum = pgEnum("account_kind", ["CURRENT", "SAVINGS", "TERM_DEPOSIT", "FOREIGN_CURRENCY", "LOAN"]);
export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "BLOCKED", "CLOSED"]);
export const beneficiaryStatusEnum = pgEnum("beneficiary_status", ["ACTIVE", "INACTIVE"]);
export const paymentTypeEnum = pgEnum("payment_type", ["INTERNAL", "EXTERNAL"]);
export const paymentStatusEnum = pgEnum("payment_status", ["BOOKED", "PENDING", "REJECTED", "EXPIRED"]);
export const paymentReversalStatusEnum = pgEnum("payment_reversal_status", ["PENDING_APPROVAL", "BOOKED", "REJECTED"]);
export const paymentInstructionTypeEnum = pgEnum("payment_instruction_type", ["SCHEDULED", "STANDING_ORDER"]);
export const paymentInstructionStatusEnum = pgEnum("payment_instruction_status", ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED", "FAILED"]);
export const paymentInstructionFrequencyEnum = pgEnum("payment_instruction_frequency", ["ONCE", "WEEKLY", "MONTHLY"]);
export const paymentInstructionExecutionStatusEnum = pgEnum("payment_instruction_execution_status", ["PROCESSING", "BOOKED", "PENDING", "FAILED"]);
export const processingRunStatusEnum = pgEnum("processing_run_status", ["RUNNING", "COMPLETED", "FAILED"]);
export const chargeTypeEnum = pgEnum("charge_type", ["DAILY_OVERDRAFT_USAGE"]);
export const endOfDayPostingTypeEnum = pgEnum("end_of_day_posting_type", ["CHARGE", "INTEREST"]);
export const endOfDayPostingStatusEnum = pgEnum("end_of_day_posting_status", ["PROCESSING", "BOOKED", "FAILED"]);
export const directDebitMandateStatusEnum = pgEnum("direct_debit_mandate_status", ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]);
export const directDebitCollectionStatusEnum = pgEnum("direct_debit_collection_status", ["PROCESSING", "BOOKED", "PENDING", "REJECTED"]);
export const entryDirectionEnum = pgEnum("entry_direction", ["DEBIT", "CREDIT"]);
export const workItemTypeEnum = pgEnum("work_item_type", ["KYC_APPROVAL", "PAYMENT_APPROVAL", "PAYMENT_REVERSAL", "OVERDRAFT_APPROVAL", "OVERDRAFT_CHANGE", "OVERDRAFT_ALERT"]);
export const workItemStatusEnum = pgEnum("work_item_status", ["OPEN", "ASSIGNED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"]);
export const workItemPriorityEnum = pgEnum("work_item_priority", ["LOW", "NORMAL", "HIGH", "CRITICAL"]);
export const kycCaseTypeEnum = pgEnum("kyc_case_type", ["ONBOARDING", "PERIODIC_REVIEW", "TRIGGER_EVENT", "REMEDIATION"]);
export const kycCaseStatusEnum = pgEnum("kyc_case_status", ["OPEN", "IN_PROGRESS", "AWAITING_INFORMATION", "PENDING_APPROVAL", "APPROVED", "REJECTED"]);
export const verificationStatusEnum = pgEnum("verification_status", ["NOT_VERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"]);
export const screeningTypeEnum = pgEnum("screening_type", ["SANCTIONS", "PEP", "ADVERSE_MEDIA"]);
export const screeningOutcomeEnum = pgEnum("screening_outcome", ["CLEAR", "POSSIBLE_MATCH", "FALSE_POSITIVE", "CONFIRMED_MATCH"]);
export const restrictionTypeEnum = pgEnum("restriction_type", ["DEBIT_BLOCK", "PAYMENT_REVIEW", "ONBOARDING_HOLD"]);
export const overdraftStatusEnum = pgEnum("overdraft_status", ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "DECLINED", "PENDING_CHANGE", "SUSPENDED", "EXPIRED", "CLOSED"]);
export const overdraftAlertTypeEnum = pgEnum("overdraft_alert_type", ["REPEAT_USE", "HIGH_UTILIZATION", "REVIEW_DUE", "FINANCIAL_DIFFICULTY"]);
export const overdraftAlertStatusEnum = pgEnum("overdraft_alert_status", ["OPEN", "ASSIGNED", "RESOLVED"]);
export const holdStatusEnum = pgEnum("hold_status", ["ACTIVE", "RELEASED", "CONSUMED", "EXPIRED"]);
export const documentSlotEnum = pgEnum("document_slot", ["PASSPORT", "NATIONAL_ID"]);

// Better Auth core tables. Their exports and column names intentionally match
// Better Auth's Drizzle adapter conventions.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  ...timestamps,
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [index("session_user_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
}, (table) => [index("account_user_idx").on(table.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const staffProfiles = pgTable("staff_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  role: staffRoleEnum("role").notNull().default("OPERATOR"),
  employeeNumber: text("employee_number").notNull().unique(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  ...timestamps,
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: accountKindEnum("kind").notNull(),
  currency: text("currency").notNull(),
  interestRate: numeric("interest_rate", { precision: 7, scale: 4 }).notNull().default("0"),
  minimumOpeningBalance: numeric("minimum_opening_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const productChargeRules = pgTable("product_charge_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  type: chargeTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  active: boolean("active").notNull().default(true),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  ...timestamps,
}, (table) => [uniqueIndex("product_charge_rule_product_type_idx").on(table.productId, table.type)]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerNumber: text("customer_number").notNull().unique(),
  rimNumber: text("rim_number").notNull().unique(),
  partyType: partyTypeEnum("party_type").notNull(),
  title: text("title"),
  givenName: text("given_name"),
  familyName: text("family_name"),
  legalName: text("legal_name"),
  shortName: text("short_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  registrationNumber: text("registration_number"),
  gender: text("gender"),
  maritalStatus: text("marital_status"),
  nationality: text("nationality").notNull(),
  residenceCountry: text("residence_country").notNull(),
  language: text("language").notNull().default("English"),
  sector: text("sector").notNull(),
  industry: text("industry").notNull(),
  status: customerStatusEnum("status").notNull().default("ACTIVE"),
  kycStatus: kycStatusEnum("kyc_status").notNull(),
  riskRating: riskRatingEnum("risk_rating").notNull(),
  kycReviewDate: date("kyc_review_date").notNull(),
  taxId: text("tax_id").notNull(),
  branchCode: text("branch_code").notNull(),
  relationshipManager: text("relationship_manager").notNull(),
  ...timestamps,
}, (table) => [index("customers_name_idx").on(table.shortName), index("customers_status_idx").on(table.status)]);

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  region: text("region"),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull(),
  ...timestamps,
}, (table) => [index("addresses_customer_idx").on(table.customerId)]);

export const contactPoints = pgTable("contact_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  value: text("value").notNull(),
  preferred: boolean("preferred").notNull().default(false),
  ...timestamps,
}, (table) => [index("contacts_customer_idx").on(table.customerId)]);

export const identityDocuments = pgTable("identity_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  documentNumber: text("document_number").notNull(),
  issuingCountry: text("issuing_country").notNull(),
  issuedAt: date("issued_at").notNull(),
  expiresAt: date("expires_at").notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("NOT_VERIFIED"),
  verificationMethod: text("verification_method"),
  verifiedBy: text("verified_by").references(() => user.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiryAlertAt: date("expiry_alert_at"),
  ...timestamps,
}, (table) => [index("identity_customer_idx").on(table.customerId)]);

export const customerDocumentFiles = pgTable("customer_document_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  slot: documentSlotEnum("slot").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blobUrl: text("blob_url").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  blobEtag: text("blob_etag"),
  sha256: text("sha256"),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  isSeeded: boolean("is_seeded").notNull().default(false),
  ...timestamps,
}, (table) => [
  uniqueIndex("customer_document_files_slot_idx").on(table.customerId, table.slot),
  index("customer_document_files_customer_idx").on(table.customerId),
  index("customer_document_files_pathname_idx").on(table.blobPathname),
]);

export const customerRelationships = pgTable("customer_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  relatedCustomerId: uuid("related_customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull(),
  ownershipPercent: numeric("ownership_percent", { precision: 5, scale: 2 }),
  controlType: text("control_type"),
  beneficialOwner: boolean("beneficial_owner").notNull().default(false),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("NOT_VERIFIED"),
  ...timestamps,
}, (table) => [index("relationships_customer_idx").on(table.customerId)]);

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountNumber: text("account_number").notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "restrict" }),
  nickname: text("nickname"),
  currency: text("currency").notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  availableBalance: numeric("available_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  status: accountStatusEnum("status").notNull().default("ACTIVE"),
  readOnly: boolean("read_only").notNull().default(false),
  openedAt: date("opened_at").notNull(),
  maturityDate: date("maturity_date"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("bank_accounts_customer_idx").on(table.customerId), index("bank_accounts_status_idx").on(table.status)]);

export const kycCases = pgTable("kyc_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: kycCaseTypeEnum("type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  status: kycCaseStatusEnum("status").notNull().default("OPEN"),
  calculatedRiskScore: integer("calculated_risk_score").notNull().default(0),
  calculatedRiskRating: riskRatingEnum("calculated_risk_rating").notNull().default("LOW"),
  finalRiskRating: riskRatingEnum("final_risk_rating"),
  overrideReason: text("override_reason"),
  enhancedDueDiligence: boolean("enhanced_due_diligence").notNull().default(false),
  requirements: jsonb("requirements").notNull().default([]),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decisionComment: text("decision_comment"),
  ...timestamps,
}, (table) => [index("kyc_cases_customer_idx").on(table.customerId), index("kyc_cases_status_idx").on(table.status)]);

export const customerDueDiligenceProfiles = pgTable("customer_due_diligence_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  kycCaseId: uuid("kyc_case_id").notNull().unique().references(() => kycCases.id, { onDelete: "cascade" }),
  accountPurpose: text("account_purpose").notNull(),
  occupationOrBusiness: text("occupation_or_business").notNull(),
  expectedMonthlyCredits: numeric("expected_monthly_credits", { precision: 18, scale: 2 }).notNull(),
  expectedMonthlyDebits: numeric("expected_monthly_debits", { precision: 18, scale: 2 }).notNull(),
  expectedCountries: jsonb("expected_countries").notNull().default([]),
  cashUsage: text("cash_usage").notNull(),
  sourceOfFunds: text("source_of_funds").notNull(),
  sourceOfWealth: text("source_of_wealth").notNull(),
  incomeOrTurnoverBand: text("income_or_turnover_band").notNull(),
  netWorthBand: text("net_worth_band").notNull(),
  ...timestamps,
});

export const kycRiskFactors = pgTable("kyc_risk_factors", {
  id: uuid("id").primaryKey().defaultRandom(),
  kycCaseId: uuid("kyc_case_id").notNull().references(() => kycCases.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  rule: text("rule").notNull(),
  score: integer("score").notNull(),
  explanation: text("explanation").notNull(),
  manuallyOverridden: boolean("manually_overridden").notNull().default(false),
  overrideReason: text("override_reason"),
  ...timestamps,
}, (table) => [index("kyc_risk_case_idx").on(table.kycCaseId)]);

export const kycEvidence = pgTable("kyc_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  kycCaseId: uuid("kyc_case_id").notNull().references(() => kycCases.id, { onDelete: "cascade" }),
  evidenceType: text("evidence_type").notNull(),
  documentReference: text("document_reference").notNull(),
  source: text("source").notNull(),
  receivedAt: date("received_at").notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("PENDING"),
  verifiedBy: text("verified_by").references(() => user.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: date("expires_at"),
  reviewerNotes: text("reviewer_notes"),
  ...timestamps,
}, (table) => [index("kyc_evidence_case_idx").on(table.kycCaseId)]);

export const screeningWatchlistEntries = pgTable("screening_watchlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  screeningType: screeningTypeEnum("screening_type").notNull(),
  subjectName: text("subject_name").notNull(),
  aliases: jsonb("aliases").notNull().default([]),
  country: text("country"),
  dateOfBirth: date("date_of_birth"),
  fictional: boolean("fictional").notNull().default(true),
  details: text("details").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const screeningChecks = pgTable("screening_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  kycCaseId: uuid("kyc_case_id").references(() => kycCases.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  beneficiaryId: uuid("beneficiary_id").references(() => beneficiaries.id, { onDelete: "cascade" }),
  subjectType: text("subject_type").notNull(),
  subjectReference: text("subject_reference").notNull(),
  subjectName: text("subject_name").notNull(),
  screeningType: screeningTypeEnum("screening_type").notNull(),
  matchScore: integer("match_score").notNull().default(0),
  candidateDetails: jsonb("candidate_details"),
  outcome: screeningOutcomeEnum("outcome").notNull(),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionComment: text("resolution_comment"),
  ...timestamps,
}, (table) => [index("screening_case_idx").on(table.kycCaseId), index("screening_subject_idx").on(table.subjectType, table.subjectReference)]);

export const customerRestrictions = pgTable("customer_restrictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: restrictionTypeEnum("type").notNull(),
  reason: text("reason").notNull(),
  sourceKycCaseId: uuid("source_kyc_case_id").references(() => kycCases.id, { onDelete: "set null" }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  appliedBy: text("applied_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  liftedBy: text("lifted_by").references(() => user.id, { onDelete: "set null" }),
  liftedAt: timestamp("lifted_at", { withTimezone: true }),
  liftReason: text("lift_reason"),
  ...timestamps,
}, (table) => [index("restrictions_customer_idx").on(table.customerId, table.active)]);

export const accountStatusHistory = pgTable("account_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  previousStatus: accountStatusEnum("previous_status"),
  newStatus: accountStatusEnum("new_status").notNull(),
  reason: text("reason").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("status_history_account_idx").on(table.accountId)]);

export const beneficiaries = pgTable("beneficiaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  iban: text("iban"),
  swiftBic: text("swift_bic"),
  currency: text("currency").notNull(),
  status: beneficiaryStatusEnum("status").notNull().default("ACTIVE"),
  ...timestamps,
}, (table) => [index("beneficiaries_customer_idx").on(table.customerId)]);

export const directDebitMandates = pgTable("direct_debit_mandates", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  sourceAccountId: uuid("source_account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  creditorBeneficiaryId: uuid("creditor_beneficiary_id").notNull().references(() => beneficiaries.id, { onDelete: "restrict" }),
  creditorMandateReference: text("creditor_mandate_reference").notNull(),
  status: directDebitMandateStatusEnum("status").notNull().default("ACTIVE"),
  maximumSingleAmount: numeric("maximum_single_amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  cancelledBy: text("cancelled_by").references(() => user.id, { onDelete: "set null" }),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("direct_debit_creditor_reference_idx").on(table.creditorBeneficiaryId, table.creditorMandateReference),
  index("direct_debit_mandates_source_idx").on(table.sourceAccountId),
  index("direct_debit_mandates_status_idx").on(table.status),
]);

export const paymentOrders = pgTable("payment_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  type: paymentTypeEnum("type").notNull(),
  status: paymentStatusEnum("status").notNull(),
  sourceAccountId: uuid("source_account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  destinationAccountId: uuid("destination_account_id").references(() => bankAccounts.id, { onDelete: "restrict" }),
  beneficiaryId: uuid("beneficiary_id").references(() => beneficiaries.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  description: text("description").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  initiatedBy: text("initiated_by").notNull(),
  approvalReason: text("approval_reason"),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decisionComment: text("decision_comment"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  bookedAt: timestamp("booked_at", { withTimezone: true }),
}, (table) => [index("payment_source_idx").on(table.sourceAccountId)]);

export const paymentInstructions = pgTable("payment_instructions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  type: paymentInstructionTypeEnum("type").notNull(),
  status: paymentInstructionStatusEnum("status").notNull().default("ACTIVE"),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  sourceAccountId: uuid("source_account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  destinationAccountId: uuid("destination_account_id").references(() => bankAccounts.id, { onDelete: "restrict" }),
  beneficiaryId: uuid("beneficiary_id").references(() => beneficiaries.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  description: text("description").notNull(),
  frequency: paymentInstructionFrequencyEnum("frequency").notNull(),
  anchorDay: integer("anchor_day").notNull(),
  startDate: date("start_date").notNull(),
  nextExecutionDate: date("next_execution_date").notNull(),
  endDate: date("end_date"),
  lastExecutionAt: timestamp("last_execution_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  cancelledBy: text("cancelled_by").references(() => user.id, { onDelete: "set null" }),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("payment_instructions_due_idx").on(table.status, table.nextExecutionDate),
  index("payment_instructions_source_idx").on(table.sourceAccountId),
]);

export const processingRuns = pgTable("processing_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  type: text("type").notNull(),
  businessDate: date("business_date").notNull(),
  status: processingRunStatusEnum("status").notNull().default("RUNNING"),
  requestedBy: text("requested_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  attempted: integer("attempted").notNull().default(0),
  booked: integer("booked").notNull().default(0),
  pending: integer("pending").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
}, (table) => [index("processing_runs_type_date_idx").on(table.type, table.businessDate)]);

export const endOfDayRuns = pgTable("end_of_day_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  processingRunId: uuid("processing_run_id").notNull().unique().references(() => processingRuns.id, { onDelete: "restrict" }),
  businessDate: date("business_date").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentInstructionExecutions = pgTable("payment_instruction_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  instructionId: uuid("instruction_id").notNull().references(() => paymentInstructions.id, { onDelete: "restrict" }),
  processingRunId: uuid("processing_run_id").references(() => processingRuns.id, { onDelete: "set null" }),
  scheduledFor: date("scheduled_for").notNull(),
  status: paymentInstructionExecutionStatusEnum("status").notNull().default("PROCESSING"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id, { onDelete: "set null" }),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("payment_instruction_execution_occurrence_idx").on(table.instructionId, table.scheduledFor),
  index("payment_instruction_execution_run_idx").on(table.processingRunId),
]);

export const directDebitCollections = pgTable("direct_debit_collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  mandateId: uuid("mandate_id").notNull().references(() => directDebitMandates.id, { onDelete: "restrict" }),
  paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id, { onDelete: "set null" }),
  status: directDebitCollectionStatusEnum("status").notNull().default("PROCESSING"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  collectionDate: date("collection_date").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  submittedBy: text("submitted_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("direct_debit_collections_mandate_idx").on(table.mandateId, table.collectionDate),
]);

export const ledgerTransactions = pgTable("ledger_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  bookedAt: timestamp("booked_at", { withTimezone: true }).notNull(),
  valueDate: date("value_date").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  status: paymentStatusEnum("status").notNull().default("BOOKED"),
  currency: text("currency").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  counterparty: text("counterparty"),
  paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
  accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  direction: entryDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("ledger_entries_account_idx").on(table.accountId), index("ledger_entries_transaction_idx").on(table.transactionId)]);

export const clearingAccounts = pgTable("clearing_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  ...timestamps,
});

export const clearingEntries = pgTable("clearing_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
  clearingAccountId: uuid("clearing_account_id").notNull().references(() => clearingAccounts.id, { onDelete: "restrict" }),
  direction: entryDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("clearing_entries_transaction_idx").on(table.transactionId)]);

export const endOfDayPostings = pgTable("end_of_day_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  endOfDayRunId: uuid("end_of_day_run_id").notNull().references(() => endOfDayRuns.id, { onDelete: "restrict" }),
  accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  businessDate: date("business_date").notNull(),
  type: endOfDayPostingTypeEnum("type").notNull(),
  status: endOfDayPostingStatusEnum("status").notNull().default("PROCESSING"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  annualRate: numeric("annual_rate", { precision: 7, scale: 4 }),
  chargeRuleId: uuid("charge_rule_id").references(() => productChargeRules.id, { onDelete: "restrict" }),
  ledgerTransactionId: uuid("ledger_transaction_id").unique().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("end_of_day_posting_occurrence_idx").on(table.accountId, table.businessDate, table.type),
  index("end_of_day_postings_run_idx").on(table.endOfDayRunId),
]);

export const paymentReversals = pgTable("payment_reversals", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  originalPaymentOrderId: uuid("original_payment_order_id").notNull().unique().references(() => paymentOrders.id, { onDelete: "restrict" }),
  reversalTransactionId: uuid("reversal_transaction_id").unique().references(() => ledgerTransactions.id, { onDelete: "restrict" }),
  status: paymentReversalStatusEnum("status").notNull().default("PENDING_APPROVAL"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  reason: text("reason").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  requestedBy: text("requested_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decisionComment: text("decision_comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [index("payment_reversals_status_idx").on(table.status)]);

export const loanDetails = pgTable("loan_details", {
  accountId: uuid("account_id").primaryKey().references(() => bankAccounts.id, { onDelete: "cascade" }),
  originalPrincipal: numeric("original_principal", { precision: 18, scale: 2 }).notNull(),
  outstandingPrincipal: numeric("outstanding_principal", { precision: 18, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 7, scale: 4 }).notNull(),
  installmentAmount: numeric("installment_amount", { precision: 18, scale: 2 }).notNull(),
  nextPaymentDate: date("next_payment_date").notNull(),
  ...timestamps,
});

export const loanRepayments = pgTable("loan_repayments", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  dueDate: date("due_date").notNull(),
  paidAt: date("paid_at"),
  principal: numeric("principal", { precision: 18, scale: 2 }).notNull(),
  interest: numeric("interest", { precision: 18, scale: 2 }).notNull(),
  status: text("status").notNull(),
}, (table) => [index("loan_repayments_account_idx").on(table.accountId)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  actorUsername: text("actor_username").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityReference: text("entity_reference").notNull(),
  correlationId: text("correlation_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
}, (table) => [index("audit_occurred_idx").on(table.occurredAt), index("audit_entity_idx").on(table.entityType, table.entityReference)]);

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  ipAddress: text("ip_address").notNull(),
  succeeded: boolean("succeeded").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("login_attempt_lookup_idx").on(table.username, table.ipAddress, table.attemptedAt)]);

export const workItems = pgTable("work_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  type: workItemTypeEnum("type").notNull(),
  status: workItemStatusEnum("status").notNull().default("OPEN"),
  priority: workItemPriorityEnum("priority").notNull().default("NORMAL"),
  entityType: text("entity_type").notNull(),
  entityReference: text("entity_reference").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requiredRole: staffRoleEnum("required_role").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decisionComment: text("decision_comment"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [index("work_items_queue_idx").on(table.status, table.requiredRole, table.dueAt), index("work_items_entity_idx").on(table.entityType, table.entityReference)]);

export const workItemEvents = pgTable("work_item_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  fromStatus: workItemStatusEnum("from_status"),
  toStatus: workItemStatusEnum("to_status"),
  actorUserId: text("actor_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  actorUsername: text("actor_username").notNull(),
  comment: text("comment"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("work_item_events_item_idx").on(table.workItemId, table.occurredAt)]);

export const overdraftFacilities = pgTable("overdraft_facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  requestedLimit: numeric("requested_limit", { precision: 18, scale: 2 }).notNull(),
  approvedLimit: numeric("approved_limit", { precision: 18, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull(),
  annualInterestRate: numeric("annual_interest_rate", { precision: 7, scale: 4 }).notNull(),
  purpose: text("purpose").notNull(),
  affordabilityInformation: jsonb("affordability_information").notNull(),
  riskGrade: text("risk_grade").notNull(),
  status: overdraftStatusEnum("status").notNull().default("DRAFT"),
  startDate: date("start_date"),
  reviewDate: date("review_date"),
  expiryDate: date("expiry_date"),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  decisionComment: text("decision_comment"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [index("overdraft_account_idx").on(table.accountId), index("overdraft_status_idx").on(table.status)]);

export const overdraftLimitHistory = pgTable("overdraft_limit_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => overdraftFacilities.id, { onDelete: "cascade" }),
  previousLimit: numeric("previous_limit", { precision: 18, scale: 2 }).notNull(),
  newLimit: numeric("new_limit", { precision: 18, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  effectiveDate: date("effective_date").notNull(),
  approvedBy: text("approved_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("overdraft_limit_history_idx").on(table.facilityId, table.effectiveDate)]);

export const overdraftUsageSnapshots = pgTable("overdraft_usage_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id").notNull().references(() => overdraftFacilities.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  ledgerBalance: numeric("ledger_balance", { precision: 18, scale: 2 }).notNull(),
  utilization: numeric("utilization", { precision: 18, scale: 2 }).notNull(),
  approvedLimit: numeric("approved_limit", { precision: 18, scale: 2 }).notNull(),
  regularCredits30Days: numeric("regular_credits_30_days", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("overdraft_usage_facility_idx").on(table.facilityId, table.snapshotDate)]);

export const overdraftAlerts = pgTable("overdraft_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  facilityId: uuid("facility_id").notNull().references(() => overdraftFacilities.id, { onDelete: "cascade" }),
  type: overdraftAlertTypeEnum("type").notNull(),
  status: overdraftAlertStatusEnum("status").notNull().default("OPEN"),
  severity: workItemPriorityEnum("severity").notNull().default("NORMAL"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  details: text("details").notNull(),
  assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
  intervention: text("intervention"),
  resolutionComment: text("resolution_comment"),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("overdraft_alerts_facility_idx").on(table.facilityId, table.status)]);

export const accountHolds = pgTable("account_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "restrict" }),
  paymentOrderId: uuid("payment_order_id").notNull().unique().references(() => paymentOrders.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  status: holdStatusEnum("status").notNull().default("ACTIVE"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releaseReason: text("release_reason"),
  ...timestamps,
}, (table) => [index("account_holds_account_idx").on(table.accountId, table.status), index("account_holds_expiry_idx").on(table.status, table.expiresAt)]);
