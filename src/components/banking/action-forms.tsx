"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import type { ActionState, AccountListItem, BeneficiaryView, CustomerDetail, CustomerListItem, ProductView } from "@/modules/contracts";
import { Field, StatusRegion } from "./ui";

type StateAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const idle: ActionState = { ok: false, code: "IDLE", message: "" };

function ActionFeedback({ state, id }: { state: ActionState; id: string }) {
  if (!state.message) return <div id={id} data-bp={`status-${id}`} aria-live="polite" />;
  return <StatusRegion id={id} tone={state.ok ? "success" : "error"}>{state.message}</StatusRegion>;
}

function ErrorText({ state, name }: { state: ActionState; name: string }) {
  const message = state.fieldErrors?.[name]?.[0];
  return message ? <small id={`${name}-error`} className="field-error">{message}</small> : null;
}

export function LoginForm() {
  const [state, setState] = useState<ActionState>(idle);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!username || !password) {
      setState({
        ok: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid username or password.",
        fieldErrors: {
          username: username ? [] : ["Username is required"],
          password: password ? [] : ["Password is required"],
        },
      });
      return;
    }

    setPending(true);
    const { error } = await authClient.signIn.username({ username, password, rememberMe: false });
    if (error) {
      setState(error.status === 429
        ? { ok: false, code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again in 15 minutes." }
        : { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid username or password." });
      setPending(false);
      return;
    }

    setState({ ok: true, code: "SIGNED_IN", message: "Sign in successful." });
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} data-bp="login-form">
      <ActionFeedback state={state} id="login-status" />
      <Field id="login-username" label="Username" required>
        <input id="login-username" name="username" data-bp="login-username" autoComplete="username" required autoFocus aria-invalid={Boolean(state.fieldErrors?.username)} aria-describedby="login-username-error" />
        <ErrorText state={state} name="username" />
      </Field>
      <Field id="login-password" label="Password" required>
        <input id="login-password" name="password" data-bp="login-password" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.fieldErrors?.password)} aria-describedby="login-password-error" />
        <ErrorText state={state} name="password" />
      </Field>
      <button id="login-submit" name="intent" value="login" data-bp="login-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <div className="login-help"><span>Usernames and passwords are case sensitive</span><span>Environment: DEMO</span></div>
    </form>
  );
}

