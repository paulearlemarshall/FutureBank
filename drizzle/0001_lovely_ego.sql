CREATE TYPE "public"."hold_status" AS ENUM('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."kyc_case_status" AS ENUM('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."kyc_case_type" AS ENUM('ONBOARDING', 'PERIODIC_REVIEW', 'TRIGGER_EVENT', 'REMEDIATION');--> statement-breakpoint
CREATE TYPE "public"."overdraft_alert_status" AS ENUM('OPEN', 'ASSIGNED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."overdraft_alert_type" AS ENUM('REPEAT_USE', 'HIGH_UTILIZATION', 'REVIEW_DUE', 'FINANCIAL_DIFFICULTY');--> statement-breakpoint
CREATE TYPE "public"."overdraft_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'DECLINED', 'PENDING_CHANGE', 'SUSPENDED', 'EXPIRED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."restriction_type" AS ENUM('DEBIT_BLOCK', 'PAYMENT_REVIEW', 'ONBOARDING_HOLD');--> statement-breakpoint
CREATE TYPE "public"."screening_outcome" AS ENUM('CLEAR', 'POSSIBLE_MATCH', 'FALSE_POSITIVE', 'CONFIRMED_MATCH');--> statement-breakpoint
CREATE TYPE "public"."screening_type" AS ENUM('SANCTIONS', 'PEP', 'ADVERSE_MEDIA');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."work_item_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('OPEN', 'ASSIGNED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."work_item_type" AS ENUM('KYC_APPROVAL', 'PAYMENT_APPROVAL', 'OVERDRAFT_APPROVAL', 'OVERDRAFT_CHANGE', 'OVERDRAFT_ALERT');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'SUPERVISOR' BEFORE 'ADMIN';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'COMPLIANCE' BEFORE 'ADMIN';--> statement-breakpoint
CREATE TABLE "account_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"account_id" uuid NOT NULL,
	"payment_order_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" "hold_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_holds_reference_unique" UNIQUE("reference"),
	CONSTRAINT "account_holds_payment_order_id_unique" UNIQUE("payment_order_id")
);
--> statement-breakpoint
CREATE TABLE "customer_due_diligence_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kyc_case_id" uuid NOT NULL,
	"account_purpose" text NOT NULL,
	"occupation_or_business" text NOT NULL,
	"expected_monthly_credits" numeric(18, 2) NOT NULL,
	"expected_monthly_debits" numeric(18, 2) NOT NULL,
	"expected_countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cash_usage" text NOT NULL,
	"source_of_funds" text NOT NULL,
	"source_of_wealth" text NOT NULL,
	"income_or_turnover_band" text NOT NULL,
	"net_worth_band" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_due_diligence_profiles_kyc_case_id_unique" UNIQUE("kyc_case_id")
);
--> statement-breakpoint
CREATE TABLE "customer_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "restriction_type" NOT NULL,
	"reason" text NOT NULL,
	"source_kyc_case_id" uuid,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"applied_by" text NOT NULL,
	"lifted_by" text,
	"lifted_at" timestamp with time zone,
	"lift_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_restrictions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "kyc_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "kyc_case_type" NOT NULL,
	"jurisdiction" text NOT NULL,
	"status" "kyc_case_status" DEFAULT 'OPEN' NOT NULL,
	"calculated_risk_score" integer DEFAULT 0 NOT NULL,
	"calculated_risk_rating" "risk_rating" DEFAULT 'LOW' NOT NULL,
	"final_risk_rating" "risk_rating",
	"override_reason" text,
	"enhanced_due_diligence" boolean DEFAULT false NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"decided_by" text,
	"decision_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_cases_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "kyc_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"kyc_case_id" uuid NOT NULL,
	"evidence_type" text NOT NULL,
	"document_reference" text NOT NULL,
	"source" text NOT NULL,
	"received_at" date NOT NULL,
	"verification_status" "verification_status" DEFAULT 'PENDING' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"expires_at" date,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_evidence_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "kyc_risk_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kyc_case_id" uuid NOT NULL,
	"category" text NOT NULL,
	"rule" text NOT NULL,
	"score" integer NOT NULL,
	"explanation" text NOT NULL,
	"manually_overridden" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overdraft_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"type" "overdraft_alert_type" NOT NULL,
	"status" "overdraft_alert_status" DEFAULT 'OPEN' NOT NULL,
	"severity" "work_item_priority" DEFAULT 'NORMAL' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"details" text NOT NULL,
	"assigned_to" text,
	"intervention" text,
	"resolution_comment" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overdraft_alerts_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "overdraft_facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"account_id" uuid NOT NULL,
	"requested_limit" numeric(18, 2) NOT NULL,
	"approved_limit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"annual_interest_rate" numeric(7, 4) NOT NULL,
	"purpose" text NOT NULL,
	"affordability_information" jsonb NOT NULL,
	"risk_grade" text NOT NULL,
	"status" "overdraft_status" DEFAULT 'DRAFT' NOT NULL,
	"start_date" date,
	"review_date" date,
	"expiry_date" date,
	"created_by" text NOT NULL,
	"approved_by" text,
	"decision_comment" text,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overdraft_facilities_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "overdraft_limit_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"previous_limit" numeric(18, 2) NOT NULL,
	"new_limit" numeric(18, 2) NOT NULL,
	"reason" text NOT NULL,
	"effective_date" date NOT NULL,
	"approved_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overdraft_usage_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"ledger_balance" numeric(18, 2) NOT NULL,
	"utilization" numeric(18, 2) NOT NULL,
	"approved_limit" numeric(18, 2) NOT NULL,
	"regular_credits_30_days" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"kyc_case_id" uuid,
	"customer_id" uuid,
	"beneficiary_id" uuid,
	"subject_type" text NOT NULL,
	"subject_reference" text NOT NULL,
	"subject_name" text NOT NULL,
	"screening_type" "screening_type" NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	"candidate_details" jsonb,
	"outcome" "screening_outcome" NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_checks_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "screening_watchlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"screening_type" "screening_type" NOT NULL,
	"subject_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"country" text,
	"date_of_birth" date,
	"fictional" boolean DEFAULT true NOT NULL,
	"details" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_watchlist_entries_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "work_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "work_item_status",
	"to_status" "work_item_status",
	"actor_user_id" text NOT NULL,
	"actor_username" text NOT NULL,
	"comment" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"type" "work_item_type" NOT NULL,
	"status" "work_item_status" DEFAULT 'OPEN' NOT NULL,
	"priority" "work_item_priority" DEFAULT 'NORMAL' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_reference" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"required_role" "staff_role" NOT NULL,
	"created_by" text NOT NULL,
	"assigned_to" text,
	"decided_by" text,
	"decision_comment" text,
	"due_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc_status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "customers" SET "kyc_status" = CASE
	WHEN "kyc_status" = 'COMPLETE' THEN 'APPROVED'
	WHEN "kyc_status" = 'REVIEW' THEN 'IN_PROGRESS'
	ELSE "kyc_status"
