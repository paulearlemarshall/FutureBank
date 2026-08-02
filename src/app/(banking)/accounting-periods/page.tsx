import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { listAccountingPeriods } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Accounting periods" };

export default async function AccountingPeriodsPage() {
  const periods = await listAccountingPeriods();
  return <AutomationPage name="accounting-periods"><PageHeader eyebrow="Accounting control" title="Accounting periods" description="Maker-checker close control and authoritative posting-date gates." />
    <StatusRegion id="accounting-period-guidance">Closing requires completed end-of-day and reconciliation at the period end, no open exceptions or running batches, and a balanced ledger. Closed dates reject every ledger writer.</StatusRegion>
    <Panel title={`Periods (${periods.length})`}><table className="data-table" data-bp="accounting-periods-table"><thead><tr><th>Reference</th><th>Code</th><th>Start date</th><th>End date</th><th>Status</th><th>Version</th><th>Close requested</th><th>Closed</th></tr></thead><tbody>{periods.map((period) => <tr key={period.reference} data-bp={`accounting-period-row-${period.reference}`}><td className="mono"><Link href={`/accounting-periods/${period.reference}`}>{period.reference}</Link></td><td>{period.code}</td><td>{formatDate(period.startDate)}</td><td>{formatDate(period.endDate)}</td><td><Badge tone={period.status === "OPEN" ? "positive" : period.status === "CLOSING" ? "warning" : "neutral"}>{labelEnum(period.status)}</Badge></td><td>{period.version}</td><td>{period.closeRequestedAt ? formatDate(period.closeRequestedAt, true) : "—"}</td><td>{period.closedAt ? formatDate(period.closedAt, true) : "—"}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
