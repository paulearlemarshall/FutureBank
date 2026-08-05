import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { CustomerTabs } from "@/components/banking/customer-tabs";
import { CustomerDocuments } from "@/components/banking/customer-documents";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Breadcrumbs, Panel } from "@/components/banking/ui";
import { getCustomer, listAuditEvents } from "@/modules/queries";
import { getKycCase, listKycCases } from "@/modules/operations-queries";
import { documentBlobPrefix } from "@/lib/document-storage";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/modules/domain/auth-policy";

export const metadata: Metadata = { title: "Customer details" };
type Tab = "Overview" | "Accounts" | "KYC" | "Documents" | "Contact & address" | "Relationships" | "Audit";

function tabFrom(value?: string): Tab {
  const normalized = value?.toLowerCase();
  if (normalized === "accounts") return "Accounts";
  if (normalized === "kyc") return "KYC";
  if (normalized === "documents") return "Documents";
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
  const customerKycCases = activeTab === "KYC" ? (await listKycCases()).filter((item) => item.customerNumber === customerNumber) : [];
  const latestKyc = customerKycCases[0] ? await getKycCase(customerKycCases[0].reference) : null;
  const currentUser = activeTab === "Documents" ? await getCurrentUser() : null;

  return (
    <AutomationPage name="customer-detail">
      <Breadcrumbs items={[{ label: "Customers", href: "/customers" }, { label: customer.customerNumber }]} />
      <section className="record-banner" data-bp="customer-record-header">
        <div><p>{labelEnum(customer.partyType)} customer · {customer.customerNumber} · <span className="mono" data-bp="customer-rim-number">{customer.rimNumber}</span></p><h1 dir="auto" data-bp="customer-display-name">{customer.displayName}</h1></div>
        <div className="record-banner-meta"><Badge tone={customer.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(customer.status)}</Badge><Badge tone={customer.kycStatus === "APPROVED" ? "positive" : "warning"}>KYC {labelEnum(customer.kycStatus)}</Badge><Link href={`/customers/${customer.customerNumber}/edit`} className="primary-button" data-bp="customer-edit">Edit customer</Link></div>
      </section>
      <CustomerTabs customerNumber={customer.customerNumber} active={activeTab} />

      {activeTab === "Overview" ? <div className="equal-columns">
        <Panel title="Basic details"><dl className="definition-grid"><div><dt>Customer number</dt><dd className="mono">{customer.customerNumber}</dd></div><div><dt>Short name</dt><dd dir="auto">{customer.shortName}</dd></div><div><dt>Date of birth / registration</dt><dd>{customer.dateOfBirth ? formatDate(customer.dateOfBirth) : customer.registrationNumber}</dd></div><div><dt>Nationality</dt><dd>{customer.nationality}</dd></div><div><dt>Residence</dt><dd>{customer.residenceCountry}</dd></div><div><dt>Language</dt><dd>{customer.language}</dd></div><div><dt>Sector</dt><dd dir="auto">{customer.sector}</dd></div><div><dt>Industry</dt><dd dir="auto">{customer.industry}</dd></div><div><dt>Tax ID</dt><dd>{customer.taxId}</dd></div></dl></Panel>
        <Panel title="Relationship and controls"><dl className="definition-grid"><div><dt>Branch</dt><dd>{customer.branchCode}</dd></div><div><dt>Relationship manager</dt><dd>{customer.relationshipManager}</dd></div><div><dt>Risk rating</dt><dd><Badge tone={customer.riskRating === "HIGH" ? "negative" : customer.riskRating === "MEDIUM" ? "warning" : "positive"}>{labelEnum(customer.riskRating)}</Badge></dd></div><div><dt>KYC status</dt><dd>{labelEnum(customer.kycStatus)}</dd></div><div><dt>Next KYC review</dt><dd>{formatDate(customer.kycReviewDate)}</dd></div><div><dt>Record updated</dt><dd>{formatDate(customer.updatedAt, true)}</dd></div></dl></Panel>
      </div> : null}

      {activeTab === "Accounts" ? <Panel title={`Accounts (${customer.accounts.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="customer-accounts-table"><thead><tr><th>Account</th><th>Product</th><th>Currency</th><th>Status</th><th className="numeric">Available balance</th></tr></thead><tbody>{customer.accounts.map((account) => <tr key={account.accountNumber}><td className="mono"><Link href={`/accounts/${account.accountNumber}`} data-bp={`customer-account-${account.accountNumber}`}>{account.accountNumber}</Link></td><td>{account.productName}</td><td>{account.currency}</td><td><Badge tone={account.status === "ACTIVE" ? "positive" : "warning"}>{labelEnum(account.status)}</Badge></td><td className="numeric">{formatMoney(account.availableBalance, account.currency)}</td></tr>)}</tbody></table></div></Panel> : null}

      {activeTab === "KYC" ? <div className="page-stack"><div className="equal-columns"><Panel title="KYC profile"><dl className="definition-grid"><div><dt>Status</dt><dd>{labelEnum(customer.kycStatus)}</dd></div><div><dt>Risk rating</dt><dd>{labelEnum(customer.riskRating)}</dd></div><div><dt>Review date</dt><dd>{formatDate(customer.kycReviewDate)}</dd></div><div><dt>CDD purpose</dt><dd>{latestKyc?.profile?.accountPurpose ?? "—"}</dd></div><div><dt>Source of funds</dt><dd>{latestKyc?.profile?.sourceOfFunds ?? "—"}</dd></div><div><dt>Source of wealth</dt><dd>{latestKyc?.profile?.sourceOfWealth ?? "—"}</dd></div></dl></Panel><Panel title={`Identity documents (${customer.identityDocuments.length})`}>{customer.identityDocuments.map((document) => <dl className="definition-grid" key={document.id}><div><dt>Type</dt><dd>{document.type}</dd></div><div><dt>Document reference</dt><dd className="mono">{document.documentReference}</dd></div><div><dt>Document number</dt><dd className="mono">{document.documentNumber}</dd></div><div><dt>Verification</dt><dd>{labelEnum(document.verificationStatus)}</dd></div><div><dt>Method</dt><dd>{document.verificationMethod ?? "—"}</dd></div><div><dt>Issued</dt><dd>{formatDate(document.issuedAt)}</dd></div><div><dt>Expires</dt><dd>{formatDate(document.expiresAt)}</dd></div></dl>)}</Panel></div><Panel title={`KYC case history (${customerKycCases.length})`}><table className="data-table" data-bp="customer-kyc-case-table"><thead><tr><th>Case</th><th>Type</th><th>Status</th><th>Risk score</th><th>Risk rating</th><th>Due</th></tr></thead><tbody>{customerKycCases.map((item) => <tr key={item.reference}><td className="mono"><Link href={`/kyc/${item.reference}`} data-bp={`customer-kyc-case-${item.reference}`}>{item.reference}</Link></td><td>{labelEnum(item.type)}</td><td>{labelEnum(item.status)}</td><td>{item.riskScore}</td><td>{labelEnum(item.riskRating)}</td><td>{formatDate(item.dueAt, true)}</td></tr>)}</tbody></table></Panel>{latestKyc ? <><Panel title="Screening history"><table className="data-table" data-bp="customer-screening-table"><thead><tr><th>Reference</th><th>Type</th><th>Outcome</th><th>Score</th><th>Resolution</th></tr></thead><tbody>{latestKyc.screenings.map((item) => <tr key={item.reference}><td className="mono">{item.reference}</td><td>{labelEnum(item.screeningType)}</td><td>{labelEnum(item.outcome)}</td><td>{item.matchScore}</td><td>{item.resolutionComment ?? "—"}</td></tr>)}</tbody></table></Panel><Panel title="Evidence and restrictions"><table className="data-table" data-bp="customer-kyc-evidence-table"><thead><tr><th>Evidence</th><th>Type</th><th>Verification</th><th>Expires</th></tr></thead><tbody>{latestKyc.evidence.map((item) => <tr key={item.reference}><td className="mono">{item.reference}</td><td>{labelEnum(item.evidenceType)}</td><td>{labelEnum(item.verificationStatus)}</td><td>{item.expiresAt ? formatDate(item.expiresAt) : "—"}</td></tr>)}</tbody></table><table className="data-table" data-bp="customer-restrictions-table"><thead><tr><th>Restriction</th><th>Type</th><th>Reason</th><th>Active</th></tr></thead><tbody>{latestKyc.restrictions.map((item) => <tr key={item.reference}><td className="mono">{item.reference}</td><td>{labelEnum(item.type)}</td><td>{item.reason}</td><td>{item.active ? "Yes" : "No"}</td></tr>)}</tbody></table></Panel></> : null}</div> : null}

      {activeTab === "Documents" ? <Panel title="Customer documents" description="Private Passport and National ID files. JPEG, PNG or PDF; maximum 4 MB."><CustomerDocuments customerNumber={customer.customerNumber} documents={customer.documents} uploadPrefix={documentBlobPrefix()} canEdit={Boolean(currentUser && hasPermission(currentUser.role, "KYC_GATHER"))} /></Panel> : null}

      {activeTab === "Contact & address" ? <div className="equal-columns"><Panel title="Addresses">{customer.addresses.map((address) => <dl className="definition-grid" key={address.id}><div><dt>Type</dt><dd>{address.type}</dd></div><div className="span-2"><dt>Address</dt><dd dir="auto" data-bp={`customer-address-${address.id}`}>{[address.line1, address.line2, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ")}</dd></div></dl>)}</Panel><Panel title="Contact points"><table className="data-table" data-bp="customer-contact-table"><thead><tr><th>Type</th><th>Value</th><th>Preferred</th></tr></thead><tbody>{customer.contacts.map((contact) => <tr key={contact.id}><td>{contact.type}</td><td dir="ltr">{contact.value}</td><td>{contact.preferred ? "Yes" : "No"}</td></tr>)}</tbody></table></Panel></div> : null}

      {activeTab === "Relationships" ? <Panel title={`Relationships (${customer.relationships.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="customer-relationships-table"><thead><tr><th>Related customer</th><th>Name</th><th>Relationship</th><th>Control type</th><th>Ownership</th><th>Beneficial owner</th><th>Verification</th></tr></thead><tbody>{customer.relationships.map((relationship) => <tr key={relationship.id}><td className="mono"><Link href={`/customers/${relationship.relatedCustomerNumber}`} data-bp={`relationship-${relationship.relatedCustomerNumber}`}>{relationship.relatedCustomerNumber}</Link></td><td dir="auto">{relationship.relatedDisplayName}</td><td>{relationship.relationshipType}</td><td>{relationship.controlType ?? "—"}</td><td>{relationship.ownershipPercent ? `${relationship.ownershipPercent}%` : "—"}</td><td>{relationship.beneficialOwner ? "Yes" : "No"}</td><td>{labelEnum(relationship.verificationStatus)}</td></tr>)}</tbody></table>{customer.relationships.length === 0 ? <div className="empty-state">No customer relationships recorded.</div> : null}</div></Panel> : null}

      {activeTab === "Audit" ? <Panel title={`Audit events (${customerAudit.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="customer-audit-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Reference</th><th>Correlation ID</th></tr></thead><tbody>{customerAudit.map((event) => <tr key={event.id}><td>{formatDate(event.occurredAt, true)}</td><td>{event.actorUsername}</td><td>{labelEnum(event.action)}</td><td className="mono">{event.entityReference}</td><td className="mono">{event.correlationId}</td></tr>)}</tbody></table></div></Panel> : null}
    </AutomationPage>
  );
}
