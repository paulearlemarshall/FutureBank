"use client";

import { upload } from "@vercel/blob/client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { deleteCustomerDocumentAction } from "@/modules/actions/documents";
import { initialActionState, type CustomerDocumentSlot, type DocumentSlot } from "@/modules/contracts";
import { MAX_DOCUMENT_BYTES, sanitizeDocumentFilename } from "@/modules/domain/document-policy";

function slug(slot: DocumentSlot) { return slot === "PASSPORT" ? "passport" : "national-id"; }
function label(slot: DocumentSlot) { return slot === "PASSPORT" ? "Passport" : "National ID"; }
function displaySize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`; }

async function waitForDocumentMetadata(customerNumber: string, slot: DocumentSlot, previousUploadedAt: string | null): Promise<Exclude<CustomerDocumentSlot, { empty: true }>> {
  const metadataUrl = `/customers/${customerNumber}/documents/${slot}/metadata`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(metadataUrl, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json() as { data: Exclude<CustomerDocumentSlot, { empty: true }> };
      if (!previousUploadedAt || payload.data.uploadedAt !== previousUploadedAt) return payload.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DOCUMENT_FINALIZATION_TIMEOUT");
}

function DocumentCard({ customerNumber, document, uploadPrefix, canEdit }: { customerNumber: string; document: CustomerDocumentSlot; uploadPrefix: string; canEdit: boolean }) {
  const router = useRouter();
  const [displayDocument, setDisplayDocument] = useState(document);
  const slotSlug = slug(displayDocument.slot);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteCustomerDocumentAction.bind(null, customerNumber, displayDocument.slot), initialActionState);
  const contentUrl = `/customers/${customerNumber}/documents/${displayDocument.slot}`;

  async function submitUpload(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) { setUploadMessage("Choose a document file."); return; }
    const filename = sanitizeDocumentFilename(file.name);
    if (!filename) { setUploadMessage("The filename is invalid."); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setUploadMessage("Document files must not exceed 4 MB."); return; }
    setUploading(true); setUploadMessage("Uploading document…");
    try {
      const previousUploadedAt = "empty" in displayDocument ? null : displayDocument.uploadedAt;
      const pathname = `${uploadPrefix}/uploads/${customerNumber}/${displayDocument.slot}/${crypto.randomUUID()}-${filename}`;
      await upload(pathname, file, { access: "private", handleUploadUrl: "/api/customer-document-upload", clientPayload: JSON.stringify({ customerNumber, slot: displayDocument.slot, filename }) });
      setUploadMessage("Finalizing document…");
      const finalized = await waitForDocumentMetadata(customerNumber, displayDocument.slot, previousUploadedAt);
      setDisplayDocument(finalized);
      setUploadMessage("Document uploaded.");
      router.refresh();
    } catch { setUploadMessage("The document upload could not be completed."); }
    finally { setUploading(false); }
  }

  return <section className="document-card" data-bp={`document-slot-${slotSlug}`}>
    <h3>{label(displayDocument.slot)}</h3>
    {"empty" in displayDocument ? <div className="document-empty">No file uploaded</div> : <>
      {displayDocument.mimeType.startsWith("image/") ? <Image className="document-preview" src={contentUrl} alt={`${label(displayDocument.slot)} preview`} width={640} height={420} loading="eager" unoptimized /> : <div className="document-pdf">PDF document</div>}
      <dl className="definition-grid"><div><dt>Filename</dt><dd>{displayDocument.filename}</dd></div><div><dt>Size</dt><dd>{displaySize(displayDocument.sizeBytes)}</dd></div><div><dt>Uploaded by</dt><dd>{displayDocument.uploadedBy}</dd></div><div><dt>Uploaded</dt><dd>{new Date(displayDocument.uploadedAt).toLocaleString("en-GB")}</dd></div></dl>
      <a className="secondary-button" href={contentUrl} target="_blank" rel="noreferrer" data-bp={`document-view-${slotSlug}`}>View</a>
      {canEdit ? <form action={deleteFormAction} className="document-delete-form" onSubmit={() => setUploadMessage("")}><label htmlFor={`document-delete-confirm-${slotSlug}`}><input id={`document-delete-confirm-${slotSlug}`} name="confirmDelete" type="checkbox" value="yes" data-bp={`document-delete-confirm-${slotSlug}`} required /> Confirm delete</label><button id={`document-delete-${slotSlug}`} name={`delete-${slotSlug}`} type="submit" className="danger-button" data-bp={`document-delete-${slotSlug}`} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</button></form> : null}
    </>}
    {canEdit ? <form action={submitUpload} className="document-upload-form">
      <label htmlFor={`document-file-${slotSlug}`}>{"empty" in displayDocument ? "Upload file" : "Replace file"}</label>
      <input id={`document-file-${slotSlug}`} name="file" type="file" accept="image/jpeg,image/png,application/pdf" data-bp={`document-file-${slotSlug}`} required />
      <button id={`document-upload-${slotSlug}`} name={`upload-${slotSlug}`} type="submit" className="primary-button" data-bp={`document-upload-${slotSlug}`} disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</button>
    </form> : null}
    <div id={`document-status-${slotSlug}`} className="form-status" role="status" aria-live="polite" data-bp={`status-document-${slotSlug}`}>{uploadMessage || deleteState.message}</div>
  </section>;
}

export function CustomerDocuments(props: { customerNumber: string; documents: CustomerDocumentSlot[]; uploadPrefix: string; canEdit: boolean }) {
  return <div className="document-grid">{props.documents.map((document) => <DocumentCard key={`${document.slot}-${"empty" in document ? "empty" : document.uploadedAt}`} customerNumber={props.customerNumber} document={document} uploadPrefix={props.uploadPrefix} canEdit={props.canEdit} />)}</div>;
}
