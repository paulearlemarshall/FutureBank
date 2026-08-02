CREATE TYPE "public"."general_ledger_account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."general_ledger_journal_source" AS ENUM('SUBLEDGER', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."general_ledger_journal_status" AS ENUM('PENDING_APPROVAL', 'POSTED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."work_item_type" ADD VALUE 'GENERAL_LEDGER_JOURNAL';--> statement-breakpoint
CREATE TABLE "general_ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "general_ledger_account_type" NOT NULL,
	"currency" text NOT NULL,
	"system_controlled" boolean DEFAULT true NOT NULL,
	"posting_allowed" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "general_ledger_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "general_ledger_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"source" "general_ledger_journal_source" NOT NULL,
	"source_ledger_transaction_id" uuid,
	"idempotency_key" text,
	"value_date" date NOT NULL,
	"status" "general_ledger_journal_status" NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"total_debit" numeric(18, 2) NOT NULL,
	"total_credit" numeric(18, 2) NOT NULL,
	"created_by" text,
	"submitted_comment" text,
	"submitted_at" timestamp with time zone,
	"decided_by" text,
	"decision_comment" text,
	"decided_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "general_ledger_journals_reference_unique" UNIQUE("reference"),
	CONSTRAINT "general_ledger_journals_source_ledger_transaction_id_unique" UNIQUE("source_ledger_transaction_id"),
	CONSTRAINT "general_ledger_journals_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "general_ledger_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"narrative" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "general_ledger_journals" ADD CONSTRAINT "general_ledger_journals_source_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("source_ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger_journals" ADD CONSTRAINT "general_ledger_journals_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger_journals" ADD CONSTRAINT "general_ledger_journals_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger_lines" ADD CONSTRAINT "general_ledger_lines_journal_id_general_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."general_ledger_journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_ledger_lines" ADD CONSTRAINT "general_ledger_lines_account_id_general_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."general_ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "general_ledger_accounts_type_currency_idx" ON "general_ledger_accounts" USING btree ("type","currency","active");--> statement-breakpoint
CREATE INDEX "general_ledger_journals_date_status_idx" ON "general_ledger_journals" USING btree ("value_date","status");--> statement-breakpoint
CREATE INDEX "general_ledger_journals_source_idx" ON "general_ledger_journals" USING btree ("source","status");--> statement-breakpoint
CREATE UNIQUE INDEX "general_ledger_lines_journal_line_idx" ON "general_ledger_lines" USING btree ("journal_id","line_number");--> statement-breakpoint
CREATE INDEX "general_ledger_lines_account_idx" ON "general_ledger_lines" USING btree ("account_id");