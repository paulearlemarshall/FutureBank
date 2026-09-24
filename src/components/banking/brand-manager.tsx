"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useRef, useState } from "react";

type BrandLogo = { id: string; filename: string; url: string; mimeType: string; sizeBytes: number; active: boolean };

export function BrandManager({ logos, activeLogo, canManage }: { logos: BrandLogo[]; activeLogo: BrandLogo | null; canManage: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(intent: "select" | "delete", id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/branding/logos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The logo change failed.");
      setMessage(intent === "select" ? "Active logo updated." : "Logo deleted.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The logo change failed.");
    } finally { setBusy(false); }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/branding/logos", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The logo upload failed.");
      setMessage("Logo uploaded. Select it to make it active.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The logo upload failed.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return <>
    <button type="button" className="brand-cell" onClick={() => { setOpen(true); setMessage(""); }} aria-label="Open brand manager" title="Brand manager" data-bp="brand-manager-open">
      {activeLogo ? <Image src={activeLogo.url} alt="" width={260} height={140} unoptimized /> : <span className="brand-placeholder">FutureBank</span>}
    </button>
    {open ? <div className="brand-manager-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="brand-manager" role="dialog" aria-modal="true" aria-labelledby="brand-manager-title" data-bp="brand-manager">
        <header><div><p className="eyebrow">Workspace settings</p><h2 id="brand-manager-title">Brand manager</h2></div><button type="button" className="brand-manager-close" aria-label="Close brand manager" onClick={() => setOpen(false)} data-bp="brand-manager-close">×</button></header>
        <p className="brand-manager-help">Choose the logo shown in the top-left corner of the application.</p>
        {canManage ? <div className="brand-manager-upload"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a logo image" onChange={(event) => void upload(event.target.files?.[0])} data-bp="brand-logo-upload" /><small>PNG, JPEG or WebP · up to 3 MB</small></div> : <p className="brand-manager-help">An administrator can upload, select or delete logos.</p>}
        <div className="brand-logo-gallery" data-bp="brand-logo-gallery">
          {logos.length ? logos.map((logo) => <article className={`brand-logo-card${logo.active ? " is-active" : ""}`} key={logo.id}>
            <div className="brand-logo-preview"><Image src={logo.url} alt={logo.filename} width={260} height={140} unoptimized /></div>
            <strong title={logo.filename}>{logo.filename}</strong>
            {logo.active ? <span className="brand-logo-active">Active logo</span> : canManage ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void update("select", logo.id)} data-bp={`brand-logo-select-${logo.id}`}>Use this logo</button> : <span className="brand-logo-inactive">Available</span>}
            {canManage ? <button className="brand-logo-delete" type="button" disabled={busy} onClick={() => void update("delete", logo.id)} data-bp={`brand-logo-delete-${logo.id}`}>Delete</button> : null}
          </article>) : <p className="brand-manager-empty">No logos uploaded yet.</p>}
        </div>
        <div className="brand-manager-status" role="status" aria-live="polite" data-bp="brand-manager-status">{message}</div>
      </section>
    </div> : null}
  </>;
}
