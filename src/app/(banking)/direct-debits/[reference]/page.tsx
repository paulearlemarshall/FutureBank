import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { DirectDebitCancellationForm } from "@/components/banking/direct-debit-forms";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { cancelDirectDebitMandateAction } from "@/modules/actions/direct-debits";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getDirectDebitMandate } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Direct debit mandate" };
export default async function DirectDebitMandatePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [actor, mandate] = await Promise.all([requireUser(), getDirectDebitMandate(reference)]);
  if (!mandate) notFound();
  const cancellable = ["ACTIVE", "SUSPENDED"].includes(mandate.status) && hasPermission(actor.role, "DIRECT_DEBIT_MAINTAIN");
  return <AutomationPage name="direct-debit-detail"><Breadcrumbs items={[{ label: "Direct debits", href: "/direct-debits" }, { label: mandate.reference }]} /><PageHeader eyebrow="Direct debit mandate" title={mandate.reference} description={`${mandate.creditorName} · ${mandate.creditorMandateReference}`} actions={<Badge tone={mandate.status === "ACTIVE" ? "positive" : mandate.status === "SUSPENDED" ? "warning" : "neutral"}>{labelEnum(mandate.status)}</Badge>} />
    <Panel title="Mandate details"><dl className="detail-grid" data-bp="direct-debit-details"><div><dt>Customer</dt><dd>{mandate.customerNumber} · {mandate.customerName}</dd></div><div><dt>Debit account</dt><dd className="mono"><Link href={`/accounts/${mandate.sourceAccountNumber}`}>{mandate.sourceAccountNumber}</Link></dd></div><div><dt>Creditor</dt><dd>{mandate.creditorName}</dd></div><div><dt>Creditor account</dt><dd className="mono">{mandate.creditorAccountNumber}</dd></div><div><dt>Maximum collection</dt><dd>{formatMoney(mandate.maximumSingleAmount, mandate.currency)}</dd></div><div><dt>Validity</dt><dd>{formatDate(mandate.validFrom)} – {mandate.validTo ? formatDate(mandate.validTo) : "open ended"}</dd></div><div><dt>Version</dt><dd>{mandate.version}</dd></div></dl>{mandate.cancellationReason ? <StatusRegion id="direct-debit-cancellation">Cancelled: {mandate.cancellationReason}</StatusRegion> : null}</Panel>
    <Panel title={`Collections (${mandate.collections.length})`}><table className="data-table" data-bp="direct-debit-collections-table"><thead><tr><th>Reference</th><th>Date</th><th className="numeric">Amount</th><th>Status</th><th>Payment</th><th>Failure</th><th>Completed</th></tr></thead><tbody>{mandate.collections.map((item) => <tr key={item.reference}><td className="mono">{item.reference}</td><td>{formatDate(item.collectionDate)}</td><td className="numeric">{formatMoney(item.amount, item.currency)}</td><td>{labelEnum(item.status)}</td><td className="mono">{item.paymentReference ? <Link href={`/payments/${item.paymentReference}`}>{item.paymentReference}</Link> : "—"}</td><td>{item.failureMessage ?? "—"}</td><td>{item.completedAt ? formatDate(item.completedAt, true) : "—"}</td></tr>)}</tbody></table></Panel>
    {cancellable ? <Panel title="Cancel mandate"><DirectDebitCancellationForm action={cancelDirectDebitMandateAction} reference={mandate.reference} version={mandate.version} /></Panel> : null}
  </AutomationPage>;
}
