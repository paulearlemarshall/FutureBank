import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { EndOfDayRunForm } from "@/components/banking/end-of-day-form";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { runEndOfDayAction } from "@/modules/actions/end-of-day";
import { hasPermission } from "@/modules/domain/auth-policy";
import { listEndOfDayRuns } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "End of day" };

export default async function EndOfDayPage() {
  const [actor, runs] = await Promise.all([requireUser(), listEndOfDayRuns()]);
  const today = new Date().toISOString().slice(0, 10);
  return <AutomationPage name="end-of-day">
    <PageHeader eyebrow="Core banking" title="End-of-day posting" description="Apply configured daily overdraft charges and exact product-rate deposit interest through balanced ledger entries." />
    <StatusRegion id="end-of-day-guidance">Each business date is claimed once. Account-level idempotency prevents duplicate postings, and every booked amount has an equal-and-opposite currency clearing leg.</StatusRegion>
    {hasPermission(actor.role, "END_OF_DAY_EXECUTE") ? <Panel title="Run end of day" description="Supervisor or administrator authority is required."><EndOfDayRunForm action={runEndOfDayAction} businessDate={today} /></Panel> : null}
    <Panel title={`Run history (${runs.length})`}><table className="data-table" data-bp="end-of-day-runs-table"><thead><tr><th>Run</th><th>Business date</th><th>Status</th><th className="numeric">Attempted</th><th className="numeric">Booked</th><th className="numeric">Charges</th><th className="numeric">Interest</th><th className="numeric">Failed</th><th>Started</th></tr></thead><tbody>{runs.map((run) => <tr key={run.reference} data-bp={`end-of-day-run-row-${run.reference}`}><td className="mono"><Link href={`/end-of-day/${run.reference}`}>{run.reference}</Link></td><td>{formatDate(run.businessDate)}</td><td><Badge tone={run.status === "COMPLETED" ? "positive" : run.status === "FAILED" ? "negative" : "warning"}>{labelEnum(run.status)}</Badge></td><td className="numeric">{run.attempted}</td><td className="numeric">{run.booked}</td><td className="numeric">{run.chargeCount}</td><td className="numeric">{run.interestCount}</td><td className="numeric">{run.failed}</td><td>{formatDate(run.startedAt, true)}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
