import "server-only";

import type { PutBlobResult } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditEvents, customerDocumentFiles, customers, staffProfiles, user as authUsers } from "@/db/schema";
import { deleteDocumentBlob, documentCollectionUploadPath, documentUploadPath, getDocumentBlob, putDocumentBlob, readAndValidateCompletedBlob } from "@/lib/document-storage";
import type { DocumentMeta, DocumentSlot, SessionUser } from "@/modules/contracts";
import { validateDocumentUpload } from "@/modules/domain/document-policy";
import { hasPermission } from "@/modules/domain/auth-policy";
import { BankingError } from "./errors";

type StoredBlob = Pick<PutBlobResult, "url" | "pathname" | "etag" | "contentType">;

function validationMessage(code: string): string {
  return code === "TOO_LARGE" ? "Document files must not exceed 4 MB."
    : code === "EMPTY_FILE" ? "Choose a non-empty document file."
      : code === "INVALID_FILENAME" ? "The document filename is invalid."
        : code === "TYPE_MISMATCH" ? "The file content does not match its declared type."
          : "Only JPEG, PNG and PDF documents are supported.";
}

function meta(row: typeof customerDocumentFiles.$inferSelect): DocumentMeta {
  return { documentReference: row.documentReference, documentType: row.documentType, slot: row.slot, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes, uploadedBy: row.uploadedBy, uploadedAt: row.uploadedAt.toISOString() };
}

export async function activeDocumentActor(id: string, username: string): Promise<SessionUser> {
  const [row] = await db.select({ id: authUsers.id, username: authUsers.username, email: authUsers.email, name: authUsers.name, role: staffProfiles.role })
    .from(authUsers).innerJoin(staffProfiles, and(eq(staffProfiles.userId, authUsers.id), eq(staffProfiles.active, true)))
    .where(and(eq(authUsers.id, id), eq(authUsers.username, username))).limit(1);
  if (!row || !hasPermission(row.role, "KYC_GATHER")) throw new BankingError("FORBIDDEN", "The upload actor is no longer authorized.");
  return { id: row.id, username: row.username ?? row.email, name: row.name, role: row.role };
}

export async function customerIdentity(customerNumber: string): Promise<{ id: string; customerNumber: string }> {
  const [customer] = await db.select({ id: customers.id, customerNumber: customers.customerNumber }).from(customers).where(eq(customers.customerNumber, customerNumber)).limit(1);
  if (!customer) throw new BankingError("CUSTOMER_NOT_FOUND", "Customer not found.");
  return customer;
}

async function persistDocument(input: {
  customerId: string; customerNumber: string; documentReference: string; documentType: string; slot: DocumentSlot | null; filename: string; mimeType: string; sizeBytes: number;
  sha256: string; blob: StoredBlob; isSeeded?: boolean; uploadedAt?: Date;
}, actor: Pick<SessionUser, "id" | "username">): Promise<{ document: DocumentMeta; created: boolean }> {
  let prior: typeof customerDocumentFiles.$inferSelect | undefined;
  const stored = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.customerId}:${input.documentReference}`}))`);
    [prior] = await tx.select().from(customerDocumentFiles).where(and(eq(customerDocumentFiles.customerId, input.customerId), eq(customerDocumentFiles.documentReference, input.documentReference))).limit(1);
    const uploadedAt = input.uploadedAt ?? new Date();
    const values = {
      filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, blobUrl: input.blob.url,
      blobPathname: input.blob.pathname, blobEtag: input.blob.etag, sha256: input.sha256, uploadedBy: actor.username,
      uploadedAt, isSeeded: input.isSeeded ?? false, updatedAt: uploadedAt, documentReference: input.documentReference, documentType: input.documentType, slot: input.slot,
    };
    const [row] = prior
      ? await tx.update(customerDocumentFiles).set(values).where(eq(customerDocumentFiles.id, prior.id)).returning()
      : await tx.insert(customerDocumentFiles).values({ customerId: input.customerId, ...values }).returning();
    await tx.insert(auditEvents).values({
      actorUserId: actor.id === "system.seed" ? null : actor.id, actorUsername: actor.username,
      action: input.isSeeded ? "DOCUMENT_BASELINE_CREATED" : "DOCUMENT_UPLOADED", entityType: "CUSTOMER", entityReference: input.customerNumber,
      correlationId: crypto.randomUUID(), before: prior ? { documentReference: prior.documentReference, documentType: prior.documentType, filename: prior.filename, mimeType: prior.mimeType, sizeBytes: prior.sizeBytes } : null,
      after: { documentReference: row.documentReference, documentType: row.documentType, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes },
    });
    return row;
  });
  if (prior && !prior.isSeeded && prior.blobUrl !== input.blob.url) await deleteDocumentBlob(prior.blobUrl).catch(() => undefined);
  return { document: meta(stored), created: !prior };
}

