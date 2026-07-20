"use client";

import { useActionState } from "react";
import type { ActionState, AccountListItem, WorkQueueItem } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };

function Feedback({ state, id }: { state: ActionState; id: string }) {
  return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />;
}

export function WorkItemAssignmentForm({ claimAction, releaseAction, item, isAssignedToCurrentUser }: { claimAction: StateAction; releaseAction: StateAction; item: WorkQueueItem; isAssignedToCurrentUser: boolean }) {
  const [claimState, claim, claiming] = useActionState(claimAction, idle);
  const [releaseState, release, releasing] = useActionState(releaseAction, idle);
  const action = isAssignedToCurrentUser ? release : claim;
  return <form action={action} data-bp="work-item-assignment-form">
    <Feedback state={isAssignedToCurrentUser ? releaseState : claimState} id="work-item-assignment-status" />
    <input id="work-item-reference" name="workItemReference" data-bp="work-item-reference" type="hidden" value={item.reference} />
    <input id="work-item-version" name="expectedVersion" data-bp="work-item-version" type="hidden" value={item.version} />
    <button id="work-item-assignment-submit" name="intent" value={isAssignedToCurrentUser ? "release" : "claim"} data-bp="work-item-assignment-submit" className="secondary-button" type="submit" disabled={claiming || releasing}>{isAssignedToCurrentUser ? "Release work item" : "Claim work item"}</button>
  </form>;
}

export function KycDecisionForm({ action, caseReference, workItem }: { action: StateAction; caseReference: string; workItem: WorkQueueItem }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="kyc-decision-form">
    <Feedback state={state} id="kyc-decision-status" />
    <input id="kyc-decision-entity" name="entityReference" data-bp="kyc-decision-entity" type="hidden" value={caseReference} />
    <input id="kyc-decision-work-item" name="workItemReference" data-bp="kyc-decision-work-item" type="hidden" value={workItem.reference} />
    <input id="kyc-decision-version" name="expectedVersion" data-bp="kyc-decision-version" type="hidden" value={workItem.version} />
    <div className="form-grid two">
      <Field id="kyc-decision" label="Decision" required><select id="kyc-decision" name="decision" data-bp="kyc-decision" defaultValue="APPROVE" required><option value="APPROVE">Approve</option><option value="REJECT">Reject</option></select></Field>
      <Field id="kyc-final-risk-rating" label="Final risk rating"><select id="kyc-final-risk-rating" name="finalRiskRating" data-bp="kyc-final-risk-rating" defaultValue=""><option value="">Use calculated rating</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
      <Field id="kyc-override-reason" label="Override reason" hint="Mandatory when the final rating differs from the calculated rating."><input id="kyc-override-reason" name="overrideReason" data-bp="kyc-override-reason" /></Field>
      <Field id="kyc-decision-comment" label="Decision comment" required><textarea id="kyc-decision-comment" name="comment" data-bp="kyc-decision-comment" required rows={3} /></Field>
    </div>
    <button id="kyc-decision-submit" name="intent" value="decide-kyc" data-bp="kyc-decision-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Applying decision…" : "Apply KYC decision"}</button>
  </form>;
}

export function SimpleKycActionForm({ action, bp, label, intent }: { action: StateAction; bp: string; label: string; intent: string }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp={`${bp}-form`}><Feedback state={state} id={`${bp}-status`} /><button id={`${bp}-submit`} name="intent" value={intent} data-bp={`${bp}-submit`} className="primary-button" type="submit" disabled={pending}>{pending ? "Working…" : label}</button></form>;
}

export function EvidenceVerificationForm({ action, evidenceReferences }: { action: StateAction; evidenceReferences: string[] }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="evidence-verification-form"><Feedback state={state} id="evidence-verification-status" /><div className="form-grid two">
    <Field id="evidence-reference" label="Evidence" required><select id="evidence-reference" name="evidenceReference" data-bp="evidence-reference" defaultValue="" required><option value="" disabled>Select evidence</option>{evidenceReferences.map((reference) => <option key={reference}>{reference}</option>)}</select></Field>
    <Field id="evidence-outcome" label="Outcome" required><select id="evidence-outcome" name="outcome" data-bp="evidence-outcome" defaultValue="VERIFIED"><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option></select></Field>
    <Field id="evidence-reviewer-notes" label="Reviewer notes" required><input id="evidence-reviewer-notes" name="reviewerNotes" data-bp="evidence-reviewer-notes" required /></Field>
  </div><button id="evidence-verification-submit" name="intent" value="verify-evidence" data-bp="evidence-verification-submit" className="primary-button" type="submit" disabled={pending}>Verify evidence</button></form>;
}

