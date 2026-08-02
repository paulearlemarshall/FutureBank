CREATE TYPE "public"."payment_reversal_status" AS ENUM('PENDING_APPROVAL', 'BOOKED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."work_item_type" ADD VALUE 'PAYMENT_REVERSAL' BEFORE 'OVERDRAFT_APPROVAL';--> statement-breakpoint
CREATE TABLE "payment_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"original_payment_order_id" uuid NOT NULL,
	"reversal_transaction_id" uuid,
	"status" "payment_reversal_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decision_comment" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reversals_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payment_reversals_original_payment_order_id_unique" UNIQUE("original_payment_order_id"),
	CONSTRAINT "payment_reversals_reversal_transaction_id_unique" UNIQUE("reversal_transaction_id"),
	CONSTRAINT "payment_reversals_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_original_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("original_payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_reversal_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("reversal_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_reversals_status_idx" ON "payment_reversals" USING btree ("status");