export async function uploadCustomerDocument(input: { customerNumber: string; slot: DocumentSlot; file: File | { name: string; type: string; content: Buffer } }, actor: SessionUser) {
  const content = "content" in input.file ? input.file.content : Buffer.from(await input.file.arrayBuffer());
  const validation = validateDocumentUpload({ filename: input.file.name, mimeType: input.file.type, content });
  if (!validation.ok) throw new BankingError(validation.code, validationMessage(validation.code));
  const customer = await customerIdentity(input.customerNumber);
  const pathname = documentUploadPath(customer.customerNumber, input.slot, validation.filename);
  const blob = await putDocumentBlob(pathname, content);
  try {
    return await persistDocument({ customerId: customer.id, customerNumber: customer.customerNumber, documentReference: `IDN-${customer.customerNumber}-${input.slot}`, documentType: input.slot, slot: input.slot, filename: validation.filename, mimeType: validation.mimeType, sizeBytes: validation.sizeBytes, sha256: createHash("sha256").update(content).digest("hex"), blob }, actor);
  } catch (error) {
    await deleteDocumentBlob(blob.url).catch(() => undefined);
    throw error;
  }
}

export async function completeClientDocumentUpload(input: { customerNumber: string; slot: DocumentSlot; filename: string; blob: PutBlobResult }, actor: SessionUser) {
  const customer = await customerIdentity(input.customerNumber);
  let checked: Awaited<ReturnType<typeof readAndValidateCompletedBlob>>;
  try { checked = await readAndValidateCompletedBlob(input.blob); }
  catch (error) { await deleteDocumentBlob(input.blob.url).catch(() => undefined); throw error; }
  const validation = validateDocumentUpload({ filename: input.filename, mimeType: input.blob.contentType, content: checked.content });
  if (!validation.ok) { await deleteDocumentBlob(input.blob.url).catch(() => undefined); throw new BankingError(validation.code, validationMessage(validation.code)); }
  return persistDocument({ customerId: customer.id, customerNumber: customer.customerNumber, documentReference: `IDN-${customer.customerNumber}-${input.slot}`, documentType: input.slot, slot: input.slot, filename: validation.filename, mimeType: validation.mimeType, sizeBytes: validation.sizeBytes, sha256: checked.sha256, blob: input.blob }, actor);
}

export async function deleteCustomerDocument(input: { customerNumber: string; slot: DocumentSlot }, actor: SessionUser): Promise<boolean> {
  const customer = await customerIdentity(input.customerNumber);
  let removed: typeof customerDocumentFiles.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${customer.id}:${input.slot}`}))`);
    [removed] = await tx.delete(customerDocumentFiles).where(and(eq(customerDocumentFiles.customerId, customer.id), eq(customerDocumentFiles.slot, input.slot))).returning();
    if (removed) await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "DOCUMENT_DELETED", entityType: "CUSTOMER", entityReference: customer.customerNumber, correlationId: crypto.randomUUID(), before: { documentReference: removed.documentReference, documentType: removed.documentType, filename: removed.filename, mimeType: removed.mimeType, sizeBytes: removed.sizeBytes }, after: null });
  });
  if (removed && !removed.isSeeded) await deleteDocumentBlob(removed.blobUrl).catch(() => undefined);
  return Boolean(removed);
}

export async function getCustomerDocument(customerNumber: string, slot: DocumentSlot) {
  const [row] = await db.select({ document: customerDocumentFiles }).from(customerDocumentFiles).innerJoin(customers, eq(customers.id, customerDocumentFiles.customerId))
    .where(and(eq(customers.customerNumber, customerNumber), eq(customerDocumentFiles.slot, slot))).limit(1);
  return row?.document ?? null;
}

