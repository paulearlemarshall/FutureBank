"use client";

import { useActionState, useState } from "react";
import type { ActionState, GeneralLedgerAccountView, WorkQueueItem } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };

function Feedback({ state, id }: { state: ActionState; id: string }) {
  return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />;
}

export function ManualGeneralLedgerJournalForm({ action, accounts, valueDate, idempotencyKey }: {
  action: StateAction; accounts: GeneralLedgerAccountView[]; valueDate: string; idempotencyKey: string;
}) {
  const [state, submit, pending] = useActionState(action, idle);
  const postingAccounts = accounts.filter((account) => account.active && account.postingAllowed);
  const currencies = [...new Set(postingAccounts.map((account) => account.currency))];
  const [currency, setCurrency] = useState(currencies[0] ?? "GBP");
  const currencyAccounts = postingAccounts.filter((account) => account.currency === currency);
  const [debitCode, setDebitCode] = useState("");
  const [creditCode, setCreditCode] = useState("");
  const validDebit = currencyAccounts.some((account) => account.code === debitCode) ? debitCode : (currencyAccounts[0]?.code ?? "");
  const validCredit = currencyAccounts.some((account) => account.code === creditCode && account.code !== validDebit)
    ? creditCode : (currencyAccounts.find((account) => account.code !== validDebit)?.code ?? "");
  return <form action={submit} data-bp="general-ledger-journal-form"><Feedback state={state} id="general-ledger-journal-status" />
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    <div className="form-grid two">
      <Field id="general-ledger-value-date" label="Value date" required><input id="general-ledger-value-date" name="valueDate" data-bp="general-ledger-value-date" type="date" defaultValue={valueDate} required /></Field>
      <Field id="general-ledger-currency" label="Currency" required><select id="general-ledger-currency" name="currency" data-bp="general-ledger-currency" value={currency} onChange={(event) => { setCurrency(event.target.value); setDebitCode(""); setCreditCode(""); }}>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
      <Field id="general-ledger-debit-account" label="Debit account" required><select id="general-ledger-debit-account" name="debitAccountCode" data-bp="general-ledger-debit-account" value={validDebit} onChange={(event) => setDebitCode(event.target.value)}>{currencyAccounts.map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></Field>
      <Field id="general-ledger-credit-account" label="Credit account" required><select id="general-ledger-credit-account" name="creditAccountCode" data-bp="general-ledger-credit-account" value={validCredit} onChange={(event) => setCreditCode(event.target.value)}>{currencyAccounts.filter((account) => account.code !== validDebit).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></Field>
      <Field id="general-ledger-amount" label="Amount" required><input id="general-ledger-amount" name="amount" data-bp="general-ledger-amount" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" placeholder="0.00" required /></Field>
      <Field id="general-ledger-description" label="Description" required><input id="general-ledger-description" name="description" data-bp="general-ledger-description" minLength={5} maxLength={200} required /></Field>
      <Field id="general-ledger-submission-comment" label="Submission evidence" required><textarea id="general-ledger-submission-comment" name="comment" data-bp="general-ledger-submission-comment" rows={3} minLength={10} maxLength={500} required /></Field>
    </div>
    <button id="general-ledger-journal-submit" name="intent" value="submit-journal" data-bp="general-ledger-journal-submit" className="primary-button" type="submit" disabled={pending || currencyAccounts.length < 2}>{pending ? "Submitting…" : "Submit manual journal"}</button>
  </form>;
}

export function GeneralLedgerJournalDecisionForm({ action, journalReference, workItem }: {
  action: StateAction; journalReference: string; workItem: WorkQueueItem;
}) {
  const [state, submit, pending] = useActionState(action, idle);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  return <form action={submit} data-bp="general-ledger-journal-decision-form"><Feedback state={state} id="general-ledger-journal-decision-status" />
    <input name="journalReference" type="hidden" value={journalReference} /><input name="workItemReference" type="hidden" value={workItem.reference} /><input name="expectedVersion" type="hidden" value={workItem.version} />
    <div className="form-grid two"><Field id="general-ledger-journal-decision" label="Decision" required><select id="general-ledger-journal-decision" name="decision" data-bp="general-ledger-journal-decision" value={decision} onChange={(event) => setDecision(event.target.value as "APPROVE" | "REJECT")}><option value="APPROVE">Approve and post</option><option value="REJECT">Reject without posting</option></select></Field>
      <Field id="general-ledger-journal-decision-comment" label="Decision evidence" required><textarea id="general-ledger-journal-decision-comment" name="comment" data-bp="general-ledger-journal-decision-comment" rows={3} minLength={10} maxLength={500} required /></Field></div>
    <button id="general-ledger-journal-decision-submit" name="intent" value="decide-journal" data-bp="general-ledger-journal-decision-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Applying…" : "Apply journal decision"}</button>
  </form>;
}
