CREATE TYPE "public"."payment_instruction_execution_status" AS ENUM('PROCESSING', 'BOOKED', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_instruction_frequency" AS ENUM('ONCE', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."payment_instruction_status" AS ENUM('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_instruction_type" AS ENUM('SCHEDULED', 'STANDING_ORDER');--> statement-breakpoint
CREATE TYPE "public"."processing_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "payment_instruction_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instruction_id" uuid NOT NULL,
	"processing_run_id" uuid,
	"scheduled_for" date NOT NULL,
	"status" "payment_instruction_execution_status" DEFAULT 'PROCESSING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"payment_order_id" uuid,
	"failure_code" text,
	"failure_message" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "payment_instruction_executions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"type" "payment_instruction_type" NOT NULL,
	"status" "payment_instruction_status" DEFAULT 'ACTIVE' NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid,
	"beneficiary_id" uuid,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"frequency" "payment_instruction_frequency" NOT NULL,
	"anchor_day" integer NOT NULL,
	"start_date" date NOT NULL,
	"next_execution_date" date NOT NULL,
	"end_date" date,
	"last_execution_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"cancelled_by" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_instructions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"type" text NOT NULL,
	"business_date" date NOT NULL,
	"status" "processing_run_status" DEFAULT 'RUNNING' NOT NULL,
	"requested_by" text NOT NULL,
	"attempted" integer DEFAULT 0 NOT NULL,
	"booked" integer DEFAULT 0 NOT NULL,
	"pending" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text,
	CONSTRAINT "processing_runs_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "payment_instruction_executions" ADD CONSTRAINT "payment_instruction_executions_instruction_id_payment_instructions_id_fk" FOREIGN KEY ("instruction_id") REFERENCES "public"."payment_instructions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instruction_executions" ADD CONSTRAINT "payment_instruction_executions_processing_run_id_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."processing_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instruction_executions" ADD CONSTRAINT "payment_instruction_executions_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_source_account_id_bank_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_destination_account_id_bank_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_instruction_execution_occurrence_idx" ON "payment_instruction_executions" USING btree ("instruction_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "payment_instruction_execution_run_idx" ON "payment_instruction_executions" USING btree ("processing_run_id");--> statement-breakpoint
CREATE INDEX "payment_instructions_due_idx" ON "payment_instructions" USING btree ("status","next_execution_date");--> statement-breakpoint
CREATE INDEX "payment_instructions_source_idx" ON "payment_instructions" USING btree ("source_account_id");--> statement-breakpoint
CREATE INDEX "processing_runs_type_date_idx" ON "processing_runs" USING btree ("type","business_date");