export async function getCustomerDocumentMetadata(customerNumber: string, slot: DocumentSlot): Promise<DocumentMeta | null> {
  const document = await getCustomerDocument(customerNumber, slot);
  return document ? meta(document) : null;
}

export async function getCustomerDocumentContent(customerNumber: string, slot: DocumentSlot) {
  const document = await getCustomerDocument(customerNumber, slot);
  if (!document) return null;
  const blob = await getDocumentBlob(document.blobUrl);
  if (!blob || blob.statusCode !== 200) return null;
  return { document, stream: blob.stream };
}

export async function deleteCustomerDocumentByReference(input: { customerNumber: string; documentReference: string }, actor: SessionUser): Promise<boolean> {
  const customer = await customerIdentity(input.customerNumber);
  let removed: typeof customerDocumentFiles.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    [removed] = await tx.delete(customerDocumentFiles).where(and(eq(customerDocumentFiles.customerId, customer.id), eq(customerDocumentFiles.documentReference, input.documentReference))).returning();
    if (removed) await tx.insert(auditEvents).values({ actorUserId: actor.id, actorUsername: actor.username, action: "DOCUMENT_DELETED", entityType: "CUSTOMER", entityReference: customer.customerNumber, correlationId: crypto.randomUUID(), before: { documentReference: removed.documentReference, documentType: removed.documentType, filename: removed.filename, mimeType: removed.mimeType, sizeBytes: removed.sizeBytes }, after: null });
  });
  if (removed && !removed.isSeeded) await deleteDocumentBlob(removed.blobUrl).catch(() => undefined);
  return Boolean(removed);
}

export async function listCustomerDocuments(customerNumber: string) {
  const customer = await customerIdentity(customerNumber);
  return (await db.select().from(customerDocumentFiles).where(eq(customerDocumentFiles.customerId, customer.id)).orderBy(customerDocumentFiles.documentType, customerDocumentFiles.documentReference)).map(meta);
}

export async function getCustomerDocumentByReference(customerNumber: string, documentReference: string) {
  const [row] = await db.select({ document: customerDocumentFiles }).from(customerDocumentFiles).innerJoin(customers, eq(customers.id, customerDocumentFiles.customerId))
    .where(and(eq(customers.customerNumber, customerNumber), eq(customerDocumentFiles.documentReference, documentReference))).limit(1);
  return row?.document ?? null;
}

export async function getCustomerDocumentContentByReference(customerNumber: string, documentReference: string) {
  const document = await getCustomerDocumentByReference(customerNumber, documentReference);
  if (!document) return null;
  const blob = await getDocumentBlob(document.blobUrl);
  if (!blob || blob.statusCode !== 200) return null;
  return { document, stream: blob.stream };
}

export async function uploadCustomerDocumentCollection(input: { customerNumber: string; documentReference: string; documentType: string; file: File | { name: string; type: string; content: Buffer } }, actor: SessionUser) {
  const content = "content" in input.file ? input.file.content : Buffer.from(await input.file.arrayBuffer());
  const validation = validateDocumentUpload({ filename: input.file.name, mimeType: input.file.type, content });
  if (!validation.ok) throw new BankingError(validation.code, validationMessage(validation.code));
  const customer = await customerIdentity(input.customerNumber);
  const pathname = documentCollectionUploadPath(customer.customerNumber, input.documentReference, validation.filename);
  const blob = await putDocumentBlob(pathname, content);
  try {
    return await persistDocument({ customerId: customer.id, customerNumber: customer.customerNumber, documentReference: input.documentReference, documentType: input.documentType, slot: null, filename: validation.filename, mimeType: validation.mimeType, sizeBytes: validation.sizeBytes, sha256: createHash("sha256").update(content).digest("hex"), blob }, actor);
  } catch (error) { await deleteDocumentBlob(blob.url).catch(() => undefined); throw error; }
}

export async function seedDocumentRecord(input: { customerId: string; customerNumber: string; slot: DocumentSlot; filename: string; mimeType: string; sizeBytes: number; sha256: string; blob: StoredBlob }) {
  return persistDocument({ ...input, documentReference: `IDN-${input.customerNumber}-${input.slot}`, documentType: input.slot, isSeeded: true, uploadedAt: new Date("2026-07-20T08:00:00.000Z") }, { id: "system.seed", username: "system.seed" });
}