END;--> statement-breakpoint
DROP TYPE "public"."kyc_status";--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'PENDING_APPROVAL', 'APPROVED', 'DUE', 'REJECTED', 'EXPIRED');--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc_status" SET DATA TYPE "public"."kyc_status" USING "kyc_status"::"public"."kyc_status";--> statement-breakpoint
ALTER TABLE "customer_relationships" ADD COLUMN "control_type" text;--> statement-breakpoint
ALTER TABLE "customer_relationships" ADD COLUMN "beneficial_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_relationships" ADD COLUMN "verification_status" "verification_status" DEFAULT 'NOT_VERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD COLUMN "verification_status" "verification_status" DEFAULT 'NOT_VERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD COLUMN "verification_method" text;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD COLUMN "expiry_alert_at" date;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "approval_reason" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "decision_comment" text;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_holds" ADD CONSTRAINT "account_holds_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_holds" ADD CONSTRAINT "account_holds_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_due_diligence_profiles" ADD CONSTRAINT "customer_due_diligence_profiles_kyc_case_id_kyc_cases_id_fk" FOREIGN KEY ("kyc_case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restrictions" ADD CONSTRAINT "customer_restrictions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restrictions" ADD CONSTRAINT "customer_restrictions_source_kyc_case_id_kyc_cases_id_fk" FOREIGN KEY ("source_kyc_case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restrictions" ADD CONSTRAINT "customer_restrictions_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_restrictions" ADD CONSTRAINT "customer_restrictions_lifted_by_user_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_evidence" ADD CONSTRAINT "kyc_evidence_kyc_case_id_kyc_cases_id_fk" FOREIGN KEY ("kyc_case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_evidence" ADD CONSTRAINT "kyc_evidence_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_risk_factors" ADD CONSTRAINT "kyc_risk_factors_kyc_case_id_kyc_cases_id_fk" FOREIGN KEY ("kyc_case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_alerts" ADD CONSTRAINT "overdraft_alerts_facility_id_overdraft_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."overdraft_facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_alerts" ADD CONSTRAINT "overdraft_alerts_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_alerts" ADD CONSTRAINT "overdraft_alerts_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_facilities" ADD CONSTRAINT "overdraft_facilities_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_facilities" ADD CONSTRAINT "overdraft_facilities_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_facilities" ADD CONSTRAINT "overdraft_facilities_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_limit_history" ADD CONSTRAINT "overdraft_limit_history_facility_id_overdraft_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."overdraft_facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_limit_history" ADD CONSTRAINT "overdraft_limit_history_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overdraft_usage_snapshots" ADD CONSTRAINT "overdraft_usage_snapshots_facility_id_overdraft_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."overdraft_facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_kyc_case_id_kyc_cases_id_fk" FOREIGN KEY ("kyc_case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_checks" ADD CONSTRAINT "screening_checks_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_holds_account_idx" ON "account_holds" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "account_holds_expiry_idx" ON "account_holds" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "restrictions_customer_idx" ON "customer_restrictions" USING btree ("customer_id","active");--> statement-breakpoint
CREATE INDEX "kyc_cases_customer_idx" ON "kyc_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "kyc_cases_status_idx" ON "kyc_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_evidence_case_idx" ON "kyc_evidence" USING btree ("kyc_case_id");--> statement-breakpoint
CREATE INDEX "kyc_risk_case_idx" ON "kyc_risk_factors" USING btree ("kyc_case_id");--> statement-breakpoint
CREATE INDEX "overdraft_alerts_facility_idx" ON "overdraft_alerts" USING btree ("facility_id","status");--> statement-breakpoint
CREATE INDEX "overdraft_account_idx" ON "overdraft_facilities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "overdraft_status_idx" ON "overdraft_facilities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "overdraft_limit_history_idx" ON "overdraft_limit_history" USING btree ("facility_id","effective_date");--> statement-breakpoint
CREATE INDEX "overdraft_usage_facility_idx" ON "overdraft_usage_snapshots" USING btree ("facility_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "screening_case_idx" ON "screening_checks" USING btree ("kyc_case_id");--> statement-breakpoint
CREATE INDEX "screening_subject_idx" ON "screening_checks" USING btree ("subject_type","subject_reference");--> statement-breakpoint
CREATE INDEX "work_item_events_item_idx" ON "work_item_events" USING btree ("work_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "work_items_queue_idx" ON "work_items" USING btree ("status","required_role","due_at");--> statement-breakpoint
CREATE INDEX "work_items_entity_idx" ON "work_items" USING btree ("entity_type","entity_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_active_approval_unique" ON "work_items" ("type", "entity_type", "entity_reference") WHERE "status" IN ('OPEN', 'ASSIGNED');--> statement-breakpoint
CREATE UNIQUE INDEX "overdraft_facilities_current_account_unique" ON "overdraft_facilities" ("account_id") WHERE "status" NOT IN ('DECLINED', 'EXPIRED', 'CLOSED');--> statement-breakpoint
CREATE UNIQUE INDEX "overdraft_usage_snapshot_unique" ON "overdraft_usage_snapshots" ("facility_id", "snapshot_date");--> statement-breakpoint
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "overdraft_facilities" (
	"id", "reference", "account_id", "requested_limit", "approved_limit", "currency", "annual_interest_rate",
	"purpose", "affordability_information", "risk_grade", "status", "start_date", "review_date", "expiry_date",
	"created_by", "approved_by", "decision_comment", "submitted_at", "decided_at"
)
SELECT
	md5('futurebank:migrated-overdraft:' || a.account_number)::uuid,
	'ODF-MIG-' || a.account_number,
	a.id, a.overdraft_limit, a.overdraft_limit, a.currency, 0,
	'Migrated arranged overdraft', '{"source":"v1 backfill","fictional":true}'::jsonb, 'UNASSESSED', 'ACTIVE',
	current_date, current_date + 365, current_date + 730,
	u.id, u.id, 'Backfilled from the v1 account-level limit', now(), now()
FROM bank_accounts a
JOIN products p ON p.id = a.product_id AND p.kind = 'CURRENT'
CROSS JOIN LATERAL (SELECT id FROM "user" WHERE username = 'bp.admin' LIMIT 1) u
WHERE a.overdraft_limit > 0;--> statement-breakpoint
INSERT INTO "overdraft_limit_history" ("facility_id", "previous_limit", "new_limit", "reason", "effective_date", "approved_by")
SELECT f.id, 0, f.approved_limit, 'Backfilled from the v1 account-level limit', current_date, f.approved_by
FROM overdraft_facilities f WHERE f.reference LIKE 'ODF-MIG-%';--> statement-breakpoint
UPDATE bank_accounts a
SET available_balance = a.balance + f.approved_limit, updated_at = now()
FROM overdraft_facilities f
WHERE f.account_id = a.id AND f.status = 'ACTIVE' AND f.reference LIKE 'ODF-MIG-%';--> statement-breakpoint
ALTER TABLE "bank_accounts" DROP COLUMN "overdraft_limit";
