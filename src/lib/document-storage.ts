import { del, get, head, list, put, type PutBlobResult } from "@vercel/blob";
import { createHash } from "node:crypto";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES, type DocumentSlot } from "@/modules/domain/document-policy";

export function safeDocumentSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

export function documentBlobNamespace(): string {
  if (process.env.FUTUREBANK_BLOB_NAMESPACE) return safeDocumentSegment(process.env.FUTUREBANK_BLOB_NAMESPACE);
  if (process.env.CI && process.env.GITHUB_RUN_ID) return `ci-${safeDocumentSegment(process.env.GITHUB_RUN_ID)}-${safeDocumentSegment(process.env.GITHUB_RUN_ATTEMPT ?? "1")}`;
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return `preview-${safeDocumentSegment(process.env.VERCEL_GIT_COMMIT_REF ?? "default")}`;
  return "development";
}

export function documentBlobPrefix(): string {
  return `futurebank-documents/${documentBlobNamespace()}`;
}

export function documentUploadPath(customerNumber: string, slot: DocumentSlot, filename: string): string {
  return `${documentBlobPrefix()}/uploads/${customerNumber}/${slot}/${crypto.randomUUID()}-${filename}`;
}

export function documentCollectionUploadPath(customerNumber: string, documentReference: string, filename: string): string {
  return `${documentBlobPrefix()}/uploads/${customerNumber}/${safeDocumentSegment(documentReference)}/${crypto.randomUUID()}-${filename}`;
}

export function documentCollectionUploadPrefix(customerNumber: string, documentReference: string): string {
  return `${documentBlobPrefix()}/uploads/${customerNumber}/${safeDocumentSegment(documentReference)}/`;
}

export function seedDocumentPath(slot: DocumentSlot, sha256: string, filename: string): string {
  return `${documentBlobPrefix()}/seed/C000001/${slot}/${sha256}-${filename}`;
}

export async function putDocumentBlob(pathname: string, content: Buffer | File, options: { addRandomSuffix?: boolean } = {}): Promise<PutBlobResult> {
  return put(pathname, content, { access: "private", addRandomSuffix: options.addRandomSuffix ?? false, cacheControlMaxAge: 60 });
}

export async function headDocumentBlob(pathname: string) {
  try { return await head(pathname); }
  catch { return null; }
}

export async function getDocumentBlob(urlOrPathname: string) {
  return get(urlOrPathname, { access: "private", useCache: false });
}

export async function deleteDocumentBlob(urlOrPathname: string): Promise<void> {
  await del(urlOrPathname);
}

export async function readAndValidateCompletedBlob(blob: PutBlobResult): Promise<{ content: Buffer; sizeBytes: number; sha256: string }> {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(blob.contentType as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) throw new Error("UNSUPPORTED_TYPE");
  const result = await getDocumentBlob(blob.url);
  if (!result || result.statusCode !== 200) throw new Error("DOCUMENT_CONTENT_NOT_FOUND");
  if (!result.blob.size || result.blob.size > MAX_DOCUMENT_BYTES) throw new Error(result.blob.size ? "TOO_LARGE" : "EMPTY_FILE");
  const content = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { content, sizeBytes: content.byteLength, sha256: createHash("sha256").update(content).digest("hex") };
}

export async function listNamespaceBlobs(): Promise<Array<{ url: string; pathname: string }>> {
  const rows: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${documentBlobPrefix()}/`, cursor, limit: 1000 });
    rows.push(...page.blobs.map((blob) => ({ url: blob.url, pathname: blob.pathname })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return rows;
}

export async function removeUnreferencedNamespaceBlobs(referencedPathnames: Set<string>): Promise<void> {
  const stale = (await listNamespaceBlobs()).filter((blob) => !referencedPathnames.has(blob.pathname));
  if (stale.length) await del(stale.map((blob) => blob.url));
}

export async function emptyDocumentBlobNamespace(): Promise<void> {
  const blobs = await listNamespaceBlobs();
  if (blobs.length) await del(blobs.map((blob) => blob.url));
}
