CREATE TYPE "public"."direct_debit_collection_status" AS ENUM('PROCESSING', 'BOOKED', 'PENDING', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."direct_debit_mandate_status" AS ENUM('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "direct_debit_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"mandate_id" uuid NOT NULL,
	"payment_order_id" uuid,
	"status" "direct_debit_collection_status" DEFAULT 'PROCESSING' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"collection_date" date NOT NULL,
	"idempotency_key" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"submitted_by" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_debit_collections_reference_unique" UNIQUE("reference"),
	CONSTRAINT "direct_debit_collections_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "direct_debit_mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"source_account_id" uuid NOT NULL,
	"creditor_beneficiary_id" uuid NOT NULL,
	"creditor_mandate_reference" text NOT NULL,
	"status" "direct_debit_mandate_status" DEFAULT 'ACTIVE' NOT NULL,
	"maximum_single_amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_by" text NOT NULL,
	"cancelled_by" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_debit_mandates_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "direct_debit_collections" ADD CONSTRAINT "direct_debit_collections_mandate_id_direct_debit_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."direct_debit_mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_collections" ADD CONSTRAINT "direct_debit_collections_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_collections" ADD CONSTRAINT "direct_debit_collections_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_source_account_id_bank_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_creditor_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("creditor_beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_debit_collections_mandate_idx" ON "direct_debit_collections" USING btree ("mandate_id","collection_date");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_debit_creditor_reference_idx" ON "direct_debit_mandates" USING btree ("creditor_beneficiary_id","creditor_mandate_reference");--> statement-breakpoint
CREATE INDEX "direct_debit_mandates_source_idx" ON "direct_debit_mandates" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "direct_debit_mandates_status_idx" ON "direct_debit_mandates" USING btree ("status");