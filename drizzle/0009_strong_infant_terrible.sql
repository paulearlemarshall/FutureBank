CREATE TYPE "public"."accounting_period_status" AS ENUM('OPEN', 'CLOSING', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."work_item_type" ADD VALUE 'ACCOUNTING_PERIOD_CLOSE';--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"code" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "accounting_period_status" DEFAULT 'OPEN' NOT NULL,
	"close_requested_by" text,
	"close_request_comment" text,
	"close_requested_at" timestamp with time zone,
	"closed_by" text,
	"close_decision_comment" text,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_periods_reference_unique" UNIQUE("reference"),
	CONSTRAINT "accounting_periods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_close_requested_by_user_id_fk" FOREIGN KEY ("close_requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_period_dates_idx" ON "accounting_periods" USING btree ("start_date","end_date","status");