function CustomerFields({ customer, state }: { customer?: CustomerDetail; state: ActionState }) {
  return (
    <div className="form-grid">
      <Field id="customer-party-type" label="Customer type" required>
        <select id="customer-party-type" name="partyType" data-bp="customer-party-type" defaultValue={customer?.partyType ?? "RETAIL"} required>
          <option value="RETAIL">Retail</option><option value="SME">Business / SME</option>
        </select>
      </Field>
      {customer ? <Field id="customer-status" label="Customer status" required><select id="customer-status" name="status" data-bp="customer-status" defaultValue={customer.status} required><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="RESTRICTED">Restricted</option></select></Field> : null}
      <Field id="customer-title" label="Title"><select id="customer-title" name="title" data-bp="customer-title" defaultValue={customer?.title ?? ""}><option value="">Select</option><option>Mr</option><option>Ms</option><option>Mrs</option><option>Dr</option></select></Field>
      <Field id="customer-given-name" label="Given name"><input id="customer-given-name" name="givenName" data-bp="customer-given-name" dir="auto" defaultValue={customer?.givenName ?? ""} /><ErrorText state={state} name="givenName" /></Field>
      <Field id="customer-family-name" label="Family name"><input id="customer-family-name" name="familyName" data-bp="customer-family-name" dir="auto" defaultValue={customer?.familyName ?? ""} /><ErrorText state={state} name="familyName" /></Field>
      <Field id="customer-legal-name" label="Legal name"><input id="customer-legal-name" name="legalName" data-bp="customer-legal-name" dir="auto" defaultValue={customer?.legalName ?? ""} /><ErrorText state={state} name="legalName" /></Field>
      <Field id="customer-short-name" label="Short name" required><input id="customer-short-name" name="shortName" data-bp="customer-short-name" dir="auto" defaultValue={customer?.shortName ?? ""} required /><ErrorText state={state} name="shortName" /></Field>
      <Field id="customer-date-of-birth" label="Date of birth"><input id="customer-date-of-birth" name="dateOfBirth" data-bp="customer-date-of-birth" dir="ltr" type="date" defaultValue={customer?.dateOfBirth ?? ""} /></Field>
      <Field id="customer-registration-number" label="Registration number"><input id="customer-registration-number" name="registrationNumber" data-bp="customer-registration-number" dir="ltr" defaultValue={customer?.registrationNumber ?? ""} /></Field>
      <Field id="customer-nationality" label="Nationality" required><input id="customer-nationality" name="nationality" data-bp="customer-nationality" dir="ltr" defaultValue={customer?.nationality ?? "GB"} required /></Field>
      <Field id="customer-residence-country" label="Residence country" required><input id="customer-residence-country" name="residenceCountry" data-bp="customer-residence-country" dir="ltr" defaultValue={customer?.residenceCountry ?? "GB"} required /></Field>
      <Field id="customer-language" label="Language" required><input id="customer-language" name="language" data-bp="customer-language" dir="auto" defaultValue={customer?.language ?? "English"} required /></Field>
      <Field id="customer-industry" label="Industry" required><input id="customer-industry" name="industry" data-bp="customer-industry" dir="auto" defaultValue={customer?.industry ?? ""} required /></Field>
      <Field id="customer-sector" label="Sector" required><input id="customer-sector" name="sector" data-bp="customer-sector" dir="auto" defaultValue={customer?.sector ?? "Personal Banking"} required /></Field>
      <Field id="customer-risk-rating" label="Risk rating" required><select id="customer-risk-rating" name="riskRating" data-bp="customer-risk-rating" defaultValue={customer?.riskRating ?? "LOW"}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
      <Field id="customer-kyc-status" label="KYC status" required><select id="customer-kyc-status" name="kycStatus" data-bp="customer-kyc-status" defaultValue={customer?.kycStatus ?? "NOT_STARTED"}><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="AWAITING_INFORMATION">Awaiting information</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option><option value="DUE">Due</option><option value="REJECTED">Rejected</option><option value="EXPIRED">Expired</option></select></Field>
      <Field id="customer-kyc-review-date" label="Next KYC review" required><input id="customer-kyc-review-date" name="kycReviewDate" data-bp="customer-kyc-review-date" dir="ltr" type="date" defaultValue={customer?.kycReviewDate ?? "2027-07-19"} required /></Field>
      <Field id="customer-tax-id" label="Tax ID" required><input id="customer-tax-id" name="taxId" data-bp="customer-tax-id" dir="ltr" defaultValue={customer?.taxId ?? ""} required /></Field>
      <Field id="customer-branch-code" label="Branch" required><select id="customer-branch-code" name="branchCode" data-bp="customer-branch-code" defaultValue={customer?.branchCode ?? "LON001"} required><option value="LON001">LON001 · London City</option><option value="DXB001">DXB001 · Dubai Central</option></select></Field>
      <Field id="customer-relationship-manager" label="Relationship manager" required><input id="customer-relationship-manager" name="relationshipManager" data-bp="customer-relationship-manager" dir="auto" defaultValue={customer?.relationshipManager ?? "Sofia Bennett"} required /></Field>
      <Field id="customer-address-line1" label="Address line 1" required><input id="customer-address-line1" name="addressLine1" data-bp="customer-address-line1" dir="auto" defaultValue={customer?.addresses[0]?.line1 ?? ""} required /></Field>
      <Field id="customer-city" label="City" required><input id="customer-city" name="city" data-bp="customer-city" dir="auto" defaultValue={customer?.addresses[0]?.city ?? ""} required /></Field>
      <Field id="customer-postal-code" label="Postal code" required><input id="customer-postal-code" name="postalCode" data-bp="customer-postal-code" dir="ltr" defaultValue={customer?.addresses[0]?.postalCode ?? ""} required /></Field>
      <Field id="customer-address-country" label="Address country" required><input id="customer-address-country" name="country" data-bp="customer-address-country" dir="ltr" defaultValue={customer?.addresses[0]?.country ?? customer?.residenceCountry ?? "GB"} required /></Field>
      <Field id="customer-email" label="Email address" required><input id="customer-email" name="email" data-bp="customer-email" dir="ltr" type="email" defaultValue={customer?.contacts.find((item) => item.type === "EMAIL")?.value ?? ""} required /></Field>
      <Field id="customer-phone" label="Phone number" required><input id="customer-phone" name="phone" data-bp="customer-phone" dir="ltr" type="tel" defaultValue={customer?.contacts.find((item) => item.type === "MOBILE")?.value ?? ""} required /></Field>
      {!customer ? <>
        <Field id="customer-identity-type" label="Identity document type"><select id="customer-identity-type" name="identityDocumentType" data-bp="customer-identity-type" defaultValue=""><option value="">Record later in KYC</option><option value="PASSPORT">Passport</option><option value="EMIRATES_ID">Emirates ID</option><option value="NATIONAL_ID">National ID</option><option value="COMPANY_REGISTRATION">Company registration</option><option value="TRADE_LICENSE">Trade licence</option></select></Field>
        <Field id="customer-identity-number" label="Identity document number" hint="Use fictional data only."><input id="customer-identity-number" name="identityDocumentNumber" data-bp="customer-identity-number" dir="ltr" autoComplete="off" /><ErrorText state={state} name="identityDocumentNumber" /></Field>
        <Field id="customer-identity-country" label="Issuing country"><input id="customer-identity-country" name="identityIssuingCountry" data-bp="customer-identity-country" dir="ltr" maxLength={2} /></Field>
        <Field id="customer-identity-issued" label="Document issued"><input id="customer-identity-issued" name="identityIssuedAt" data-bp="customer-identity-issued" type="date" /></Field>
        <Field id="customer-identity-expires" label="Document expires"><input id="customer-identity-expires" name="identityExpiresAt" data-bp="customer-identity-expires" type="date" /></Field>
      </> : null}
    </div>
  );
}

