CREATE TYPE "public"."reconciliation_item_status" AS ENUM('MATCHED', 'OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_item_type" AS ENUM('MATCHED', 'AMOUNT_MISMATCH', 'DIRECTION_MISMATCH', 'CURRENCY_MISMATCH', 'MISSING_INTERNAL', 'MISSING_EXTERNAL');--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"reconciliation_run_id" uuid NOT NULL,
	"settlement_record_id" uuid,
	"clearing_entry_id" uuid,
	"transaction_reference" text NOT NULL,
	"type" "reconciliation_item_type" NOT NULL,
	"status" "reconciliation_item_status" NOT NULL,
	"internal_direction" "entry_direction",
	"external_direction" "entry_direction",
	"internal_amount" numeric(18, 2),
	"external_amount" numeric(18, 2),
	"internal_currency" text,
	"external_currency" text,
	"resolution_comment" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_items_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_runs_reference_unique" UNIQUE("reference"),
	CONSTRAINT "reconciliation_runs_processing_run_id_unique" UNIQUE("processing_run_id"),
	CONSTRAINT "reconciliation_runs_business_date_unique" UNIQUE("business_date")
);
--> statement-breakpoint
CREATE TABLE "settlement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"source" text NOT NULL,
	"transaction_reference" text NOT NULL,
	"business_date" date NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_records_reference_unique" UNIQUE("reference"),
	CONSTRAINT "settlement_records_transaction_reference_unique" UNIQUE("transaction_reference")
);
--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_reconciliation_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_settlement_record_id_settlement_records_id_fk" FOREIGN KEY ("settlement_record_id") REFERENCES "public"."settlement_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_clearing_entry_id_clearing_entries_id_fk" FOREIGN KEY ("clearing_entry_id") REFERENCES "public"."clearing_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_processing_run_id_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."processing_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_item_settlement_idx" ON "reconciliation_items" USING btree ("reconciliation_run_id","settlement_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_item_clearing_idx" ON "reconciliation_items" USING btree ("reconciliation_run_id","clearing_entry_id");--> statement-breakpoint
CREATE INDEX "reconciliation_items_run_status_idx" ON "reconciliation_items" USING btree ("reconciliation_run_id","status");--> statement-breakpoint
CREATE INDEX "settlement_records_date_idx" ON "settlement_records" USING btree ("business_date");