import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { getEndOfDayRun } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "End-of-day run" };

export default async function EndOfDayDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const run = await getEndOfDayRun(reference);
  if (!run) notFound();
  return <AutomationPage name="end-of-day-detail"><Breadcrumbs items={[{ label: "End of day", href: "/end-of-day" }, { label: run.reference }]} />
    <PageHeader eyebrow="End-of-day run" title={run.reference} description={`Business date ${formatDate(run.businessDate)}`} actions={<Badge tone={run.status === "COMPLETED" ? "positive" : run.status === "FAILED" ? "negative" : "warning"}>{labelEnum(run.status)}</Badge>} />
    {run.errorMessage ? <StatusRegion id="end-of-day-error" tone="error">{run.errorMessage}</StatusRegion> : null}
    <Panel title="Run summary"><dl className="detail-grid" data-bp="end-of-day-run-details"><div><dt>Requested by</dt><dd>{run.requestedBy}</dd></div><div><dt>Started</dt><dd>{formatDate(run.startedAt, true)}</dd></div><div><dt>Completed</dt><dd>{run.completedAt ? formatDate(run.completedAt, true) : "—"}</dd></div><div><dt>Attempted</dt><dd>{run.attempted}</dd></div><div><dt>Booked</dt><dd>{run.booked}</dd></div><div><dt>Failed</dt><dd>{run.failed}</dd></div><div><dt>Charges</dt><dd>{run.chargeCount}</dd></div><div><dt>Interest postings</dt><dd>{run.interestCount}</dd></div></dl></Panel>
    <Panel title={`Postings (${run.postings.length})`}><table className="data-table" data-bp="end-of-day-postings-table"><thead><tr><th>Posting</th><th>Account</th><th>Customer</th><th>Type</th><th>Status</th><th className="numeric">Amount</th><th className="numeric">Annual rate</th><th>Rule</th><th>Transaction</th><th>Failure</th></tr></thead><tbody>{run.postings.map((posting) => <tr key={posting.reference} data-bp={`end-of-day-posting-row-${posting.reference}`}><td className="mono">{posting.reference}</td><td className="mono"><Link href={`/accounts/${posting.accountNumber}`}>{posting.accountNumber}</Link></td><td><Link href={`/customers/${posting.customerNumber}`}>{posting.customerNumber} · {posting.customerName}</Link></td><td>{labelEnum(posting.type)}</td><td><Badge tone={posting.status === "BOOKED" ? "positive" : posting.status === "FAILED" ? "negative" : "warning"}>{labelEnum(posting.status)}</Badge></td><td className="numeric">{formatMoney(posting.amount, posting.currency)}</td><td className="numeric">{posting.annualRate ? `${posting.annualRate}%` : "—"}</td><td className="mono">{posting.chargeRuleReference ?? "—"}</td><td className="mono">{posting.transactionReference ?? "—"}</td><td>{posting.failureMessage ?? "—"}</td></tr>)}</tbody></table>{run.postings.length === 0 ? <p>No account postings were created for this run.</p> : null}</Panel>
  </AutomationPage>;
}
