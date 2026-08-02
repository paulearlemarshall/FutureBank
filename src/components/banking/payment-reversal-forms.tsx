"use client";

import { useActionState } from "react";
import type { ActionState, WorkQueueItem } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };
function Feedback({ state, id }: { state: ActionState; id: string }) { return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />; }

export function PaymentReversalRequestForm({ action, paymentReference, idempotencyKey }: { action: StateAction; paymentReference: string; idempotencyKey: string }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="payment-reversal-request-form"><Feedback state={state} id="payment-reversal-request-status" />
    <input id="payment-reversal-payment-reference" name="paymentReference" data-bp="payment-reversal-payment-reference" type="hidden" value={paymentReference} />
    <input id="payment-reversal-idempotency-key" name="idempotencyKey" data-bp="payment-reversal-idempotency-key" type="hidden" value={idempotencyKey} />
    <Field id="payment-reversal-reason" label="Reversal reason" required><textarea id="payment-reversal-reason" name="reason" data-bp="payment-reversal-reason" rows={3} minLength={10} required /></Field>
    <button id="payment-reversal-request-submit" name="intent" value="request-reversal" data-bp="payment-reversal-request-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Requesting…" : "Request reversal"}</button>
  </form>;
}

export function PaymentReversalDecisionForm({ action, reversalReference, workItem }: { action: StateAction; reversalReference: string; workItem: WorkQueueItem }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="payment-reversal-decision-form"><Feedback state={state} id="payment-reversal-decision-status" />
    <input name="reversalReference" type="hidden" value={reversalReference} /><input name="workItemReference" type="hidden" value={workItem.reference} /><input name="expectedVersion" type="hidden" value={workItem.version} />
    <div className="form-grid two"><Field id="payment-reversal-decision" label="Decision" required><select id="payment-reversal-decision" name="decision" data-bp="payment-reversal-decision" defaultValue="APPROVE"><option value="APPROVE">Approve and post</option><option value="REJECT">Reject</option></select></Field>
      <Field id="payment-reversal-decision-comment" label="Decision comment" required><textarea id="payment-reversal-decision-comment" name="comment" data-bp="payment-reversal-decision-comment" rows={3} minLength={5} required /></Field></div>
    <button id="payment-reversal-decision-submit" name="intent" value="decide-reversal" data-bp="payment-reversal-decision-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Applying…" : "Apply decision"}</button>
  </form>;
}
