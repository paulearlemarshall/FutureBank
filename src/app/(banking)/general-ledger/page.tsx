import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { ManualGeneralLedgerJournalForm } from "@/components/banking/general-ledger-forms";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { createManualGeneralLedgerJournalAction } from "@/modules/actions/general-ledger";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getTrialBalance, listGeneralLedgerAccounts, listGeneralLedgerJournals } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "General ledger" };

export default async function GeneralLedgerPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [actor, accounts, journals, trialBalance] = await Promise.all([requireUser(), listGeneralLedgerAccounts(), listGeneralLedgerJournals(), getTrialBalance({ toDate: today })]);
  return <AutomationPage name="general-ledger"><PageHeader eyebrow="Financial accounting" title="General ledger" description="Balanced subledger projection, controlled manual journals, and a posted trial balance." />
    <StatusRegion id="general-ledger-guidance">Every booked subledger transaction projects exactly once into a balanced journal. Manual journals require a distinct Admin decision before they affect the trial balance.</StatusRegion>
    <Panel title={`Trial balance to ${formatDate(today)}`} description={trialBalance.balanced ? "Posted debits and credits balance." : "Control failure: posted debits and credits differ."}><StatusRegion id="general-ledger-trial-balance-status" tone={trialBalance.balanced ? "success" : "error"}>Total debits {trialBalance.totalDebit}; total credits {trialBalance.totalCredit}.</StatusRegion><table className="data-table" data-bp="general-ledger-trial-balance-table"><thead><tr><th>Account</th><th>Name</th><th>Type</th><th>Currency</th><th className="numeric">Debit</th><th className="numeric">Credit</th><th className="numeric">Natural balance</th></tr></thead><tbody>{trialBalance.lines.map((line) => <tr key={line.code} data-bp={`general-ledger-trial-balance-row-${line.code}`}><td className="mono">{line.code}</td><td>{line.name}</td><td>{labelEnum(line.type)}</td><td>{line.currency}</td><td className="numeric">{formatMoney(line.debit, line.currency)}</td><td className="numeric">{formatMoney(line.credit, line.currency)}</td><td className="numeric">{formatMoney(line.balance, line.currency)}</td></tr>)}</tbody></table></Panel>
    {hasPermission(actor.role, "GENERAL_LEDGER_JOURNAL_INITIATE") ? <Panel title="Submit manual journal" description="Supervisor maker action; posting remains pending until independent Admin approval."><ManualGeneralLedgerJournalForm action={createManualGeneralLedgerJournalAction} accounts={accounts} valueDate={today} idempotencyKey={crypto.randomUUID()} /></Panel> : null}
    <Panel title={`Journal register (${journals.length})`}><table className="data-table" data-bp="general-ledger-journals-table"><thead><tr><th>Reference</th><th>Value date</th><th>Source</th><th>Status</th><th>Description</th><th>Currency</th><th className="numeric">Debit</th><th className="numeric">Credit</th><th>Source transaction</th></tr></thead><tbody>{journals.map((journal) => <tr key={journal.reference} data-bp={`general-ledger-journal-row-${journal.reference}`}><td className="mono"><Link href={`/general-ledger/journals/${journal.reference}`}>{journal.reference}</Link></td><td>{formatDate(journal.valueDate)}</td><td>{labelEnum(journal.source)}</td><td><Badge tone={journal.status === "POSTED" ? "positive" : journal.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(journal.status)}</Badge></td><td>{journal.description}</td><td>{journal.currency}</td><td className="numeric">{formatMoney(journal.totalDebit, journal.currency)}</td><td className="numeric">{formatMoney(journal.totalCredit, journal.currency)}</td><td className="mono">{journal.sourceTransactionReference ?? "—"}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
