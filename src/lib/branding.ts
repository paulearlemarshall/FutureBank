import "server-only";

import { del, put } from "@vercel/blob";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { brandLogos } from "@/db/schema";
import { documentBlobNamespace, safeDocumentSegment } from "@/lib/document-storage";

export const MAX_BRAND_LOGO_BYTES = 3 * 1024 * 1024;
type BrandLogoMime = "image/png" | "image/jpeg" | "image/webp";

export function brandingBlobPrefix(): string {
  return `futurebank-branding/${documentBlobNamespace()}/logos/`;
}

export async function listBrandLogos() {
  return db.select({ id: brandLogos.id, filename: brandLogos.filename, url: brandLogos.blobUrl, mimeType: brandLogos.mimeType, sizeBytes: brandLogos.sizeBytes, active: brandLogos.active })
    .from(brandLogos).orderBy(asc(brandLogos.createdAt));
}

export async function getActiveBrandLogo() {
  const [logo] = await db.select({ url: brandLogos.blobUrl, filename: brandLogos.filename })
    .from(brandLogos).where(eq(brandLogos.active, true)).limit(1);
  return logo ?? null;
}

function validImageContent(type: string, bytes: Buffer): type is BrandLogoMime {
  if (type === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

export async function uploadBrandLogo(file: File, actorId: string) {
  if (!file.size || file.size > MAX_BRAND_LOGO_BYTES) throw new Error("INVALID_SIZE");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validImageContent(file.type, bytes)) throw new Error("INVALID_IMAGE");
  const filename = safeDocumentSegment(file.name).slice(-100) || "logo";
  const pathname = `${brandingBlobPrefix()}${crypto.randomUUID()}-${filename}`;
  const blob = await put(pathname, bytes, { access: "public", addRandomSuffix: false, contentType: file.type, cacheControlMaxAge: 31536000 });
  try {
    const [logo] = await db.insert(brandLogos).values({ filename: file.name.slice(0, 255), blobUrl: blob.url, blobPathname: blob.pathname, mimeType: file.type, sizeBytes: bytes.byteLength, uploadedBy: actorId }).returning({ id: brandLogos.id });
    return logo;
  } catch (error) {
    await del(blob.url);
    throw error;
  }
}

export async function selectBrandLogo(id: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: brandLogos.id }).from(brandLogos).where(eq(brandLogos.id, id)).limit(1);
    if (!target) throw new Error("LOGO_NOT_FOUND");
    await tx.update(brandLogos).set({ active: false, updatedAt: new Date() }).where(and(eq(brandLogos.active, true), ne(brandLogos.id, id)));
    await tx.update(brandLogos).set({ active: true, updatedAt: new Date() }).where(eq(brandLogos.id, id));
  });
}

export async function deleteBrandLogo(id: string) {
  const [logo] = await db.delete(brandLogos).where(eq(brandLogos.id, id)).returning({ url: brandLogos.blobUrl });
  if (!logo) throw new Error("LOGO_NOT_FOUND");
  await del(logo.url);
}
