CREATE TABLE "brand_logos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_logos_blob_url_unique" UNIQUE("blob_url"),
	CONSTRAINT "brand_logos_blob_pathname_unique" UNIQUE("blob_pathname")
);
--> statement-breakpoint
ALTER TABLE "brand_logos" ADD CONSTRAINT "brand_logos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_logos_single_active_idx" ON "brand_logos" USING btree ("active") WHERE "brand_logos"."active" = true;--> statement-breakpoint