export function PaymentDecisionForm({ approveAction, rejectAction, paymentReference, workItem }: { approveAction: StateAction; rejectAction: StateAction; paymentReference: string; workItem: WorkQueueItem }) {
  const [approveState, approve, approving] = useActionState(approveAction, idle);
  const [rejectState, reject, rejecting] = useActionState(rejectAction, idle);
  return <div data-bp="payment-decision-controls"><Feedback state={approveState.message ? approveState : rejectState} id="payment-decision-status" /><div className="equal-columns">
    {[{ action: approve, intent: "approve-payment", label: "Approve and book", bp: "payment-approve-submit" }, { action: reject, intent: "reject-payment", label: "Reject and release hold", bp: "payment-reject-submit" }].map((button) => <form action={button.action} data-bp={`${button.bp}-form`} key={button.intent}>
      <input name="paymentReference" type="hidden" value={paymentReference} /><input name="workItemReference" type="hidden" value={workItem.reference} /><input name="expectedVersion" type="hidden" value={workItem.version} />
      <Field id={`${button.bp}-comment`} label="Decision comment" required><textarea id={`${button.bp}-comment`} name="comment" data-bp={`${button.bp}-comment`} rows={3} required /></Field>
      <button id={button.bp} name="intent" value={button.intent} data-bp={button.bp} className={button.intent.startsWith("approve") ? "primary-button" : "secondary-button"} type="submit" disabled={approving || rejecting}>{button.label}</button>
    </form>)}
  </div></div>;
}

export function OverdraftApplicationForm({ action, accounts }: { action: StateAction; accounts: AccountListItem[] }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="overdraft-application-form"><Feedback state={state} id="overdraft-application-status" /><div className="form-grid two">
    <Field id="overdraft-account-number" label="Current account" required><select id="overdraft-account-number" name="accountNumber" data-bp="overdraft-account-number" defaultValue="" required><option value="" disabled>Select account</option>{accounts.filter((item) => item.kind === "CURRENT" && item.status === "ACTIVE").map((item) => <option value={item.accountNumber} key={item.accountNumber}>{item.accountNumber} · {item.customerName} · {item.currency}</option>)}</select></Field>
    <Field id="overdraft-requested-limit" label="Requested limit" required><input id="overdraft-requested-limit" name="requestedLimit" data-bp="overdraft-requested-limit" inputMode="decimal" required /></Field>
    <Field id="overdraft-interest-rate" label="Annual interest rate (%)" required><input id="overdraft-interest-rate" name="annualInterestRate" data-bp="overdraft-interest-rate" inputMode="decimal" defaultValue="12.5000" required /></Field>
    <Field id="overdraft-risk-grade" label="Risk grade" required><input id="overdraft-risk-grade" name="riskGrade" data-bp="overdraft-risk-grade" defaultValue="B" required /></Field>
    <Field id="overdraft-monthly-income" label="Monthly income / turnover" required><input id="overdraft-monthly-income" name="monthlyIncomeOrTurnover" data-bp="overdraft-monthly-income" inputMode="decimal" required /></Field>
    <Field id="overdraft-monthly-outgoings" label="Monthly committed outgoings" required><input id="overdraft-monthly-outgoings" name="monthlyCommittedOutgoings" data-bp="overdraft-monthly-outgoings" inputMode="decimal" required /></Field>
    <Field id="overdraft-purpose" label="Purpose" required><textarea id="overdraft-purpose" name="purpose" data-bp="overdraft-purpose" rows={3} required /></Field>
  </div><button id="overdraft-application-submit" name="intent" value="submit-overdraft" data-bp="overdraft-application-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit overdraft application"}</button></form>;
}

