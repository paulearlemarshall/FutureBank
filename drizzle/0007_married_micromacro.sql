CREATE TYPE "public"."charge_type" AS ENUM('DAILY_OVERDRAFT_USAGE');--> statement-breakpoint
CREATE TYPE "public"."end_of_day_posting_status" AS ENUM('PROCESSING', 'BOOKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."end_of_day_posting_type" AS ENUM('CHARGE', 'INTEREST');--> statement-breakpoint
CREATE TABLE "end_of_day_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"end_of_day_run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"type" "end_of_day_posting_type" NOT NULL,
	"status" "end_of_day_posting_status" DEFAULT 'PROCESSING' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"annual_rate" numeric(7, 4),
	"charge_rule_id" uuid,
	"ledger_transaction_id" uuid,
	"idempotency_key" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_of_day_postings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "end_of_day_postings_ledger_transaction_id_unique" UNIQUE("ledger_transaction_id"),
	CONSTRAINT "end_of_day_postings_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "end_of_day_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_of_day_runs_reference_unique" UNIQUE("reference"),
	CONSTRAINT "end_of_day_runs_processing_run_id_unique" UNIQUE("processing_run_id"),
	CONSTRAINT "end_of_day_runs_business_date_unique" UNIQUE("business_date")
);
--> statement-breakpoint
CREATE TABLE "product_charge_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"product_id" uuid NOT NULL,
	"type" charge_type NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_charge_rules_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "end_of_day_postings" ADD CONSTRAINT "end_of_day_postings_end_of_day_run_id_end_of_day_runs_id_fk" FOREIGN KEY ("end_of_day_run_id") REFERENCES "public"."end_of_day_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "end_of_day_postings" ADD CONSTRAINT "end_of_day_postings_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "end_of_day_postings" ADD CONSTRAINT "end_of_day_postings_charge_rule_id_product_charge_rules_id_fk" FOREIGN KEY ("charge_rule_id") REFERENCES "public"."product_charge_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "end_of_day_postings" ADD CONSTRAINT "end_of_day_postings_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "end_of_day_runs" ADD CONSTRAINT "end_of_day_runs_processing_run_id_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."processing_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_charge_rules" ADD CONSTRAINT "product_charge_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "end_of_day_posting_occurrence_idx" ON "end_of_day_postings" USING btree ("account_id","business_date","type");--> statement-breakpoint
CREATE INDEX "end_of_day_postings_run_idx" ON "end_of_day_postings" USING btree ("end_of_day_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_charge_rule_product_type_idx" ON "product_charge_rules" USING btree ("product_id","type");