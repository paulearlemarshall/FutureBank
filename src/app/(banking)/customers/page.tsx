import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel } from "@/components/banking/ui";
import { listCustomers } from "@/modules/queries";

export const metadata: Metadata = { title: "Customers" };

function tone(value: string) {
  return value === "ACTIVE" || value === "COMPLETE" || value === "LOW" ? "positive" as const : value === "HIGH" || value === "RESTRICTED" ? "negative" as const : "warning" as const;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ query?: string; status?: string }> }) {
  const { query = "", status = "" } = await searchParams;
  const allCustomers = await listCustomers({ query, limit: 100 });
  const rows = status ? allCustomers.filter((customer) => customer.status === status) : allCustomers;

  return (
    <AutomationPage name="customers">
      <PageHeader eyebrow="Customer relationship" title="Customer search" description="Find a customer using their number, name or other identifying detail." actions={<Link href="/customers/new" className="primary-button" data-bp="customer-new">New customer</Link>} />
      <Panel className="search-panel" title="Search criteria">
        <form action="/customers" method="get" role="search" data-bp="customer-search-form">
          <div className="field"><label htmlFor="customer-search-query">Customer name or number</label><input id="customer-search-query" name="query" data-bp="customer-search-query" dir="auto" defaultValue={query} autoComplete="off" placeholder="e.g. C000001, Amelia or المنصوري" /></div>
          <div className="field"><label htmlFor="customer-search-status">Status</label><select id="customer-search-status" name="status" data-bp="customer-search-status" defaultValue={status}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="RESTRICTED">Restricted</option></select></div>
          <button id="customer-search-submit" name="intent" value="search" data-bp="customer-search-submit" className="primary-button" type="submit">Search</button>
        </form>
      </Panel>
      <Panel title={`Results (${rows.length})`} description="Select a customer number to open the full record.">
        <div style={{ margin: "-16px" }}>
          <table className="data-table" data-bp="customer-results-table">
            <thead><tr><th>Customer no.</th><th>RIM</th><th>Name</th><th>Type</th><th>Country</th><th>Status</th><th>KYC</th><th>Risk</th><th>Last updated</th></tr></thead>
            <tbody>{rows.map((customer) => <tr key={customer.customerNumber} data-bp={`customer-row-${customer.customerNumber}`}><td className="mono"><Link href={`/customers/${customer.customerNumber}`} data-bp={`customer-open-${customer.customerNumber}`}>{customer.customerNumber}</Link></td><td className="mono" data-bp={`customer-rim-${customer.customerNumber}`}>{customer.rimNumber}</td><td><strong dir="auto">{customer.displayName}</strong></td><td>{labelEnum(customer.partyType)}</td><td>{customer.nationality}</td><td><Badge tone={tone(customer.status)}>{labelEnum(customer.status)}</Badge></td><td><Badge tone={tone(customer.kycStatus)}>{labelEnum(customer.kycStatus)}</Badge></td><td><Badge tone={tone(customer.riskRating)}>{labelEnum(customer.riskRating)}</Badge></td><td>{formatDate(customer.updatedAt)}</td></tr>)}</tbody>
          </table>
          {rows.length === 0 ? <div className="empty-state" data-bp="customer-no-results">No customers match the search criteria.</div> : null}
        </div>
      </Panel>
    </AutomationPage>
  );
}
