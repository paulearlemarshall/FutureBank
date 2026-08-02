"use client";

import { useActionState, useState } from "react";
import type { AccountListItem, ActionState, CustomerListItem, ProductView, WorkQueueItem } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
const idle: ActionState = { ok: false, code: "IDLE", message: "" };

function Feedback({ state, id }: { state: ActionState; id: string }) {
  return state.message ? <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion> : <div id={id} data-bp={`status-${id}`} aria-live="polite" />;
}

export function LoanApplicationForm({ action, customers, products, accounts, firstPaymentDate, idempotencyKey }: {
  action: StateAction; customers: CustomerListItem[]; products: ProductView[]; accounts: AccountListItem[]; firstPaymentDate: string; idempotencyKey: string;
}) {
  const [state, submit, pending] = useActionState(action, idle);
  const loanProducts = products.filter((product) => product.active && product.kind === "LOAN");
  const [customerNumber, setCustomerNumber] = useState("");
  const [productCode, setProductCode] = useState(loanProducts[0]?.code ?? "");
  const currency = loanProducts.find((product) => product.code === productCode)?.currency;
  const destinations = accounts.filter((account) => account.customerNumber === customerNumber && account.status === "ACTIVE" && !account.readOnly && account.currency === currency && account.kind !== "TERM_DEPOSIT");
  return <form action={submit} data-bp="loan-application-form"><Feedback state={state} id="loan-application-status" />
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    <div className="form-grid two">
      <Field id="loan-customer-number" label="Customer" required><select id="loan-customer-number" name="customerNumber" data-bp="loan-customer-number" value={customerNumber} onChange={(event) => setCustomerNumber(event.target.value)} required><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer.customerNumber} value={customer.customerNumber}>{customer.customerNumber} · {customer.displayName}</option>)}</select></Field>
      <Field id="loan-product-code" label="Loan product" required><select id="loan-product-code" name="productCode" data-bp="loan-product-code" value={productCode} onChange={(event) => setProductCode(event.target.value)} required>{loanProducts.map((product) => <option key={product.code} value={product.code}>{product.code} · {product.name} · {product.interestRate}%</option>)}</select></Field>
      <Field id="loan-destination-account" label="Disbursement account" hint="Must be the customer's own active deposit account in the loan currency." required><select id="loan-destination-account" name="destinationAccountNumber" data-bp="loan-destination-account" defaultValue="" key={`${customerNumber}-${productCode}`} required><option value="" disabled>{destinations.length ? "Select destination" : "No eligible destination"}</option>{destinations.map((account) => <option key={account.accountNumber} value={account.accountNumber}>{account.accountNumber} · {account.productName} · {account.currency}</option>)}</select></Field>
      <Field id="loan-principal" label="Principal" required><input id="loan-principal" name="principal" data-bp="loan-principal" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" placeholder="0.00" required /></Field>
      <Field id="loan-term-months" label="Term (months)" required><input id="loan-term-months" name="termMonths" data-bp="loan-term-months" type="number" min={6} max={60} step={1} defaultValue={24} required /></Field>
      <Field id="loan-first-payment-date" label="First payment date" required><input id="loan-first-payment-date" name="firstPaymentDate" data-bp="loan-first-payment-date" type="date" defaultValue={firstPaymentDate} required /></Field>
      <Field id="loan-monthly-income" label="Monthly income / turnover" required><input id="loan-monthly-income" name="monthlyIncome" data-bp="loan-monthly-income" inputMode="decimal" required /></Field>
      <Field id="loan-monthly-commitments" label="Existing monthly commitments" required><input id="loan-monthly-commitments" name="monthlyCommitments" data-bp="loan-monthly-commitments" inputMode="decimal" required /></Field>
      <Field id="loan-risk-grade" label="Risk grade" required><select id="loan-risk-grade" name="riskGrade" data-bp="loan-risk-grade" defaultValue="B"><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></Field>
      <Field id="loan-purpose" label="Purpose" required><textarea id="loan-purpose" name="purpose" data-bp="loan-purpose" minLength={10} maxLength={500} rows={3} required /></Field>
    </div>
    <button id="loan-application-submit" name="intent" value="submit-loan" data-bp="loan-application-submit" className="primary-button" type="submit" disabled={pending || !destinations.length}>{pending ? "Submitting…" : "Submit loan application"}</button>
  </form>;
}

export function LoanApplicationDecisionForm({ action, applicationReference, workItem }: { action: StateAction; applicationReference: string; workItem: WorkQueueItem }) {
  const [state, submit, pending] = useActionState(action, idle);
  return <form action={submit} data-bp="loan-decision-form"><Feedback state={state} id="loan-decision-status" />
    <input name="applicationReference" type="hidden" value={applicationReference} /><input name="workItemReference" type="hidden" value={workItem.reference} /><input name="expectedVersion" type="hidden" value={workItem.version} />
    <div className="form-grid two"><Field id="loan-decision" label="Decision" required><select id="loan-decision" name="decision" data-bp="loan-decision" defaultValue="APPROVE"><option value="APPROVE">Approve, book, and disburse</option><option value="REJECT">Reject without movement</option></select></Field>
      <Field id="loan-decision-comment" label="Decision evidence" required><textarea id="loan-decision-comment" name="comment" data-bp="loan-decision-comment" minLength={10} maxLength={500} rows={3} required /></Field></div>
    <button id="loan-decision-submit" name="intent" value="decide-loan" data-bp="loan-decision-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Applying…" : "Apply loan decision"}</button>
  </form>;
}
