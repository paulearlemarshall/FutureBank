import { headDocumentBlob, putDocumentBlob, seedDocumentPath } from "@/lib/document-storage";
import type { DocumentSlot } from "@/modules/contracts";
import { seededCustomerDocuments } from "./seed-document-fixtures.generated";

export type PreparedSeedDocument = {
  slot: DocumentSlot;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  blobUrl: string;
  blobPathname: string;
  blobEtag: string;
};

export async function prepareSeedDocumentBlobs(): Promise<PreparedSeedDocument[]> {
  const prepared: PreparedSeedDocument[] = [];
  for (const fixture of seededCustomerDocuments) {
    const pathname = seedDocumentPath(fixture.slot, fixture.sha256, fixture.filename);
    const existing = await headDocumentBlob(pathname);
    const blob = existing ?? await putDocumentBlob(pathname, Buffer.from(fixture.base64, "base64"));
    prepared.push({
      slot: fixture.slot,
      filename: fixture.filename,
      mimeType: fixture.mimeType,
      sizeBytes: fixture.sizeBytes,
      sha256: fixture.sha256,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      blobEtag: blob.etag,
    });
  }
  return prepared;
}
