CREATE TYPE "public"."document_slot" AS ENUM('PASSPORT', 'NATIONAL_ID');--> statement-breakpoint
CREATE TABLE "customer_document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"slot" "document_slot" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_etag" text,
	"sha256" text,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_document_files" ADD CONSTRAINT "customer_document_files_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_document_files_slot_idx" ON "customer_document_files" USING btree ("customer_id","slot");--> statement-breakpoint
CREATE INDEX "customer_document_files_customer_idx" ON "customer_document_files" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_document_files_pathname_idx" ON "customer_document_files" USING btree ("blob_pathname");