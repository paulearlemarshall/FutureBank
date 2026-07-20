import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { listAccounts, listCustomers } from "@/modules/queries";

export const metadata: Metadata = { title: "Universal search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
  const { query = "" } = await searchParams;
  const [customers, accounts] = query
    ? await Promise.all([listCustomers({ query, limit: 100 }), listAccounts({ query, limit: 100 })])
    : [[], []];

  return <AutomationPage name="search">
    <PageHeader eyebrow="Workspace" title="Universal search" description="Search customer names, customer numbers and account numbers." />
    {!query ? <StatusRegion id="search-guidance">Enter a customer name, customer number or account number in the search box above.</StatusRegion> : null}
    <Panel title={`Customers (${customers.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="global-customer-results"><thead><tr><th>Customer number</th><th>Name</th><th>Type</th><th>Status</th><th>KYC</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.customerNumber}><td className="mono"><Link href={`/customers/${customer.customerNumber}`} data-bp={`global-customer-${customer.customerNumber}`}>{customer.customerNumber}</Link></td><td>{customer.displayName}</td><td>{labelEnum(customer.partyType)}</td><td><Badge tone={customer.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(customer.status)}</Badge></td><td>{labelEnum(customer.kycStatus)}</td></tr>)}</tbody></table>{query && customers.length === 0 ? <div className="empty-state">No matching customers.</div> : null}</div></Panel>
    <Panel title={`Accounts (${accounts.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="global-account-results"><thead><tr><th>Account number</th><th>Customer</th><th>Product</th><th>Currency</th><th>Status</th><th className="numeric">Available</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.accountNumber}><td className="mono"><Link href={`/accounts/${account.accountNumber}`} data-bp={`global-account-${account.accountNumber}`}>{account.accountNumber}</Link></td><td>{account.customerName}</td><td>{account.productName}</td><td>{account.currency}</td><td><Badge tone={account.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(account.status)}</Badge></td><td className="numeric">{formatMoney(account.availableBalance, account.currency)}</td></tr>)}</tbody></table>{query && accounts.length === 0 ? <div className="empty-state">No matching accounts.</div> : null}</div></Panel>
  </AutomationPage>;
}
