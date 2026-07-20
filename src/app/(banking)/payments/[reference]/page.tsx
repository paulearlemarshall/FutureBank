import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { PaymentDecisionForm } from "@/components/banking/operations-forms";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, Panel, StatusRegion } from "@/components/banking/ui";
import { approvePendingPaymentAction, rejectPendingPaymentAction } from "@/modules/actions/payments";
import { getPaymentApproval } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Payment approval" };

export default async function PaymentDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const payment = await getPaymentApproval(reference);
  if (!payment) notFound();
  return <AutomationPage name="payment-approval-detail"><Breadcrumbs items={[{ label: "Payments", href: "/payments" }, { label: reference }]} />
    <section className="record-banner" data-bp="payment-record-header"><div><p>{labelEnum(payment.type)} payment · {payment.currency}</p><h1>{payment.reference}</h1></div><div className="record-banner-meta"><Badge tone={payment.status === "BOOKED" ? "positive" : payment.status === "PENDING" ? "warning" : "negative"}>{labelEnum(payment.status)}</Badge></div></section>
    {payment.approvalReason ? <StatusRegion id="payment-approval-reason" tone="warning">Approval trigger: {payment.approvalReason}</StatusRegion> : null}
    <div className="two-column"><Panel title="Payment details"><dl className="definition-grid"><div><dt>Debit account</dt><dd><Link href={`/accounts/${payment.sourceAccountNumber}`} data-bp="payment-source-account-link">{payment.sourceAccountNumber}</Link></dd></div><div><dt>Customer</dt><dd><Link href={`/customers/${payment.customerNumber}`}>{payment.customerNumber} · {payment.customerName}</Link></dd></div><div><dt>Beneficiary / destination</dt><dd>{payment.destinationReference}</dd></div><div><dt>Amount</dt><dd>{formatMoney(payment.amount, payment.currency)}</dd></div><div><dt>Description</dt><dd>{payment.description}</dd></div><div><dt>Initiated by</dt><dd>{payment.initiatedBy}</dd></div><div><dt>Created</dt><dd>{formatDate(payment.createdAt, true)}</dd></div><div><dt>Expires</dt><dd>{payment.expiresAt ? formatDate(payment.expiresAt, true) : "—"}</dd></div></dl></Panel>
      <Panel title="Account hold"><dl className="definition-grid">{payment.hold ? <><div><dt>Reference</dt><dd className="mono">{payment.hold.reference}</dd></div><div><dt>Status</dt><dd>{labelEnum(payment.hold.status)}</dd></div><div><dt>Reserved amount</dt><dd>{formatMoney(payment.hold.amount, payment.hold.currency)}</dd></div><div><dt>Expiry</dt><dd>{formatDate(payment.hold.expiresAt, true)}</dd></div></> : <div><dt>Hold</dt><dd>No hold</dd></div>}</dl></Panel></div>
    <Panel title="Independent approval" description="Approval rechecks KYC, beneficiary ownership and screening, account status, hold, funds and facility headroom.">{payment.status === "PENDING" && payment.workItem ? <PaymentDecisionForm approveAction={approvePendingPaymentAction} rejectAction={rejectPendingPaymentAction} paymentReference={reference} workItem={payment.workItem} /> : <StatusRegion id="payment-decision-complete" tone={payment.status === "BOOKED" ? "success" : "warning"}>Payment is {labelEnum(payment.status)}; no decision is available.</StatusRegion>}</Panel>
  </AutomationPage>;
}
