import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { listKycCases } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "KYC operations" };

export default async function KycRegisterPage() {
  const cases = await listKycCases();
  return <AutomationPage name="kyc-register"><PageHeader eyebrow="Compliance operations" title="KYC case register" description="Customer due diligence, fictional screening, evidence and decisions." />
    <StatusRegion id="fictional-screening-notice" tone="info">All watchlists, candidates, screening results and evidence metadata in this demonstration are fictional.</StatusRegion>
    <Panel title={`KYC cases (${cases.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="kyc-case-table"><thead><tr><th>Case</th><th>Customer</th><th>Type</th><th>Jurisdiction</th><th>Status</th><th>Lock</th><th>Risk score</th><th>Risk rating</th><th>EDD</th><th>Due</th></tr></thead><tbody>{cases.map((item) => <tr key={item.reference} data-bp={`kyc-case-row-${item.reference}`}><td className="mono"><Link href={`/kyc/${item.reference}`} data-bp={`kyc-case-link-${item.reference}`}>{item.reference}</Link></td><td><Link href={`/customers/${item.customerNumber}`}>{item.customerNumber} · {item.customerName}</Link></td><td>{labelEnum(item.type)}</td><td>{item.jurisdiction}</td><td><Badge tone={item.status === "APPROVED" ? "positive" : item.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(item.status)}</Badge></td><td><Badge tone={item.locked ? "negative" : "positive"}>{item.locked ? "Locked" : "Open"}</Badge></td><td className="numeric">{item.riskScore}</td><td><Badge tone={item.riskRating === "HIGH" ? "negative" : item.riskRating === "MEDIUM" ? "warning" : "positive"}>{labelEnum(item.riskRating)}</Badge></td><td>{item.enhancedDueDiligence ? "Yes" : "No"}</td><td>{formatDate(item.dueAt, true)}</td></tr>)}</tbody></table></div></Panel>
  </AutomationPage>;
}
