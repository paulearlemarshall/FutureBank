CREATE TYPE "public"."loan_application_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."work_item_type" ADD VALUE 'LOAN_ORIGINATION';--> statement-breakpoint
CREATE TABLE "loan_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"principal" numeric(18, 2) NOT NULL,
	"approved_principal" numeric(18, 2),
	"currency" text NOT NULL,
	"term_months" integer NOT NULL,
	"annual_interest_rate" numeric(7, 4) NOT NULL,
	"first_payment_date" date NOT NULL,
	"projected_installment" numeric(18, 2) NOT NULL,
	"monthly_income" numeric(18, 2) NOT NULL,
	"monthly_commitments" numeric(18, 2) NOT NULL,
	"debt_service_ratio" numeric(7, 2) NOT NULL,
	"risk_grade" text NOT NULL,
	"purpose" text NOT NULL,
	"status" "loan_application_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"loan_account_id" uuid,
	"origination_transaction_id" uuid,
	"idempotency_key" text NOT NULL,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decision_comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loan_applications_reference_unique" UNIQUE("reference"),
	CONSTRAINT "loan_applications_loan_account_id_unique" UNIQUE("loan_account_id"),
	CONSTRAINT "loan_applications_origination_transaction_id_unique" UNIQUE("origination_transaction_id"),
	CONSTRAINT "loan_applications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "loan_details" ADD COLUMN "origination_application_id" uuid;--> statement-breakpoint
ALTER TABLE "loan_details" ADD COLUMN "term_months" integer;--> statement-breakpoint
ALTER TABLE "loan_details" ADD COLUMN "maturity_date" date;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_destination_account_id_bank_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_loan_account_id_bank_accounts_id_fk" FOREIGN KEY ("loan_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_origination_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("origination_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_applications_customer_idx" ON "loan_applications" USING btree ("customer_id","submitted_at");--> statement-breakpoint
CREATE INDEX "loan_applications_status_idx" ON "loan_applications" USING btree ("status","submitted_at");--> statement-breakpoint
ALTER TABLE "loan_details" ADD CONSTRAINT "loan_details_origination_application_id_loan_applications_id_fk" FOREIGN KEY ("origination_application_id") REFERENCES "public"."loan_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loan_repayments_sequence_idx" ON "loan_repayments" USING btree ("account_id","sequence");--> statement-breakpoint
ALTER TABLE "loan_details" ADD CONSTRAINT "loan_details_origination_application_id_unique" UNIQUE("origination_application_id");