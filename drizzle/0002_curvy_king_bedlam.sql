ALTER TABLE "customers" ADD COLUMN "rim_number" text;--> statement-breakpoint
UPDATE "customers" SET "rim_number" = 'RIM' || substring("customer_number" from 2) WHERE "rim_number" IS NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "rim_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_rim_number_unique" UNIQUE("rim_number");
