import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { CustomerTabs } from "@/components/banking/customer-tabs";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, Panel } from "@/components/banking/ui";
import { getCustomer, listAuditEvents } from "@/modules/queries";

export const metadata: Metadata = { title: "Customer details" };
type Tab = "Overview" | "Accounts" | "KYC" | "Contact & address" | "Relationships" | "Audit";

function tabFrom(value?: string): Tab {
  const normalized = value?.toLowerCase();
  if (normalized === "accounts") return "Accounts";
  if (normalized === "kyc") return "KYC";
  if (normalized === "contact & address") return "Contact & address";
  if (normalized === "relationships") return "Relationships";
  if (normalized === "audit") return "Audit";
  return "Overview";
}

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ customerNumber: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ customerNumber }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  const customer = await getCustomer(customerNumber);
  if (!customer) notFound();
  const activeTab = tabFrom(rawTab);
  const customerAudit = activeTab === "Audit" ? (await listAuditEvents({ query: customerNumber, limit: 100 })) : [];

  return (
    <AutomationPage name="customer-detail">
      <Breadcrumbs items={[{ label: "Customers", href: "/customers" }, { label: customer.customerNumber }]} />
      <section className="record-banner" data-bp="customer-record-header">
        <div><p>{labelEnum(customer.partyType)} customer · {customer.customerNumber}</p><h1>{customer.displayName}</h1></div>
        <div className="record-banner-meta"><Badge tone={customer.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(customer.status)}</Badge><Badge tone={customer.kycStatus === "COMPLETE" ? "positive" : "warning"}>KYC {labelEnum(customer.kycStatus)}</Badge><Link href={`/customers/${customer.customerNumber}/edit`} className="primary-button" data-bp="customer-edit">Edit customer</Link></div>
      </section>
      <CustomerTabs customerNumber={customer.customerNumber} active={activeTab} />

      {activeTab === "Overview" ? <div className="equal-columns">
        <Panel title="Basic details"><dl className="definition-grid"><div><dt>Customer number</dt><dd className="mono">{customer.customerNumber}</dd></div><div><dt>Short name</dt><dd>{customer.shortName}</dd></div><div><dt>Date of birth / registration</dt><dd>{customer.dateOfBirth ? formatDate(customer.dateOfBirth) : customer.registrationNumber}</dd></div><div><dt>Nationality</dt><dd>{customer.nationality}</dd></div><div><dt>Residence</dt><dd>{customer.residenceCountry}</dd></div><div><dt>Language</dt><dd>{customer.language}</dd></div><div><dt>Sector</dt><dd>{customer.sector}</dd></div><div><dt>Industry</dt><dd>{customer.industry}</dd></div><div><dt>Tax ID</dt><dd>{customer.taxId}</dd></div></dl></Panel>
        <Panel title="Relationship and controls"><dl className="definition-grid"><div><dt>Branch</dt><dd>{customer.branchCode}</dd></div><div><dt>Relationship manager</dt><dd>{customer.relationshipManager}</dd></div><div><dt>Risk rating</dt><dd><Badge tone={customer.riskRating === "HIGH" ? "negative" : customer.riskRating === "MEDIUM" ? "warning" : "positive"}>{labelEnum(customer.riskRating)}</Badge></dd></div><div><dt>KYC status</dt><dd>{labelEnum(customer.kycStatus)}</dd></div><div><dt>Next KYC review</dt><dd>{formatDate(customer.kycReviewDate)}</dd></div><div><dt>Record updated</dt><dd>{formatDate(customer.updatedAt, true)}</dd></div></dl></Panel>
      </div> : null}

      {activeTab === "Accounts" ? <Panel title={`Accounts (${customer.accounts.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="customer-accounts-table"><thead><tr><th>Account</th><th>Product</th><th>Currency</th><th>Status</th><th className="numeric">Available balance</th></tr></thead><tbody>{customer.accounts.map((account) => <tr key={account.accountNumber}><td className="mono"><Link href={`/accounts/${account.accountNumber}`} data-bp={`customer-account-${account.accountNumber}`}>{account.accountNumber}</Link></td><td>{account.productName}</td><td>{account.currency}</td><td><Badge tone={account.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(account.status)}</Badge></td><td className="numeric">{formatMoney(account.availableBalance, account.currency)}</td></tr>)}</tbody></table></div></Panel> : null}

      {activeTab === "KYC" ? <div className="equal-columns"><Panel title="KYC profile"><dl className="definition-grid"><div><dt>Status</dt><dd>{labelEnum(customer.kycStatus)}</dd></div><div><dt>Risk rating</dt><dd>{labelEnum(customer.riskRating)}</dd></div><div><dt>Review date</dt><dd>{formatDate(customer.kycReviewDate)}</dd></div></dl></Panel><Panel title={`Identity documents (${customer.identityDocuments.length})`}>{customer.identityDocuments.map((document) => <dl className="definition-grid" key={document.id}><div><dt>Type</dt><dd>{document.type}</dd></div><div><dt>Document number</dt><dd className="mono">{document.documentNumber}</dd></div><div><dt>Issuing country</dt><dd>{document.issuingCountry}</dd></div><div><dt>Issued</dt><dd>{formatDate(document.issuedAt)}</dd></div><div><dt>Expires</dt><dd>{formatDate(document.expiresAt)}</dd></div></dl>)}</Panel></div> : null}

      {activeTab === "Contact & address" ? <div className="equal-columns"><Panel title="Addresses">{customer.addresses.map((address) => <dl className="definition-grid" key={address.id}><div><dt>Type</dt><dd>{address.type}</dd></div><div className="span-2"><dt>Address</dt><dd>{[address.line1, address.line2, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ")}</dd></div></dl>)}</Panel><Panel title="Contact points"><table className="data-table" data-bp="customer-contact-table"><thead><tr><th>Type</th><th>Value</th><th>Preferred</th></tr></thead><tbody>{customer.contacts.map((contact) => <tr key={contact.id}><td>{contact.type}</td><td>{contact.value}</td><td>{contact.preferred ? "Yes" : "No"}</td></tr>)}</tbody></table></Panel></div> : null}

      {activeTab === "Relationships" ? <Panel title={`Relationships (${customer.relationships.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="customer-relationships-table"><thead><tr><th>Related customer</th><th>Name</th><th>Relationship</th><th>Ownership</th></tr></thead><tbody>{customer.relationships.map((relationship) => <tr key={relationship.id}><td className="mono"><Link href={`/customers/${relationship.relatedCustomerNumber}`} data-bp={`relationship-${relationship.relatedCustomerNumber}`}>{relationship.relatedCustomerNumber}</Link></td><td>{relationship.relatedDisplayName}</td><td>{relationship.relationshipType}</td><td>{relationship.ownershipPercent ? `${relationship.ownershipPercent}%` : "—"}</td></tr>)}</tbody></table>{customer.relationships.length === 0 ? <div className="empty-state">No customer relationships recorded.</div> : null}</div></Panel> : null}

      {activeTab === "Audit" ? <Panel title={`Audit events (${customerAudit.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="customer-audit-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Reference</th><th>Correlation ID</th></tr></thead><tbody>{customerAudit.map((event) => <tr key={event.id}><td>{formatDate(event.occurredAt, true)}</td><td>{event.actorUsername}</td><td>{labelEnum(event.action)}</td><td className="mono">{event.entityReference}</td><td className="mono">{event.correlationId}</td></tr>)}</tbody></table></div></Panel> : null}
    </AutomationPage>
  );
}
