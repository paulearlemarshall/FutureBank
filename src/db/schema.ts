import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const staffRoleEnum = pgEnum("staff_role", ["OPERATOR", "ADMIN"]);
export const partyTypeEnum = pgEnum("party_type", ["RETAIL", "SME"]);
export const customerStatusEnum = pgEnum("customer_status", ["ACTIVE", "INACTIVE", "RESTRICTED"]);
export const kycStatusEnum = pgEnum("kyc_status", ["COMPLETE", "DUE", "REVIEW"]);
export const riskRatingEnum = pgEnum("risk_rating", ["LOW", "MEDIUM", "HIGH"]);
export const accountKindEnum = pgEnum("account_kind", ["CURRENT", "SAVINGS", "TERM_DEPOSIT", "FOREIGN_CURRENCY", "LOAN"]);
export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "BLOCKED", "CLOSED"]);
export const beneficiaryStatusEnum = pgEnum("beneficiary_status", ["ACTIVE", "INACTIVE"]);
export const paymentTypeEnum = pgEnum("payment_type", ["INTERNAL", "EXTERNAL"]);
export const paymentStatusEnum = pgEnum("payment_status", ["BOOKED", "PENDING", "REJECTED"]);
export const entryDirectionEnum = pgEnum("entry_direction", ["DEBIT", "CREDIT"]);

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

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerNumber: text("customer_number").notNull().unique(),
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
  ...timestamps,
}, (table) => [index("identity_customer_idx").on(table.customerId)]);

export const customerRelationships = pgTable("customer_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  relatedCustomerId: uuid("related_customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull(),
  ownershipPercent: numeric("ownership_percent", { precision: 5, scale: 2 }),
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
  overdraftLimit: numeric("overdraft_limit", { precision: 18, scale: 2 }).notNull().default("0"),
  status: accountStatusEnum("status").notNull().default("ACTIVE"),
  readOnly: boolean("read_only").notNull().default(false),
  openedAt: date("opened_at").notNull(),
  maturityDate: date("maturity_date"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("bank_accounts_customer_idx").on(table.customerId), index("bank_accounts_status_idx").on(table.status)]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  bookedAt: timestamp("booked_at", { withTimezone: true }),
}, (table) => [index("payment_source_idx").on(table.sourceAccountId)]);

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
