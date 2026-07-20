import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { listOverdraftFacilities } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Arranged overdrafts" };

export default async function OverdraftRegisterPage() {
  const facilities = await listOverdraftFacilities();
  return <AutomationPage name="overdraft-register"><PageHeader eyebrow="Lending operations" title="Arranged overdrafts" description="Applications, approved limits, utilization, headroom and monitoring." actions={<Link href="/overdrafts/new" className="primary-button" data-bp="overdraft-new">New application</Link>} />
    <StatusRegion id="overdraft-policy-notice">Only arranged borrowing is supported. Utilization and repeat-use triggers are FutureBank demonstration policy.</StatusRegion>
    <Panel title={`Facilities (${facilities.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="overdraft-facility-table"><thead><tr><th>Facility</th><th>Account</th><th>Customer</th><th>Status</th><th className="numeric">Requested</th><th className="numeric">Approved</th><th className="numeric">Utilization</th><th className="numeric">Headroom</th><th>Review</th></tr></thead><tbody>{facilities.map((item) => <tr key={item.reference} data-bp={`overdraft-row-${item.reference}`}><td className="mono"><Link href={`/overdrafts/${item.reference}`} data-bp={`overdraft-link-${item.reference}`}>{item.reference}</Link></td><td className="mono"><Link href={`/accounts/${item.accountNumber}`}>{item.accountNumber}</Link></td><td><Link href={`/customers/${item.customerNumber}`}>{item.customerNumber} · {item.customerName}</Link></td><td><Badge tone={item.status === "ACTIVE" ? "positive" : item.status === "SUSPENDED" || item.status === "DECLINED" ? "negative" : "warning"}>{labelEnum(item.status)}</Badge></td><td className="numeric">{formatMoney(item.requestedLimit, item.currency)}</td><td className="numeric">{formatMoney(item.approvedLimit, item.currency)}</td><td className="numeric">{formatMoney(item.utilization, item.currency)}</td><td className="numeric">{formatMoney(item.headroom, item.currency)}</td><td>{item.reviewDate ? formatDate(item.reviewDate) : "—"}</td></tr>)}</tbody></table></div></Panel>
  </AutomationPage>;
}
