import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel } from "@/components/banking/ui";
import { listAccounts } from "@/modules/queries";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ query?: string; status?: string }> }) {
  const { query = "", status = "" } = await searchParams;
  const allAccounts = await listAccounts({ query, limit: 100 });
  const accounts = status ? allAccounts.filter((account) => account.status === status) : allAccounts;
  return <AutomationPage name="accounts">
    <PageHeader eyebrow="Account management" title="Accounts" description="Search, inspect and maintain customer accounts." actions={<Link href="/accounts/new" className="primary-button" data-bp="account-new">Open account</Link>} />
    <Panel className="search-panel" title="Search criteria"><form action="/accounts" method="get" role="search" data-bp="account-search-form"><div className="field"><label htmlFor="account-search-query">Account number, customer or product</label><input id="account-search-query" name="query" data-bp="account-search-query" defaultValue={query} autoComplete="off" /></div><div className="field"><label htmlFor="account-search-status">Status</label><select id="account-search-status" name="status" data-bp="account-search-status" defaultValue={status}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option><option value="CLOSED">Closed</option></select></div><button id="account-search-submit" name="intent" value="search" data-bp="account-search-submit" className="primary-button" type="submit">Search</button></form></Panel>
    <Panel title={`Results (${accounts.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="account-results-table"><thead><tr><th>Account number</th><th>Customer</th><th>Product</th><th>Type</th><th>Currency</th><th>Status</th><th>Opened</th><th className="numeric">Available</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.accountNumber} data-bp={`account-row-${account.accountNumber}`}><td className="mono"><Link href={`/accounts/${account.accountNumber}`} data-bp={`account-open-${account.accountNumber}`}>{account.accountNumber}</Link></td><td><Link href={`/customers/${account.customerNumber}`} data-bp={`account-customer-${account.accountNumber}`}>{account.customerName}</Link><br /><small className="mono">{account.customerNumber}</small></td><td>{account.productName}</td><td>{labelEnum(account.kind)}</td><td>{account.currency}</td><td><Badge tone={account.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(account.status)}</Badge></td><td>{formatDate(account.openedAt)}</td><td className="numeric">{formatMoney(account.availableBalance, account.currency)}</td></tr>)}</tbody></table></div></Panel>
  </AutomationPage>;
}
