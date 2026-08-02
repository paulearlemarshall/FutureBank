import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { PaymentReversalDecisionForm } from "@/components/banking/payment-reversal-forms";
import { Badge, Breadcrumbs, Panel, StatusRegion } from "@/components/banking/ui";
import { decidePaymentReversalAction } from "@/modules/actions/payment-reversals";
import { getPaymentReversal } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Payment reversal" };

export default async function PaymentReversalDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const reversal = await getPaymentReversal(reference);
  if (!reversal) notFound();
  return <AutomationPage name="payment-reversal-detail"><Breadcrumbs items={[{ label: "Payment reversals", href: "/payment-reversals" }, { label: reference }]} />
    <section className="record-banner" data-bp="payment-reversal-record-header"><div><p>{labelEnum(reversal.paymentType)} reversal · {reversal.currency}</p><h1>{reversal.reference}</h1></div><Badge tone={reversal.status === "BOOKED" ? "positive" : reversal.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(reversal.status)}</Badge></section>
    <Panel title="Reversal details"><dl className="definition-grid"><div><dt>Original payment</dt><dd><Link href={`/payments/${reversal.originalPaymentReference}`}>{reversal.originalPaymentReference}</Link></dd></div><div><dt>Source account</dt><dd><Link href={`/accounts/${reversal.sourceAccountNumber}`}>{reversal.sourceAccountNumber}</Link></dd></div><div><dt>Destination</dt><dd>{reversal.destinationReference}</dd></div><div><dt>Customer</dt><dd>{reversal.customerNumber} · {reversal.customerName}</dd></div><div><dt>Amount</dt><dd>{formatMoney(reversal.amount, reversal.currency)}</dd></div><div><dt>Reason</dt><dd>{reversal.reason}</dd></div><div><dt>Requested by</dt><dd>{reversal.requestedBy}</dd></div><div><dt>Requested</dt><dd>{formatDate(reversal.createdAt, true)}</dd></div><div><dt>Reversal transaction</dt><dd>{reversal.reversalTransactionReference ?? "—"}</dd></div><div><dt>Decision comment</dt><dd>{reversal.decisionComment ?? "—"}</dd></div></dl></Panel>
    <Panel title="Independent decision" description="Approval locks the request and original posting, rechecks funds, and posts the counter-entry exactly once.">{reversal.status === "PENDING_APPROVAL" && reversal.workItem ? <PaymentReversalDecisionForm action={decidePaymentReversalAction} reversalReference={reference} workItem={reversal.workItem} /> : <StatusRegion id="payment-reversal-decision-complete" tone={reversal.status === "BOOKED" ? "success" : "warning"}>Reversal is {labelEnum(reversal.status)}; no decision is available.</StatusRegion>}</Panel>
  </AutomationPage>;
}
