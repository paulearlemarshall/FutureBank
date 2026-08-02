"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };
function Feedback({ state, id }: { state: ActionState; id: string }) { return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />; }

export function ReconciliationRunForm({ action, businessDate }: { action: StateAction; businessDate: string }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="reconciliation-run-form"><Feedback state={state} id="reconciliation-run-status" />
    <div className="form-grid two"><Field id="reconciliation-business-date" label="Settlement business date" required><input id="reconciliation-business-date" name="businessDate" data-bp="reconciliation-business-date" type="date" defaultValue={businessDate} max={new Date().toISOString().slice(0, 10)} required /></Field></div>
    <button id="reconciliation-run-submit" name="intent" value="run-reconciliation" data-bp="reconciliation-run-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Reconciling…" : "Run reconciliation"}</button>
  </form>;
}

export function ReconciliationResolutionForm({ action, runReference, items }: { action: StateAction; runReference: string; items: Array<{ reference: string; transactionReference: string; version: number }> }) {
  const [state, submit, pending] = useActionState(action, idle);
  const [selected, setSelected] = useState(items[0]?.reference ?? "");
  const selectedValue = items.some((item) => item.reference === selected) ? selected : (items[0]?.reference ?? "");
  const version = items.find((item) => item.reference === selectedValue)?.version ?? 1;
  return <form action={submit} data-bp="reconciliation-resolution-form"><Feedback state={state} id="reconciliation-resolution-status" />
    <input name="runReference" type="hidden" value={runReference} /><input name="expectedVersion" type="hidden" value={version} />
    <div className="form-grid two"><Field id="reconciliation-item-reference" label="Open exception" required><select id="reconciliation-item-reference" name="itemReference" data-bp="reconciliation-item-reference" value={selectedValue} onChange={(event) => setSelected(event.target.value)} disabled={!items.length} required>{items.length ? items.map((item) => <option key={item.reference} value={item.reference}>{item.transactionReference} · {item.reference}</option>) : <option value="">No open exceptions</option>}</select></Field>
      <Field id="reconciliation-resolution-comment" label="Resolution comment" required><textarea id="reconciliation-resolution-comment" name="comment" data-bp="reconciliation-resolution-comment" rows={3} minLength={10} disabled={!items.length} required /></Field></div>
    <button id="reconciliation-resolution-submit" name="intent" value="resolve-reconciliation" data-bp="reconciliation-resolution-submit" className="primary-button" type="submit" disabled={pending || !selectedValue}>{pending ? "Resolving…" : "Resolve exception"}</button>
  </form>;
}
