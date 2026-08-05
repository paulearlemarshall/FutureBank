ALTER TABLE "customer_document_files" ADD COLUMN "document_reference" text;
ALTER TABLE "customer_document_files" ADD COLUMN "document_type" text;
UPDATE "customer_document_files" AS document_file
SET "document_reference" = 'IDN-' || customer.customer_number || '-' || document_file.slot,
    "document_type" = document_file.slot
FROM "customers" AS customer
WHERE customer.id = document_file.customer_id;
ALTER TABLE "customer_document_files" ALTER COLUMN "document_reference" SET NOT NULL;
ALTER TABLE "customer_document_files" ALTER COLUMN "document_type" SET NOT NULL;
ALTER TABLE "customer_document_files" ALTER COLUMN "slot" DROP NOT NULL;
DROP INDEX IF EXISTS "customer_document_files_slot_idx";
CREATE UNIQUE INDEX "customer_document_files_reference_idx" ON "customer_document_files" USING btree ("customer_id","document_reference");
CREATE INDEX "customer_document_files_type_idx" ON "customer_document_files" USING btree ("customer_id","document_type");