export function CustomerForm({ action, customer }: { action: StateAction; customer?: CustomerDetail }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp={customer ? "customer-edit-form" : "customer-create-form"}>
      <ActionFeedback state={state} id="customer-form-status" />
      <CustomerFields customer={customer} state={state} />
      <div className="form-actions">
        <Link className="secondary-button" href={customer ? `/customers/${customer.customerNumber}` : "/customers"} data-bp="customer-cancel">Cancel</Link>
        <button id="customer-save" name="intent" value={customer ? "update" : "create"} data-bp="customer-save" className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save customer"}</button>
      </div>
    </form>
  );
}

export function OpenAccountForm({ action, customers, products }: { action: StateAction; customers: CustomerListItem[]; products: ProductView[] }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="account-open-form">
      <ActionFeedback state={state} id="account-open-status" />
      <div className="form-grid two">
        <Field id="account-customer-number" label="Customer" required><select id="account-customer-number" name="customerNumber" data-bp="account-customer-number" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map((item) => <option value={item.customerNumber} key={item.customerNumber}>{item.customerNumber} · {item.displayName}</option>)}</select><ErrorText state={state} name="customerNumber" /></Field>
        <Field id="account-product-code" label="Product" required><select id="account-product-code" name="productCode" data-bp="account-product-code" required defaultValue=""><option value="" disabled>Select product</option>{products.filter((item) => item.active && item.kind !== "LOAN").map((item) => <option value={item.code} key={item.code}>{item.code} · {item.name} ({item.currency})</option>)}</select><ErrorText state={state} name="productCode" /></Field>
        <Field id="account-branch-code" label="Branch" required><select id="account-branch-code" name="branchCode" data-bp="account-branch-code" defaultValue="LON001" required><option value="LON001">LON001 · London City</option><option value="DXB001">DXB001 · Dubai Central</option></select></Field>
        <Field id="account-nickname" label="Account nickname"><input id="account-nickname" name="nickname" data-bp="account-nickname" maxLength={40} /></Field>
        <Field id="account-opening-balance" label="Opening balance" required hint="Must meet the selected product minimum."><input id="account-opening-balance" name="initialDeposit" data-bp="account-opening-balance" inputMode="decimal" defaultValue="0.00" required /><ErrorText state={state} name="initialDeposit" /></Field>
      </div>
      <div className="form-actions"><Link href="/accounts" className="secondary-button" data-bp="account-open-cancel">Cancel</Link><button id="account-open-submit" name="intent" value="open-account" data-bp="account-open-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Opening…" : "Open account"}</button></div>
    </form>
  );
}

export function BeneficiaryForm({ action, customers }: { action: StateAction; customers: CustomerListItem[] }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="beneficiary-create-form">
      <ActionFeedback state={state} id="beneficiary-form-status" />
      <div className="form-grid two">
        <Field id="beneficiary-customer-number" label="Customer" required><select id="beneficiary-customer-number" name="customerNumber" data-bp="beneficiary-customer-number" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map((item) => <option value={item.customerNumber} key={item.customerNumber}>{item.customerNumber} · {item.displayName}</option>)}</select></Field>
        <Field id="beneficiary-name" label="Beneficiary name" required><input id="beneficiary-name" name="name" data-bp="beneficiary-name" required /></Field>
        <Field id="beneficiary-bank-name" label="Bank name" required><input id="beneficiary-bank-name" name="bankName" data-bp="beneficiary-bank-name" required /></Field>
        <Field id="beneficiary-account-number" label="Account number" required><input id="beneficiary-account-number" name="accountNumber" data-bp="beneficiary-account-number" required /></Field>
        <Field id="beneficiary-iban" label="IBAN"><input id="beneficiary-iban" name="iban" data-bp="beneficiary-iban" /></Field>
        <Field id="beneficiary-swift-bic" label="SWIFT / BIC"><input id="beneficiary-swift-bic" name="swiftBic" data-bp="beneficiary-swift-bic" /></Field>
        <Field id="beneficiary-currency" label="Currency" required><select id="beneficiary-currency" name="currency" data-bp="beneficiary-currency" defaultValue="GBP" required><option>GBP</option><option>AED</option><option>USD</option><option>EUR</option></select></Field>
      </div>
      <div className="form-actions"><button id="beneficiary-submit" name="intent" value="create-beneficiary" data-bp="beneficiary-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Add beneficiary"}</button></div>
    </form>
  );
}

