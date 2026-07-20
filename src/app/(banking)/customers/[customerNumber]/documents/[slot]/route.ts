import { notFound } from "next/navigation";
import { safeContentDisposition } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { isDocumentSlot } from "@/modules/domain/document-policy";
import { getCustomerDocumentContent } from "@/modules/services/documents";

export async function GET(_request: Request, { params }: { params: Promise<{ customerNumber: string; slot: string }> }) {
  await requireUser();
  const { customerNumber, slot } = await params;
  if (!isDocumentSlot(slot)) notFound();
  const result = await getCustomerDocumentContent(customerNumber, slot);
  if (!result) notFound();
  return new Response(result.stream, { headers: { "Content-Type": result.document.mimeType, "Content-Disposition": safeContentDisposition(result.document.filename), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