export function OverdraftDecisionForm({ action, facilityReference, workItem }: { action: StateAction; facilityReference: string; workItem: WorkQueueItem }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="overdraft-decision-form"><Feedback state={state} id="overdraft-decision-status" />
    <input name="entityReference" type="hidden" value={facilityReference} /><input name="workItemReference" type="hidden" value={workItem.reference} /><input name="expectedVersion" type="hidden" value={workItem.version} />
    <div className="form-grid two"><Field id="overdraft-decision" label="Decision" required><select id="overdraft-decision" name="decision" data-bp="overdraft-decision" defaultValue="APPROVE"><option value="APPROVE">Approve</option><option value="DECLINE">Decline</option></select></Field><Field id="overdraft-decision-comment" label="Decision comment" required><textarea id="overdraft-decision-comment" name="comment" data-bp="overdraft-decision-comment" rows={3} required /></Field></div>
    <button id="overdraft-decision-submit" name="intent" value="decide-overdraft" data-bp="overdraft-decision-submit" className="primary-button" type="submit" disabled={pending}>Apply facility decision</button>
  </form>;
}

export function OverdraftChangeForm({ action, currentLimit }: { action: StateAction; currentLimit: string }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="overdraft-limit-change-form"><Feedback state={state} id="overdraft-limit-change-status" /><div className="form-grid two"><Field id="overdraft-new-limit" label="Requested limit" required><input id="overdraft-new-limit" name="requestedLimit" data-bp="overdraft-new-limit" defaultValue={currentLimit} required /></Field><Field id="overdraft-limit-change-reason" label="Reason" required><input id="overdraft-limit-change-reason" name="reason" data-bp="overdraft-limit-change-reason" required /></Field></div><button id="overdraft-limit-change-submit" name="intent" value="change-limit" data-bp="overdraft-limit-change-submit" className="secondary-button" type="submit" disabled={pending}>Submit limit change</button></form>;
}

export function OverdraftStatusForm({ action }: { action: StateAction }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="overdraft-status-form"><Feedback state={state} id="overdraft-status-result" /><div className="form-grid two"><Field id="overdraft-status-action" label="Facility action" required><select id="overdraft-status-action" name="action" data-bp="overdraft-status-action" defaultValue="SUSPEND"><option value="SUSPEND">Suspend further drawing</option><option value="CLOSE">Close facility</option></select></Field><Field id="overdraft-status-reason" label="Reason" required><input id="overdraft-status-reason" name="reason" data-bp="overdraft-status-reason" required /></Field></div><button id="overdraft-status-submit" name="intent" value="update-facility" data-bp="overdraft-status-submit" className="secondary-button" type="submit" disabled={pending}>Update facility</button></form>;
}

export function AlertResolutionForm({ action, alertReference }: { action: StateAction; alertReference: string }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp={`overdraft-alert-resolution-${alertReference}`}><Feedback state={state} id={`overdraft-alert-${alertReference}-status`} /><div className="form-grid two"><Field id={`overdraft-alert-${alertReference}-intervention`} label="Intervention" required><select id={`overdraft-alert-${alertReference}-intervention`} name="intervention" data-bp={`overdraft-alert-${alertReference}-intervention`} defaultValue="CUSTOMER_CONTACTED"><option value="CONTACT_ATTEMPTED">Contact attempted</option><option value="CUSTOMER_CONTACTED">Customer contacted</option><option value="REPAYMENT_DISCUSSION">Repayment discussion</option><option value="LIMIT_REVIEW">Limit review</option><option value="SUSPENSION">Suspension</option><option value="NO_ACTION">No action (reason required)</option></select></Field><Field id={`overdraft-alert-${alertReference}-comment`} label="Outcome / reason" required><input id={`overdraft-alert-${alertReference}-comment`} name="comment" data-bp={`overdraft-alert-${alertReference}-comment`} required /></Field></div><button id={`overdraft-alert-${alertReference}-submit`} name="intent" value="resolve-alert" data-bp={`overdraft-alert-${alertReference}-submit`} className="secondary-button" type="submit" disabled={pending}>Resolve alert</button></form>;
}
