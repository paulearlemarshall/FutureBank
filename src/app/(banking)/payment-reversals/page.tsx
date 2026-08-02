import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, Panel } from "@/components/banking/ui";
import { listPaymentReversals } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Payment reversals" };

export default async function PaymentReversalsPage() {
  const reversals = await listPaymentReversals();
  return <AutomationPage name="payment-reversals"><Breadcrumbs items={[{ label: "Payment reversals" }]} /><section className="page-heading"><div><p className="eyebrow">Core banking</p><h1>Payment reversals</h1><p>Full-value correction requests with independent approval and immutable counter-postings.</p></div></section>
    <Panel title={`Reversals (${reversals.length})`}><table className="data-table" data-bp="payment-reversals-table"><thead><tr><th>Reference</th><th>Original payment</th><th>Status</th><th>Account</th><th>Amount</th><th>Requested</th></tr></thead><tbody>{reversals.map((item) => <tr key={item.reference}><td><Link href={`/payment-reversals/${item.reference}`}>{item.reference}</Link></td><td><Link href={`/payments/${item.originalPaymentReference}`}>{item.originalPaymentReference}</Link></td><td><Badge tone={item.status === "BOOKED" ? "positive" : item.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(item.status)}</Badge></td><td>{item.sourceAccountNumber}</td><td>{formatMoney(item.amount, item.currency)}</td><td>{formatDate(item.createdAt, true)}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
