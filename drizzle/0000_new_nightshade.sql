CREATE TYPE "public"."account_kind" AS ENUM('CURRENT', 'SAVINGS', 'TERM_DEPOSIT', 'FOREIGN_CURRENCY', 'LOAN');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'BLOCKED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."beneficiary_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('ACTIVE', 'INACTIVE', 'RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('COMPLETE', 'DUE', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('RETAIL', 'SME');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('BOOKED', 'PENDING', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('INTERNAL', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."risk_rating" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OPERATOR', 'ADMIN');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"previous_status" "account_status",
	"new_status" "account_status" NOT NULL,
	"reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"region" text,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"actor_username" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_reference" text NOT NULL,
	"correlation_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"nickname" text,
	"currency" text NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"available_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"overdraft_limit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"read_only" boolean DEFAULT false NOT NULL,
	"opened_at" date NOT NULL,
	"maturity_date" date,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"iban" text,
	"swift_bic" text,
	"currency" text NOT NULL,
	"status" "beneficiary_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "clearing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clearing_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "clearing_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"clearing_account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"related_customer_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"ownership_percent" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_number" text NOT NULL,
	"party_type" "party_type" NOT NULL,
	"title" text,
	"given_name" text,
	"family_name" text,
	"legal_name" text,
	"short_name" text NOT NULL,
	"date_of_birth" date,
	"registration_number" text,
	"gender" text,
	"marital_status" text,
	"nationality" text NOT NULL,
	"residence_country" text NOT NULL,
	"language" text DEFAULT 'English' NOT NULL,
	"sector" text NOT NULL,
	"industry" text NOT NULL,
	"status" "customer_status" DEFAULT 'ACTIVE' NOT NULL,
	"kyc_status" "kyc_status" NOT NULL,
	"risk_rating" "risk_rating" NOT NULL,
	"kyc_review_date" date NOT NULL,
	"tax_id" text NOT NULL,
	"branch_code" text NOT NULL,
	"relationship_manager" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customer_number_unique" UNIQUE("customer_number")
);
--> statement-breakpoint
CREATE TABLE "identity_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"document_number" text NOT NULL,
	"issuing_country" text NOT NULL,
	"issued_at" date NOT NULL,
	"expires_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"booked_at" timestamp with time zone NOT NULL,
	"value_date" date NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"status" "payment_status" DEFAULT 'BOOKED' NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"counterparty" text,
	"payment_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "loan_details" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"original_principal" numeric(18, 2) NOT NULL,
	"outstanding_principal" numeric(18, 2) NOT NULL,
	"interest_rate" numeric(7, 4) NOT NULL,
	"installment_amount" numeric(18, 2) NOT NULL,
	"next_payment_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_repayments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" date,
	"principal" numeric(18, 2) NOT NULL,
	"interest" numeric(18, 2) NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"ip_address" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"type" "payment_type" NOT NULL,
	"status" "payment_status" NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid,
	"beneficiary_id" uuid,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"initiated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"booked_at" timestamp with time zone,
	CONSTRAINT "payment_orders_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payment_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	"currency" text NOT NULL,
	"interest_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"minimum_opening_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" "staff_role" DEFAULT 'OPERATOR' NOT NULL,
	"employee_number" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_employee_number_unique" UNIQUE("employee_number")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_status_history" ADD CONSTRAINT "account_status_history_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearing_entries" ADD CONSTRAINT "clearing_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearing_entries" ADD CONSTRAINT "clearing_entries_clearing_account_id_clearing_accounts_id_fk" FOREIGN KEY ("clearing_account_id") REFERENCES "public"."clearing_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_relationships" ADD CONSTRAINT "customer_relationships_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_relationships" ADD CONSTRAINT "customer_relationships_related_customer_id_customers_id_fk" FOREIGN KEY ("related_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_details" ADD CONSTRAINT "loan_details_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_source_account_id_bank_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_destination_account_id_bank_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_history_account_idx" ON "account_status_history" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "audit_occurred_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_reference");--> statement-breakpoint
CREATE INDEX "bank_accounts_customer_idx" ON "bank_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "beneficiaries_customer_idx" ON "beneficiaries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "clearing_entries_transaction_idx" ON "clearing_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "contacts_customer_idx" ON "contact_points" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "relationships_customer_idx" ON "customer_relationships" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("short_name");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "identity_customer_idx" ON "identity_documents" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "loan_repayments_account_idx" ON "loan_repayments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "login_attempt_lookup_idx" ON "login_attempts" USING btree ("username","ip_address","attempted_at");--> statement-breakpoint
CREATE INDEX "payment_source_idx" ON "payment_orders" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");