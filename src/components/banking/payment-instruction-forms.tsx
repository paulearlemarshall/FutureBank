"use client";

import { useActionState } from "react";
import type { AccountListItem, ActionState, BeneficiaryView } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };

function Feedback({ state, id }: { state: ActionState; id: string }) {
  if (!state.message) return <div id={id} data-bp={`status-${id}`} aria-live="polite" />;
  return <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion>;
}

export function PaymentInstructionForm({
  action,
  accounts,
  beneficiaries,
  today,
}: {
  action: StateAction;
  accounts: AccountListItem[];
  beneficiaries: BeneficiaryView[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const availableAccounts = accounts.filter((item) => !item.readOnly && item.status === "ACTIVE");
  return (
    <form action={formAction} data-bp="payment-instruction-create-form">
      <Feedback state={state} id="payment-instruction-create-status" />
      <div className="form-grid two">
        <Field id="payment-instruction-type" label="Instruction" required>
          <select id="payment-instruction-type" name="type" data-bp="payment-instruction-type" defaultValue="SCHEDULED" required>
            <option value="SCHEDULED">Future-dated payment</option>
            <option value="STANDING_ORDER">Standing order</option>
          </select>
        </Field>
        <Field id="payment-instruction-payment-type" label="Payment type" required>
          <select id="payment-instruction-payment-type" name="paymentType" data-bp="payment-instruction-payment-type" defaultValue="INTERNAL" required>
            <option value="INTERNAL">FutureBank internal transfer</option>
            <option value="EXTERNAL">External payment (simulated)</option>
          </select>
        </Field>
        <Field id="payment-instruction-source" label="Debit account" required>
          <select id="payment-instruction-source" name="sourceAccountNumber" data-bp="payment-instruction-source" defaultValue="" required>
            <option value="" disabled>Select account</option>
            {availableAccounts.map((item) => <option value={item.accountNumber} key={item.accountNumber}>{item.accountNumber} · {item.customerName} · {item.currency} {item.availableBalance}</option>)}
          </select>
        </Field>
        <Field id="payment-instruction-destination" label="Internal destination account">
          <select id="payment-instruction-destination" name="destinationAccountNumber" data-bp="payment-instruction-destination" defaultValue="">
            <option value="">Not applicable</option>
            {availableAccounts.map((item) => <option value={item.accountNumber} key={item.accountNumber}>{item.accountNumber} · {item.customerName} · {item.currency}</option>)}
          </select>
        </Field>
        <Field id="payment-instruction-beneficiary" label="External beneficiary">
          <select id="payment-instruction-beneficiary" name="beneficiaryId" data-bp="payment-instruction-beneficiary" defaultValue="">
            <option value="">Not applicable</option>
            {beneficiaries.filter((item) => item.status === "ACTIVE").map((item) => <option value={item.id} key={item.id}>{item.name} · {item.currency} · {item.accountNumber}</option>)}
          </select>
        </Field>
        <Field id="payment-instruction-amount" label="Amount" required>
          <input id="payment-instruction-amount" name="amount" data-bp="payment-instruction-amount" inputMode="decimal" placeholder="0.00" required />
        </Field>
        <Field id="payment-instruction-frequency" label="Frequency" required hint="Use once for a future-dated payment; weekly or monthly for a standing order.">
          <select id="payment-instruction-frequency" name="frequency" data-bp="payment-instruction-frequency" defaultValue="ONCE" required>
            <option value="ONCE">Once</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
          </select>
        </Field>
        <Field id="payment-instruction-start-date" label="First execution date" required>
          <input id="payment-instruction-start-date" name="startDate" data-bp="payment-instruction-start-date" type="date" min={today} defaultValue={today} required />
        </Field>
        <Field id="payment-instruction-end-date" label="End date" hint="Optional for standing orders.">
          <input id="payment-instruction-end-date" name="endDate" data-bp="payment-instruction-end-date" type="date" min={today} />
        </Field>
        <Field id="payment-instruction-description" label="Payment reference" required>
          <input id="payment-instruction-description" name="description" data-bp="payment-instruction-description" maxLength={140} required />
        </Field>
      </div>
      <div className="form-actions"><button id="payment-instruction-create" name="intent" value="create-payment-instruction" data-bp="payment-instruction-create" className="primary-button" type="submit" disabled={pending}>{pending ? "Creating…" : "Create instruction"}</button></div>
    </form>
  );
}

export function PaymentInstructionCancellationForm({ action, reference, version }: { action: StateAction; reference: string; version: number }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="payment-instruction-cancel-form">
      <Feedback state={state} id="payment-instruction-cancel-status" />
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Field id="payment-instruction-cancellation-reason" label="Cancellation reason" required>
        <input id="payment-instruction-cancellation-reason" name="reason" data-bp="payment-instruction-cancellation-reason" minLength={5} maxLength={300} required />
      </Field>
      <div className="form-actions"><button id="payment-instruction-cancel" name="intent" value="cancel-payment-instruction" data-bp="payment-instruction-cancel" className="primary-button danger" type="submit" disabled={pending}>{pending ? "Cancelling…" : "Cancel instruction"}</button></div>
    </form>
  );
}

export function PaymentInstructionRunForm({ action, businessDate }: { action: StateAction; businessDate: string }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="payment-instruction-run-form">
      <Feedback state={state} id="payment-instruction-run-status" />
      <div className="form-grid two">
        <Field id="payment-instruction-business-date" label="Business date" required><input id="payment-instruction-business-date" name="businessDate" data-bp="payment-instruction-business-date" type="date" defaultValue={businessDate} required /></Field>
      </div>
      <div className="form-actions"><button id="payment-instruction-run" name="intent" value="run-payment-instructions" data-bp="payment-instruction-run" className="primary-button" type="submit" disabled={pending}>{pending ? "Processing…" : "Run due instructions"}</button></div>
    </form>
  );
}
