import { requireUser } from "@/lib/auth/session";
import { isDocumentSlot } from "@/modules/domain/document-policy";
import { getCustomerDocumentMetadata } from "@/modules/services/documents";

export async function GET(_request: Request, { params }: { params: Promise<{ customerNumber: string; slot: string }> }) {
  await requireUser();
  const { customerNumber, slot } = await params;
  if (!isDocumentSlot(slot)) return Response.json({ error: { code: "INVALID_DOCUMENT_SLOT", message: "Document slot is invalid." } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const document = await getCustomerDocumentMetadata(customerNumber, slot);
  if (!document) return Response.json({ error: { code: "DOCUMENT_NOT_FOUND", message: "Document not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ data: document }, { headers: { "Cache-Control": "no-store" } });
}
