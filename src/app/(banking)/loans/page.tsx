import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/modules/domain/auth-policy";
import { listLoanApplications } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Loan origination" };

export default async function LoanRegisterPage() {
  const [actor, applications] = await Promise.all([requireUser(), listLoanApplications()]);
  return <AutomationPage name="loan-register"><PageHeader eyebrow="Lending operations" title="Loan origination" description="Affordability-controlled applications, independent decisions, exact schedules, and atomic disbursement." actions={hasPermission(actor.role, "LOAN_ORIGINATION_INITIATE") ? <Link href="/loans/new" className="primary-button" data-bp="loan-new">New application</Link> : undefined} />
    <StatusRegion id="loan-policy-notice">Approvals recheck current KYC, restrictions, product and destination eligibility. Approved loans post once to the subledger and general ledger before funds become available.</StatusRegion>
    <Panel title={`Applications (${applications.length})`}><table className="data-table" data-bp="loan-application-table"><thead><tr><th>Reference</th><th>Customer</th><th>Product</th><th>Status</th><th className="numeric">Principal</th><th>Term</th><th className="numeric">Projected first payment</th><th className="numeric">DSR</th><th>First payment</th><th>Loan account</th></tr></thead><tbody>{applications.map((application) => <tr key={application.reference} data-bp={`loan-row-${application.reference}`}><td className="mono"><Link href={`/loans/${application.reference}`} data-bp={`loan-link-${application.reference}`}>{application.reference}</Link></td><td><Link href={`/customers/${application.customerNumber}`}>{application.customerNumber} · {application.customerName}</Link></td><td className="mono">{application.productCode}</td><td><Badge tone={application.status === "APPROVED" ? "positive" : application.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(application.status)}</Badge></td><td className="numeric">{formatMoney(application.principal, application.currency)}</td><td>{application.termMonths} months</td><td className="numeric">{formatMoney(application.projectedInstallment, application.currency)}</td><td className="numeric">{application.debtServiceRatio}%</td><td>{formatDate(application.firstPaymentDate)}</td><td className="mono">{application.loanAccountNumber ? <Link href={`/accounts/${application.loanAccountNumber}`}>{application.loanAccountNumber}</Link> : "—"}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
