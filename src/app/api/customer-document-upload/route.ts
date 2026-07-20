import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { documentBlobPrefix } from "@/lib/document-storage";
import { requirePermission } from "@/lib/auth/session";
import { isDocumentSlot, MAX_DOCUMENT_BYTES, sanitizeDocumentFilename } from "@/modules/domain/document-policy";
import { activeDocumentActor, completeClientDocumentUpload, customerIdentity } from "@/modules/services/documents";

type UploadPayload = { actorId: string; actorUsername: string; customerNumber: string; slot: string; filename: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const actor = await requirePermission("KYC_GATHER");
        let payload: { customerNumber?: string; slot?: string; filename?: string } = {};
        try { payload = JSON.parse(clientPayload ?? "{}"); } catch { throw new Error("INVALID_UPLOAD_PAYLOAD"); }
        if (!payload.customerNumber || !payload.slot || !isDocumentSlot(payload.slot)) throw new Error("INVALID_UPLOAD_PAYLOAD");
        const filename = sanitizeDocumentFilename(payload.filename ?? "");
        if (!filename) throw new Error("INVALID_FILENAME");
        await customerIdentity(payload.customerNumber);
        const expectedPrefix = `${documentBlobPrefix()}/uploads/${payload.customerNumber}/${payload.slot}/`;
        if (!pathname.startsWith(expectedPrefix) || !pathname.endsWith(`-${filename}`)) throw new Error("INVALID_UPLOAD_PATH");
        const signedPayload: UploadPayload = { actorId: actor.id, actorUsername: actor.username, customerNumber: payload.customerNumber, slot: payload.slot, filename };
        return { allowedContentTypes: ["image/jpeg", "image/png", "application/pdf"], maximumSizeInBytes: MAX_DOCUMENT_BYTES, validUntil: Date.now() + 10 * 60_000, addRandomSuffix: false, allowOverwrite: false, tokenPayload: JSON.stringify(signedPayload) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload ?? "{}") as UploadPayload;
        if (!payload.actorId || !payload.actorUsername || !payload.customerNumber || !isDocumentSlot(payload.slot)) throw new Error("INVALID_UPLOAD_CALLBACK");
        const actor = await activeDocumentActor(payload.actorId, payload.actorUsername);
        await completeClientDocumentUpload({ customerNumber: payload.customerNumber, slot: payload.slot, filename: payload.filename, blob }, actor);
      },
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer document upload failed", error instanceof Error ? error.message : error);
    return Response.json({ error: { code: "DOCUMENT_UPLOAD_FAILED", message: "The document upload could not be completed." } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
