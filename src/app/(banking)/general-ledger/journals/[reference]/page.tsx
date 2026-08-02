import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { GeneralLedgerJournalDecisionForm } from "@/components/banking/general-ledger-forms";
import { Badge, Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { decideManualGeneralLedgerJournalAction } from "@/modules/actions/general-ledger";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getGeneralLedgerJournal } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "General-ledger journal" };

export default async function GeneralLedgerJournalPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [actor, journal] = await Promise.all([requireUser(), getGeneralLedgerJournal(reference)]);
  if (!journal) notFound();
  return <AutomationPage name="general-ledger-journal-detail"><Breadcrumbs items={[{ label: "General ledger", href: "/general-ledger" }, { label: journal.reference }]} />
    <PageHeader eyebrow="General-ledger journal" title={journal.reference} description={`${formatDate(journal.valueDate)} · ${journal.description}`} actions={<Badge tone={journal.status === "POSTED" ? "positive" : journal.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(journal.status)}</Badge>} />
    <StatusRegion id="general-ledger-journal-control-state">Version {journal.version}. {journal.status === "POSTED" ? `Posted debit and credit totals are ${formatMoney(journal.totalDebit, journal.currency)}.` : journal.status === "PENDING_APPROVAL" ? "This journal does not affect the trial balance until an independent Admin approves it." : "This journal was rejected without posting."}</StatusRegion>
    <Panel title="Journal evidence"><dl className="detail-grid" data-bp="general-ledger-journal-details"><div><dt>Source</dt><dd>{labelEnum(journal.source)}</dd></div><div><dt>Source transaction</dt><dd className="mono">{journal.sourceTransactionReference ?? "—"}</dd></div><div><dt>Created by</dt><dd>{journal.createdBy ?? "System projection"}</dd></div><div><dt>Submission evidence</dt><dd>{journal.submittedComment ?? "—"}</dd></div><div><dt>Decided by</dt><dd>{journal.decidedBy ?? "—"}</dd></div><div><dt>Decision evidence</dt><dd>{journal.decisionComment ?? "—"}</dd></div><div><dt>Posted at</dt><dd>{journal.postedAt ? formatDate(journal.postedAt, true) : "—"}</dd></div></dl></Panel>
    <Panel title={`Journal lines (${journal.lines.length})`}><table className="data-table" data-bp="general-ledger-journal-lines-table"><thead><tr><th>Line</th><th>Account</th><th>Name</th><th>Type</th><th>Direction</th><th className="numeric">Amount</th><th>Narrative</th></tr></thead><tbody>{journal.lines.map((line) => <tr key={line.lineNumber} data-bp={`general-ledger-journal-line-${line.lineNumber}`}><td>{line.lineNumber}</td><td className="mono">{line.accountCode}</td><td>{line.accountName}</td><td>{labelEnum(line.accountType)}</td><td>{labelEnum(line.direction)}</td><td className="numeric">{formatMoney(line.amount, journal.currency)}</td><td>{line.narrative}</td></tr>)}</tbody></table></Panel>
    {journal.status === "PENDING_APPROVAL" && journal.workItem && ["OPEN", "ASSIGNED"].includes(journal.workItem.status) && hasPermission(actor.role, "GENERAL_LEDGER_JOURNAL_DECIDE") ? <Panel title="Independent journal decision"><GeneralLedgerJournalDecisionForm action={decideManualGeneralLedgerJournalAction} journalReference={journal.reference} workItem={journal.workItem} /></Panel> : null}
  </AutomationPage>;
}