export function PaymentForm({ action, accounts, beneficiaries, idempotencyKey }: { action: StateAction; accounts: AccountListItem[]; beneficiaries: BeneficiaryView[]; idempotencyKey: string }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="payment-form">
      <ActionFeedback state={state} id="payment-status" />
      <input type="hidden" id="payment-idempotency-key" name="idempotencyKey" data-bp="payment-idempotency-key" value={idempotencyKey} />
      <div className="form-grid two">
        <Field id="payment-type" label="Payment type" required><select id="payment-type" name="paymentType" data-bp="payment-type" defaultValue="INTERNAL" required><option value="INTERNAL">FutureBank internal transfer</option><option value="EXTERNAL">External payment (simulated)</option></select></Field>
        <Field id="payment-from-account" label="Debit account" required><select id="payment-from-account" name="sourceAccountNumber" data-bp="payment-from-account" defaultValue="" required><option value="" disabled>Select account</option>{accounts.filter((item) => !item.readOnly && item.status === "ACTIVE").map((item) => <option value={item.accountNumber} key={item.accountNumber}>{item.accountNumber} · {item.customerName} · {item.currency} {item.availableBalance}</option>)}</select></Field>
        <Field id="payment-to-account" label="Internal destination account"><select id="payment-to-account" name="destinationAccountNumber" data-bp="payment-to-account" defaultValue=""><option value="">Not applicable</option>{accounts.filter((item) => !item.readOnly && item.status === "ACTIVE").map((item) => <option value={item.accountNumber} key={item.accountNumber}>{item.accountNumber} · {item.customerName} · {item.currency}</option>)}</select></Field>
        <Field id="payment-beneficiary" label="External beneficiary"><select id="payment-beneficiary" name="beneficiaryId" data-bp="payment-beneficiary" defaultValue=""><option value="">Not applicable</option>{beneficiaries.filter((item) => item.status === "ACTIVE").map((item) => <option value={item.id} key={item.id}>{item.name} · {item.currency} · {item.accountNumber}</option>)}</select></Field>
        <Field id="payment-amount" label="Amount" required><input id="payment-amount" name="amount" data-bp="payment-amount" inputMode="decimal" placeholder="0.00" required /><ErrorText state={state} name="amount" /></Field>
        <Field id="payment-reference" label="Payment reference" required><input id="payment-reference" name="description" data-bp="payment-reference" maxLength={140} required /></Field>
      </div>
      <div className="form-actions"><button id="payment-submit" name="intent" value="submit-payment" data-bp="payment-submit" className="primary-button" type="submit" disabled={pending}>{pending ? "Posting…" : "Post payment"}</button></div>
    </form>
  );
}

export function AccountStatusForm({ action, currentStatus, readOnly }: { action: StateAction; currentStatus: string; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="account-status-form">
      <ActionFeedback state={state} id="account-status-result" />
      <div className="form-grid two">
        <Field id="account-new-status" label="New status" required>
          <select id="account-new-status" name="status" data-bp="account-new-status" defaultValue={currentStatus} disabled={readOnly} required>
            <option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option><option value="CLOSED">Closed</option>
          </select>
        </Field>
        <Field id="account-status-reason" label="Reason" required><input id="account-status-reason" name="reason" data-bp="account-status-reason" disabled={readOnly} required /></Field>
      </div>
      <div className="form-actions"><button id="account-status-submit" name="intent" value="update-status" data-bp="account-status-submit" className="primary-button" type="submit" disabled={pending || readOnly}>{pending ? "Updating…" : "Update status"}</button></div>
    </form>
  );
}

export function ResetForm({ action }: { action: StateAction }) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} data-bp="demo-reset-form">
      <ActionFeedback state={state} id="reset-status" />
      <Field id="reset-confirmation" label="Type RESET FUTUREBANK to confirm" required><input id="reset-confirmation" name="confirmation" data-bp="reset-confirmation" autoComplete="off" required aria-invalid={Boolean(state.fieldErrors?.confirmation)} /><ErrorText state={state} name="confirmation" /></Field>
      <div className="form-actions"><Link href="/dashboard" className="secondary-button" data-bp="reset-cancel">Cancel</Link><button id="reset-submit" name="intent" value="reset-demo" data-bp="reset-submit" className="primary-button danger" type="submit" disabled={pending}>{pending ? "Resetting…" : "Reset demonstration data"}</button></div>
    </form>
  );
}
