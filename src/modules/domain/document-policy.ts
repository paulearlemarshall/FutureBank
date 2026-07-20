export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const DOCUMENT_SLOTS = ["PASSPORT", "NATIONAL_ID"] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];
export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number];

export type DocumentValidationFailure = "EMPTY_FILE" | "UNSUPPORTED_TYPE" | "TYPE_MISMATCH" | "TOO_LARGE" | "INVALID_FILENAME";

export function isDocumentSlot(value: string): value is DocumentSlot {
  return DOCUMENT_SLOTS.includes(value as DocumentSlot);
}

export function sanitizeDocumentFilename(value: string): string | null {
  const filename = value.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename)) return null;
  return filename.replaceAll('"', "'");
}

function detectedMimeType(content: Uint8Array): AllowedDocumentMimeType | null {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => content[index] === value)) return "image/png";
  if (content.length >= 5 && String.fromCharCode(...content.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

export function validateDocumentUpload(input: { filename: string; mimeType: string; content: Uint8Array }):
  { ok: true; filename: string; mimeType: AllowedDocumentMimeType; sizeBytes: number } | { ok: false; code: DocumentValidationFailure } {
  const filename = sanitizeDocumentFilename(input.filename);
  if (!filename) return { ok: false, code: "INVALID_FILENAME" };
  if (!input.content.byteLength) return { ok: false, code: "EMPTY_FILE" };
  if (input.content.byteLength > MAX_DOCUMENT_BYTES) return { ok: false, code: "TOO_LARGE" };
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(input.mimeType as AllowedDocumentMimeType)) return { ok: false, code: "UNSUPPORTED_TYPE" };
  if (detectedMimeType(input.content) !== input.mimeType) return { ok: false, code: "TYPE_MISMATCH" };
  return { ok: true, filename, mimeType: input.mimeType as AllowedDocumentMimeType, sizeBytes: input.content.byteLength };
}
