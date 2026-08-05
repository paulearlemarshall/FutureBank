"use client";

import { upload } from "@vercel/blob/client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { deleteCustomerDocumentAction } from "@/modules/actions/documents";
import { initialActionState, type CustomerDocument, type CustomerDocumentSlot, type DocumentSlot } from "@/modules/contracts";
import { MAX_DOCUMENT_BYTES, sanitizeDocumentFilename } from "@/modules/domain/document-policy";

function slug(slot: DocumentSlot) { return slot === "PASSPORT" ? "passport" : "national-id"; }
function label(slot: DocumentSlot) { return slot === "PASSPORT" ? "Passport" : "National ID"; }
function displaySize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`; }

async function waitForDocumentMetadata(customerNumber: string, documentReference: string, previousUploadedAt: string | null): Promise<CustomerDocument> {
  const metadataUrl = `/customers/${customerNumber}/documents/${encodeURIComponent(documentReference)}/metadata`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(metadataUrl, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json() as { data: CustomerDocument };
      if (!previousUploadedAt || payload.data.uploadedAt !== previousUploadedAt) return payload.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DOCUMENT_FINALIZATION_TIMEOUT");
}

function DocumentCard({ customerNumber, document, uploadPrefix, canEdit }: { customerNumber: string; document: CustomerDocumentSlot; uploadPrefix: string; canEdit: boolean }) {
  const router = useRouter();
  const isEmpty = "empty" in document;
  const reference = isEmpty ? `IDN-${customerNumber}-${document.slot}` : document.documentReference;
  const documentType = isEmpty ? document.slot : document.documentType;
  const referenceSlug = reference.toLowerCase();
  const selectorSlug = isEmpty || document.slot ? slug(document.slot) : referenceSlug;
  const pathReference = reference.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteCustomerDocumentAction.bind(null, customerNumber, reference), initialActionState);
  const contentUrl = `/customers/${customerNumber}/documents/${encodeURIComponent(reference)}`;

  async function submitUpload(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) { setUploadMessage("Choose a document file."); return; }
    const filename = sanitizeDocumentFilename(file.name);
    if (!filename) { setUploadMessage("The filename is invalid."); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setUploadMessage("Document files must not exceed 4 MB."); return; }
    setUploading(true); setUploadMessage("Uploading document…");
    try {
      const previousUploadedAt = isEmpty ? null : document.uploadedAt;
      const pathname = `${uploadPrefix}/uploads/${customerNumber}/${pathReference}/${crypto.randomUUID()}-${filename}`;
      await upload(pathname, file, { access: "private", handleUploadUrl: "/api/customer-document-upload", clientPayload: JSON.stringify({ customerNumber, documentReference: reference, documentType, filename }) });
      setUploadMessage("Finalizing document…");
      await waitForDocumentMetadata(customerNumber, reference, previousUploadedAt);
      setUploadMessage("Document uploaded.");
      router.refresh();
    } catch { setUploadMessage("The document upload could not be completed."); }
    finally { setUploading(false); }
  }

  return <section className="document-card" data-bp={`document-slot-${selectorSlug}`}>
    <h3>{label(document.slot)}</h3>
    {"empty" in document ? <div className="document-empty">No file uploaded</div> : <>
      {document.mimeType.startsWith("image/") ? <Image className="document-preview" src={`${contentUrl}?v=${encodeURIComponent(document.uploadedAt)}`} alt={`${label(document.slot)} preview`} width={640} height={420} loading="eager" unoptimized /> : <div className="document-pdf">PDF document</div>}
      <dl className="definition-grid"><div><dt>Type</dt><dd>{document.documentType}</dd></div><div><dt>Document reference</dt><dd className="mono">{document.documentReference}</dd></div><div><dt>Filename</dt><dd>{document.filename}</dd></div><div><dt>Size</dt><dd>{displaySize(document.sizeBytes)}</dd></div><div><dt>Uploaded by</dt><dd>{document.uploadedBy}</dd></div><div><dt>Uploaded</dt><dd>{new Date(document.uploadedAt).toLocaleString("en-GB")}</dd></div></dl>
      <a className="secondary-button" href={contentUrl} target="_blank" rel="noreferrer" data-bp={`document-view-${selectorSlug}`}>View</a>
      {canEdit ? <form action={deleteFormAction} className="document-delete-form" onSubmit={() => setUploadMessage("")}><label htmlFor={`document-delete-confirm-${selectorSlug}`}><input id={`document-delete-confirm-${selectorSlug}`} name="confirmDelete" type="checkbox" value="yes" data-bp={`document-delete-confirm-${selectorSlug}`} required /> Confirm delete</label><button id={`document-delete-${selectorSlug}`} name={`delete-${selectorSlug}`} type="submit" className="danger-button" data-bp={`document-delete-${selectorSlug}`} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</button></form> : null}
    </>}
    {canEdit ? <form action={submitUpload} className="document-upload-form">
      <label htmlFor={`document-file-${selectorSlug}`}>{isEmpty ? "Upload file" : "Replace file"}</label>
      <input id={`document-file-${selectorSlug}`} name="file" type="file" accept="image/jpeg,image/png,application/pdf" data-bp={`document-file-${selectorSlug}`} required />
      <button id={`document-upload-${selectorSlug}`} name={`upload-${selectorSlug}`} type="submit" className="primary-button" data-bp={`document-upload-${selectorSlug}`} disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</button>
    </form> : null}
    <div id={`document-status-${selectorSlug}`} className="form-status" role="status" aria-live="polite" data-bp={`status-document-${selectorSlug}`}>{uploadMessage || deleteState.message}</div>
  </section>;
}

export function CustomerDocuments(props: { customerNumber: string; documents: CustomerDocumentSlot[]; documentCollection?: CustomerDocument[]; uploadPrefix: string; canEdit: boolean }) {
  const additional = (props.documentCollection ?? []).filter((document) => !document.slot);
  return <><div className="document-grid">{props.documents.map((document) => <DocumentCard key={document.slot} customerNumber={props.customerNumber} document={document} uploadPrefix={props.uploadPrefix} canEdit={props.canEdit} />)}</div>{additional.length ? <section className="page-stack" aria-label="Additional customer documents"><h3>Additional documents</h3><table className="data-table" data-bp="customer-document-collection"><thead><tr><th>Type</th><th>Document reference</th><th>Filename</th><th>Uploaded</th></tr></thead><tbody>{additional.map((document) => <tr key={document.documentReference}><td>{document.documentType}</td><td className="mono">{document.documentReference}</td><td>{document.filename}</td><td>{new Date(document.uploadedAt).toLocaleString("en-GB")}</td></tr>)}</tbody></table></section> : null}</>;
}
