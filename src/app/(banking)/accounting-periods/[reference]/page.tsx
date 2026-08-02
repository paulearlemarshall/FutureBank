import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountingPeriodCloseDecisionForm, AccountingPeriodCloseRequestForm } from "@/components/banking/accounting-period-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { decideAccountingPeriodCloseAction, requestAccountingPeriodCloseAction } from "@/modules/actions/accounting-periods";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getAccountingPeriod } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Accounting period" };

export default async function AccountingPeriodPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [actor, period] = await Promise.all([requireUser(), getAccountingPeriod(reference)]);
  if (!period) notFound();
  return <AutomationPage name="accounting-period-detail"><Breadcrumbs items={[{ label: "Accounting periods", href: "/accounting-periods" }, { label: period.reference }]} />
    <PageHeader eyebrow="Accounting period" title={period.code} description={`${formatDate(period.startDate)} to ${formatDate(period.endDate)}`} actions={<Badge tone={period.status === "OPEN" ? "positive" : period.status === "CLOSING" ? "warning" : "neutral"}>{labelEnum(period.status)}</Badge>} />
    <StatusRegion id="accounting-period-control-state">Version {period.version}. {period.status === "CLOSED" ? "All ledger writers reject value dates in this period." : period.status === "CLOSING" ? "Posting is frozen while independent close approval is pending." : "Posting remains open until close controls pass and an Admin approves."}</StatusRegion>
    <Panel title="Period evidence"><dl className="detail-grid" data-bp="accounting-period-details"><div><dt>Reference</dt><dd className="mono">{period.reference}</dd></div><div><dt>Status</dt><dd>{labelEnum(period.status)}</dd></div><div><dt>Requested by</dt><dd>{period.closeRequestedBy ?? "—"}</dd></div><div><dt>Request evidence</dt><dd>{period.closeRequestComment ?? "—"}</dd></div><div><dt>Closed by</dt><dd>{period.closedBy ?? "—"}</dd></div><div><dt>Decision evidence</dt><dd>{period.closeDecisionComment ?? "—"}</dd></div></dl></Panel>
    {period.status === "OPEN" && hasPermission(actor.role, "ACCOUNTING_PERIOD_CLOSE_INITIATE") ? <Panel title="Request close"><AccountingPeriodCloseRequestForm action={requestAccountingPeriodCloseAction} periodReference={period.reference} version={period.version} /></Panel> : null}
    {period.status === "CLOSING" && period.workItem && ["OPEN", "ASSIGNED"].includes(period.workItem.status) && hasPermission(actor.role, "ACCOUNTING_PERIOD_CLOSE_DECIDE") ? <Panel title="Independent close decision"><AccountingPeriodCloseDecisionForm action={decideAccountingPeriodCloseAction} periodReference={period.reference} workItem={period.workItem} /></Panel> : null}
  </AutomationPage>;
}
