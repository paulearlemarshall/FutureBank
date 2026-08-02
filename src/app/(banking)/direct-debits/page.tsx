import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { DirectDebitCollectionForm, DirectDebitMandateForm } from "@/components/banking/direct-debit-forms";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { createDirectDebitMandateAction, submitDirectDebitCollectionAction } from "@/modules/actions/direct-debits";
import { hasPermission } from "@/modules/domain/auth-policy";
import { listDirectDebitMandates } from "@/modules/operations-queries";
import { listAccounts, listBeneficiaries } from "@/modules/queries";

export const metadata: Metadata = { title: "Direct debits" };
export default async function DirectDebitsPage() {
  const actor = await requireUser();
  const [mandates, accounts, beneficiaries] = await Promise.all([listDirectDebitMandates(), listAccounts({ limit: 100 }), listBeneficiaries({})]);
  const today = new Date().toISOString().slice(0, 10);
  return <AutomationPage name="direct-debits"><PageHeader eyebrow="Payment services" title="Direct debit mandates" description="Register customer authority and submit creditor collections through existing payment controls." /><StatusRegion id="direct-debit-guidance">A mandate authorizes collection up to its cap; it does not reserve funds. Each collection rechecks the live account, KYC, beneficiary, balance and approval controls.</StatusRegion>
    <Panel title={`Mandates (${mandates.length})`}><table className="data-table" data-bp="direct-debit-mandates-table"><thead><tr><th>Mandate</th><th>Customer</th><th>Account</th><th>Creditor</th><th>Creditor reference</th><th className="numeric">Maximum</th><th>Valid from</th><th>Valid to</th><th>Status</th><th className="numeric">Collections</th></tr></thead><tbody>{mandates.map((item) => <tr key={item.reference} data-bp={`direct-debit-row-${item.reference}`}><td className="mono"><Link href={`/direct-debits/${item.reference}`} data-bp={`direct-debit-link-${item.reference}`}>{item.reference}</Link></td><td>{item.customerNumber} · {item.customerName}</td><td className="mono">{item.sourceAccountNumber}</td><td>{item.creditorName}</td><td className="mono">{item.creditorMandateReference}</td><td className="numeric">{formatMoney(item.maximumSingleAmount, item.currency)}</td><td>{formatDate(item.validFrom)}</td><td>{item.validTo ? formatDate(item.validTo) : "—"}</td><td><Badge tone={item.status === "ACTIVE" ? "positive" : item.status === "SUSPENDED" ? "warning" : "neutral"}>{labelEnum(item.status)}</Badge></td><td className="numeric">{item.collections.length}</td></tr>)}</tbody></table></Panel>
    {hasPermission(actor.role, "DIRECT_DEBIT_MAINTAIN") ? <Panel title="Register mandate" description="The creditor must be an active beneficiary owned by the account customer."><DirectDebitMandateForm action={createDirectDebitMandateAction} accounts={accounts} beneficiaries={beneficiaries} today={today} /></Panel> : null}
    {hasPermission(actor.role, "DIRECT_DEBIT_COLLECT") ? <Panel title="Submit collection" description="The idempotent result may book immediately, become pending approval, or be rejected."><DirectDebitCollectionForm action={submitDirectDebitCollectionAction} mandates={mandates} today={today} idempotencyKey={randomUUID()} /></Panel> : null}
  </AutomationPage>;
}
