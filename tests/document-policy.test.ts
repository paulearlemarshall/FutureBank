import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, sanitizeDocumentFilename, validateDocumentUpload } from "@/modules/domain/document-policy";

const jpeg = (size = 8) => Uint8Array.from([0xff, 0xd8, 0xff, ...Array(Math.max(0, size - 3)).fill(0)]);

describe("customer document policy", () => {
  it("accepts JPEG, PNG and PDF signatures", () => {
    expect(validateDocumentUpload({ filename: "a.jpg", mimeType: "image/jpeg", content: jpeg() }).ok).toBe(true);
    expect(validateDocumentUpload({ filename: "a.png", mimeType: "image/png", content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }).ok).toBe(true);
    expect(validateDocumentUpload({ filename: "a.pdf", mimeType: "application/pdf", content: new TextEncoder().encode("%PDF-1.7") }).ok).toBe(true);
  });

  it("rejects empty, unsupported and mismatched files", () => {
    expect(validateDocumentUpload({ filename: "a.jpg", mimeType: "image/jpeg", content: new Uint8Array() })).toMatchObject({ code: "EMPTY_FILE" });
    expect(validateDocumentUpload({ filename: "a.txt", mimeType: "text/plain", content: new TextEncoder().encode("hello") })).toMatchObject({ code: "UNSUPPORTED_TYPE" });
    expect(validateDocumentUpload({ filename: "a.png", mimeType: "image/png", content: jpeg() })).toMatchObject({ code: "TYPE_MISMATCH" });
  });

  it("accepts the exact size limit and rejects one byte over", () => {
    expect(validateDocumentUpload({ filename: "a.jpg", mimeType: "image/jpeg", content: jpeg(MAX_DOCUMENT_BYTES) }).ok).toBe(true);
    expect(validateDocumentUpload({ filename: "a.jpg", mimeType: "image/jpeg", content: jpeg(MAX_DOCUMENT_BYTES + 1) })).toMatchObject({ code: "TOO_LARGE" });
  });

  it("normalizes a safe basename and rejects control characters", () => {
    expect(sanitizeDocumentFilename("C:\\fake\\passport.jpg")).toBe("passport.jpg");
    expect(sanitizeDocumentFilename("bad\nname.jpg")).toBeNull();
  });
});
