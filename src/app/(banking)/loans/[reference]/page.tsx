import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { LoanApplicationDecisionForm } from "@/components/banking/loan-origination-forms";
import { Badge, Breadcrumbs, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { decideLoanApplicationAction } from "@/modules/actions/loan-originations";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getLoanApplication } from "@/modules/operations-queries";
import { minorUnitsToMoney, moneyToMinorUnits } from "@/modules/domain/transfer-policy";

export const metadata: Metadata = { title: "Loan application" };

export default async function LoanApplicationPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [application, actor] = await Promise.all([getLoanApplication(reference), requireUser()]);
  if (!application) notFound();
  const activeWork = application.workItem && ["OPEN", "ASSIGNED"].includes(application.workItem.status) ? application.workItem : null;
  return <AutomationPage name="loan-application-detail"><Breadcrumbs items={[{ label: "Loan origination", href: "/loans" }, { label: reference }]} />
    <section className="record-banner" data-bp="loan-record-header"><div><p>Loan application · {application.currency}</p><h1>{application.reference}</h1></div><div className="record-banner-meta"><span>{application.customerNumber}</span><Badge tone={application.status === "APPROVED" ? "positive" : application.status === "REJECTED" ? "negative" : "warning"}>{labelEnum(application.status)}</Badge></div></section>
    {application.status === "APPROVED" ? <StatusRegion id="loan-booking-status" tone="success">Booked once as {application.originationTransactionReference}; disbursed to {application.destinationAccountNumber} and recorded as loan account {application.loanAccountNumber}.</StatusRegion> : null}
    <div className="metrics-grid"><div className="metric" data-bp="loan-metric-principal"><span>Principal</span><strong>{formatMoney(application.principal, application.currency)}</strong><small>{application.productCode}</small></div><div className="metric" data-bp="loan-metric-installment"><span>Projected first payment</span><strong>{formatMoney(application.projectedInstallment, application.currency)}</strong><small>Declining interest thereafter</small></div><div className="metric" data-bp="loan-metric-dsr"><span>Debt-service ratio</span><strong>{application.debtServiceRatio}%</strong><small>Maximum 40.00%</small></div><div className="metric" data-bp="loan-metric-term"><span>Term</span><strong>{application.termMonths} months</strong><small>{application.annualInterestRate}% annual</small></div></div>
    <div className="two-column"><Panel title="Application"><dl className="definition-grid"><div><dt>Customer</dt><dd><Link href={`/customers/${application.customerNumber}`}>{application.customerNumber} · {application.customerName}</Link></dd></div><div><dt>Disbursement</dt><dd><Link href={`/accounts/${application.destinationAccountNumber}`}>{application.destinationAccountNumber}</Link></dd></div><div><dt>First payment</dt><dd>{formatDate(application.firstPaymentDate)}</dd></div><div><dt>Risk grade</dt><dd>{application.riskGrade}</dd></div><div><dt>Monthly income</dt><dd>{formatMoney(application.monthlyIncome, application.currency)}</dd></div><div><dt>Existing commitments</dt><dd>{formatMoney(application.monthlyCommitments, application.currency)}</dd></div><div><dt>Submitted by</dt><dd>{application.submittedBy}</dd></div><div><dt>Version</dt><dd>{application.version}</dd></div></dl><p>{application.purpose}</p></Panel><Panel title="Decision evidence"><dl className="definition-grid"><div><dt>Decided by</dt><dd>{application.decidedBy ?? "—"}</dd></div><div><dt>Decided at</dt><dd>{application.decidedAt ? formatDate(application.decidedAt, true) : "—"}</dd></div><div><dt>Work item</dt><dd>{application.workItem ? <Link href={`/work-queue/${application.workItem.reference}`}>{application.workItem.reference}</Link> : "—"}</dd></div></dl><p>{application.decisionComment ?? "No decision recorded."}</p></Panel></div>
    {activeWork && hasPermission(actor.role, "LOAN_ORIGINATION_DECIDE") ? <Panel title="Independent decision" description="Approval atomically creates the read-only loan account, exact schedule, balanced subledger transaction, general-ledger journal, and destination credit."><LoanApplicationDecisionForm action={decideLoanApplicationAction} applicationReference={application.reference} workItem={activeWork} /></Panel> : null}
    <Panel title={`Repayment schedule (${application.schedule.length})`}><table className="data-table" data-bp="loan-schedule-table"><thead><tr><th>Sequence</th><th>Due date</th><th className="numeric">Principal</th><th className="numeric">Interest</th><th className="numeric">Total</th><th>Status</th><th>Paid</th></tr></thead><tbody>{application.schedule.map((line, index) => <tr key={`${line.dueDate}-${index}`} data-bp={`loan-schedule-row-${line.sequence ?? index + 1}`}><td>{line.sequence ?? index + 1}</td><td>{formatDate(line.dueDate)}</td><td className="numeric">{formatMoney(line.principal, application.currency)}</td><td className="numeric">{formatMoney(line.interest, application.currency)}</td><td className="numeric">{formatMoney(minorUnitsToMoney(moneyToMinorUnits(line.principal) + moneyToMinorUnits(line.interest)), application.currency)}</td><td>{labelEnum(line.status)}</td><td>{line.paidAt ? formatDate(line.paidAt) : "—"}</td></tr>)}</tbody></table></Panel>
  </AutomationPage>;
}
