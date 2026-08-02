import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { ReconciliationRunForm } from "@/components/banking/reconciliation-forms";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { runReconciliationAction } from "@/modules/actions/reconciliation";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getLatestSettlementBusinessDate, listReconciliationRuns } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Clearing reconciliation" };

export default async function ReconciliationPage() {
  const [actor, runs, latestDate] = await Promise.all([requireUser(), listReconciliationRuns(), getLatestSettlementBusinessDate()]);
  return <AutomationPage name="reconciliation"><PageHeader eyebrow="Accounting control" title="Clearing reconciliation" description="Compare imported fictional settlement records with immutable internal clearing entries." />
    <StatusRegion id="reconciliation-guidance">Matching never edits the ledger. Amount, currency, direction, and missing-side differences become durable exceptions for controlled resolution.</StatusRegion>
    {latestDate && hasPermission(actor.role, "RECONCILIATION_EXECUTE") ? <Panel title="Run reconciliation" description="Each settlement business date is reconciled once."><ReconciliationRunForm action={runReconciliationAction} businessDate={latestDate} /></Panel> : null}
    <Panel title={`Run history (${runs.length})`}><table className="data-table" data-bp="reconciliation-runs-table"><thead><tr><th>Run</th><th>Business date</th><th>Status</th><th className="numeric">Compared</th><th className="numeric">Matched</th><th className="numeric">Exceptions</th><th className="numeric">Open</th><th>Started</th></tr></thead><tbody>{runs.map((run) => <tr key={run.reference} data-bp={`reconciliation-run-row-${run.reference}`}><td className="mono"><Link href={`/reconciliation/${run.reference}`}>{run.reference}</Link></td><td>{formatDate(run.businessDate)}</td><td><Badge tone={run.status === "COMPLETED" ? "positive" : run.status === "FAILED" ? "negative" : "warning"}>{labelEnum(run.status)}</Badge></td><td className="numeric">{run.attempted}</td><td className="numeric">{run.matched}</td><td className="numeric">{run.exceptions}</td><td className="numeric">{run.openExceptions}</td><td>{formatDate(run.startedAt, true)}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
