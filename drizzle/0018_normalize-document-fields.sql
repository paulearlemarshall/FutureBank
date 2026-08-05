ALTER TABLE "kyc_evidence" RENAME COLUMN "document_id" TO "document_number";
ALTER TABLE "identity_documents" ADD COLUMN "document_reference" text;
UPDATE "identity_documents" AS identity_document
SET "document_reference" = 'IDN-' || customer.customer_number || '-' || identity_document.type
FROM "customers" AS customer
WHERE customer.id = identity_document.customer_id;
ALTER TABLE "identity_documents" ALTER COLUMN "document_reference" SET NOT NULL;
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_document_reference_unique" UNIQUE ("document_reference");
