import { requireUser } from "@/lib/auth/session";
import { getCustomerDocumentByReference } from "@/modules/services/documents";

export async function GET(_request: Request, { params }: { params: Promise<{ customerNumber: string; slot: string }> }) {
  await requireUser();
  const { customerNumber, slot: documentReference } = await params;
  const document = await getCustomerDocumentByReference(customerNumber, documentReference);
  if (!document) return Response.json({ error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ data: { documentReference: document.documentReference, documentType: document.documentType, slot: document.slot, filename: document.filename, mimeType: document.mimeType, sizeBytes: document.sizeBytes, uploadedBy: document.uploadedBy, uploadedAt: document.uploadedAt.toISOString() } }, { headers: { "Cache-Control": "no-store" } });
}
