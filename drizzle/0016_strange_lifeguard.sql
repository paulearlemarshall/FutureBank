ALTER TABLE "kyc_cases" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD COLUMN "lock_reason" text;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;