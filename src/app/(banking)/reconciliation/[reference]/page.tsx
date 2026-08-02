import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { ReconciliationResolutionForm } from "@/components/banking/reconciliation-forms";
import { Badge, Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { resolveReconciliationItemAction } from "@/modules/actions/reconciliation";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getReconciliationRun } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Reconciliation run" };

export default async function ReconciliationDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [actor, run] = await Promise.all([requireUser(), getReconciliationRun(reference)]);
  if (!run) notFound();
  const openItems = run.items.filter((item) => item.status === "OPEN");
  return <AutomationPage name="reconciliation-detail"><Breadcrumbs items={[{ label: "Reconciliation", href: "/reconciliation" }, { label: run.reference }]} />
    <PageHeader eyebrow="Clearing reconciliation" title={run.reference} description={`Settlement date ${formatDate(run.businessDate)}`} actions={<Badge tone={run.status === "COMPLETED" ? "positive" : run.status === "FAILED" ? "negative" : "warning"}>{labelEnum(run.status)}</Badge>} />
    {run.errorMessage ? <StatusRegion id="reconciliation-error" tone="error">{run.errorMessage}</StatusRegion> : null}
    <Panel title="Control summary"><dl className="detail-grid" data-bp="reconciliation-run-details"><div><dt>Requested by</dt><dd>{run.requestedBy}</dd></div><div><dt>Compared</dt><dd>{run.attempted}</dd></div><div><dt>Matched</dt><dd>{run.matched}</dd></div><div><dt>Exceptions</dt><dd>{run.exceptions}</dd></div><div><dt>Open exceptions</dt><dd>{run.openExceptions}</dd></div><div><dt>Completed</dt><dd>{run.completedAt ? formatDate(run.completedAt, true) : "—"}</dd></div></dl></Panel>
    <Panel title={`Comparison items (${run.items.length})`}><table className="data-table" data-bp="reconciliation-items-table"><thead><tr><th>Item</th><th>Transaction</th><th>Result</th><th>Status</th><th>Internal direction</th><th className="numeric">Internal amount</th><th>External direction</th><th className="numeric">External amount</th><th>Resolution</th></tr></thead><tbody>{run.items.map((item) => <tr key={item.reference} data-bp={`reconciliation-item-row-${item.reference}`}><td className="mono">{item.reference}</td><td className="mono">{item.transactionReference}</td><td>{labelEnum(item.type)}</td><td><Badge tone={item.status === "MATCHED" ? "positive" : item.status === "RESOLVED" ? "info" : "warning"}>{labelEnum(item.status)}</Badge></td><td>{item.internalDirection ? labelEnum(item.internalDirection) : "—"}</td><td className="numeric">{item.internalAmount && item.internalCurrency ? formatMoney(item.internalAmount, item.internalCurrency) : "—"}</td><td>{item.externalDirection ? labelEnum(item.externalDirection) : "—"}</td><td className="numeric">{item.externalAmount && item.externalCurrency ? formatMoney(item.externalAmount, item.externalCurrency) : "—"}</td><td>{item.resolutionComment ?? "—"}</td></tr>)}</tbody></table></Panel>
    {hasPermission(actor.role, "RECONCILIATION_RESOLVE") ? <Panel title="Resolve exception" description={openItems.length ? "Resolution records control evidence only and never changes a ledger entry." : "All reconciliation exceptions have resolution evidence."}><ReconciliationResolutionForm action={resolveReconciliationItemAction} runReference={run.reference} items={openItems.map((item) => ({ reference: item.reference, transactionReference: item.transactionReference, version: item.version }))} /></Panel> : null}
  </AutomationPage>;
}
