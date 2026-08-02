"use client";

import { useActionState, useState } from "react";
import type { ActionState, WorkQueueItem } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };
function Feedback({ state, id }: { state: ActionState; id: string }) { return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />; }

export function AccountingPeriodCloseRequestForm({ action, periodReference, version }: { action: StateAction; periodReference: string; version: number }) {
  const [state, submit, pending] = useActionState(action, idle);
  const [comment, setComment] = useState("");
  return <form action={submit} data-bp="accounting-period-close-request-form"><Feedback state={state} id="accounting-period-close-request-status" /><input name="periodReference" type="hidden" value={periodReference} /><input name="expectedVersion" type="hidden" value={version} />
    <Field id="accounting-period-close-request-comment" label="Close request evidence" required><textarea id="accounting-period-close-request-comment" name="comment" data-bp="accounting-period-close-request-comment" rows={3} minLength={10} value={comment} onChange={(event) => setComment(event.target.value)} required /></Field>
    <button id="accounting-period-close-request-submit" name="intent" value="request-close" data-bp="accounting-period-close-request-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Checking controls…" : "Request period close"}</button></form>;
}

export function AccountingPeriodCloseDecisionForm({ action, periodReference, workItem }: { action: StateAction; periodReference: string; workItem: WorkQueueItem }) {
  const [state, submit, pending] = useActionState(action, idle);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [comment, setComment] = useState("");
  return <form action={submit} data-bp="accounting-period-close-decision-form"><Feedback state={state} id="accounting-period-close-decision-status" /><input name="periodReference" type="hidden" value={periodReference} /><input name="workItemReference" type="hidden" value={workItem.reference} /><input name="expectedVersion" type="hidden" value={workItem.version} />
    <div className="form-grid two"><Field id="accounting-period-close-decision" label="Decision" required><select id="accounting-period-close-decision" name="decision" data-bp="accounting-period-close-decision" value={decision} onChange={(event) => setDecision(event.target.value as "APPROVE" | "REJECT")}><option value="APPROVE">Approve close</option><option value="REJECT">Reject close</option></select></Field><Field id="accounting-period-close-decision-comment" label="Decision evidence" required><textarea id="accounting-period-close-decision-comment" name="comment" data-bp="accounting-period-close-decision-comment" rows={3} minLength={10} value={comment} onChange={(event) => setComment(event.target.value)} required /></Field></div>
    <button id="accounting-period-close-decision-submit" name="intent" value="decide-close" data-bp="accounting-period-close-decision-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Applying…" : "Apply close decision"}</button></form>;
}
