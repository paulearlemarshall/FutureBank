"use client";

import { useActionState } from "react";
import type { AccountListItem, ActionState, BeneficiaryView, DirectDebitMandateView } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };
function Feedback({ state, id }: { state: ActionState; id: string }) { return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />; }

export function DirectDebitMandateForm({ action, accounts, beneficiaries, today }: { action: StateAction; accounts: AccountListItem[]; beneficiaries: BeneficiaryView[]; today: string }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return <form action={formAction} data-bp="direct-debit-mandate-form"><Feedback state={state} id="direct-debit-mandate-status" /><div className="form-grid two">
    <Field id="direct-debit-source" label="Debit account" required><select id="direct-debit-source" name="sourceAccountNumber" data-bp="direct-debit-source" defaultValue="" required><option value="" disabled>Select account</option>{accounts.filter((item) => item.status === "ACTIVE" && !item.readOnly).map((item) => <option key={item.accountNumber} value={item.accountNumber}>{item.accountNumber} · {item.customerName} · {item.currency}</option>)}</select></Field>
    <Field id="direct-debit-creditor" label="Creditor beneficiary" required><select id="direct-debit-creditor" name="creditorBeneficiaryId" data-bp="direct-debit-creditor" defaultValue="" required><option value="" disabled>Select creditor</option>{beneficiaries.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.customerNumber} · {item.currency}</option>)}</select></Field>
    <Field id="direct-debit-creditor-reference" label="Creditor mandate reference" required><input id="direct-debit-creditor-reference" name="creditorMandateReference" data-bp="direct-debit-creditor-reference" maxLength={80} required /></Field>
    <Field id="direct-debit-maximum" label="Maximum single amount" required><input id="direct-debit-maximum" name="maximumSingleAmount" data-bp="direct-debit-maximum" inputMode="decimal" required /></Field>
    <Field id="direct-debit-valid-from" label="Valid from" required><input id="direct-debit-valid-from" name="validFrom" data-bp="direct-debit-valid-from" type="date" min={today} defaultValue={today} required /></Field>
    <Field id="direct-debit-valid-to" label="Valid to"><input id="direct-debit-valid-to" name="validTo" data-bp="direct-debit-valid-to" type="date" min={today} /></Field>
  </div><div className="form-actions"><button id="direct-debit-mandate-submit" name="intent" value="create-mandate" data-bp="direct-debit-mandate-submit" className="primary-button" disabled={pending}>{pending ? "Creating…" : "Create mandate"}</button></div></form>;
}

export function DirectDebitCollectionForm({ action, mandates, today, idempotencyKey }: { action: StateAction; mandates: DirectDebitMandateView[]; today: string; idempotencyKey: string }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return <form action={formAction} data-bp="direct-debit-collection-form"><Feedback state={state} id="direct-debit-collection-status" /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><div className="form-grid two">
    <Field id="direct-debit-collection-mandate" label="Active mandate" required><select id="direct-debit-collection-mandate" name="mandateReference" data-bp="direct-debit-collection-mandate" defaultValue="" required><option value="" disabled>Select mandate</option>{mandates.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.reference} value={item.reference}>{item.reference} · {item.creditorName} · max {item.currency} {item.maximumSingleAmount}</option>)}</select></Field>
    <Field id="direct-debit-collection-amount" label="Collection amount" required><input id="direct-debit-collection-amount" name="amount" data-bp="direct-debit-collection-amount" inputMode="decimal" required /></Field>
    <Field id="direct-debit-collection-date" label="Collection date" required><input id="direct-debit-collection-date" name="collectionDate" data-bp="direct-debit-collection-date" type="date" max={today} defaultValue={today} required /></Field>
  </div><div className="form-actions"><button id="direct-debit-collection-submit" name="intent" value="submit-collection" data-bp="direct-debit-collection-submit" className="primary-button" disabled={pending}>{pending ? "Processing…" : "Submit collection"}</button></div></form>;
}

export function DirectDebitCancellationForm({ action, reference, version }: { action: StateAction; reference: string; version: number }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return <form action={formAction} data-bp="direct-debit-cancel-form"><Feedback state={state} id="direct-debit-cancel-status" /><input type="hidden" name="reference" value={reference} /><input type="hidden" name="expectedVersion" value={version} /><Field id="direct-debit-cancel-reason" label="Cancellation reason" required><input id="direct-debit-cancel-reason" name="reason" data-bp="direct-debit-cancel-reason" minLength={5} maxLength={300} required /></Field><div className="form-actions"><button id="direct-debit-cancel-submit" name="intent" value="cancel-mandate" data-bp="direct-debit-cancel-submit" className="primary-button danger" disabled={pending}>{pending ? "Cancelling…" : "Cancel mandate"}</button></div></form>;
}
