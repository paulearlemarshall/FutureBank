import type { Metadata } from "next";
import Link from "next/link";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { Badge, Metric, PageHeader, Panel } from "@/components/banking/ui";
import { getDashboardSummary } from "@/modules/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  return (
    <AutomationPage name="dashboard">
      <PageHeader eyebrow="Operations workspace" title="Banking overview" description="Live demonstration data from FutureBank Core." />
      <div className="metrics-grid">
        <Metric label="Customers" value={String(summary.customers)} detail="Retail and business" bp="metric-customers" />
        <Metric label="Active accounts" value={String(summary.activeAccounts)} detail="Across four currencies" bp="metric-accounts" />
        <Metric label="Total deposits" value={formatMoney(summary.totalDeposits)} detail="GBP equivalent demo value" bp="metric-deposits" />
        <Metric label="KYC reviews" value={String(summary.pendingKycReviews)} detail="Due or in review" bp="metric-kyc" />
        <Metric label="Payments today" value={String(summary.paymentsToday)} detail="Booked transactions" bp="metric-payments" />
        <Metric label="Open work" value={String(summary.openWorkItems)} detail="Approval and intervention queue" bp="metric-open-work" />
        <Metric label="Pending payments" value={String(summary.pendingPayments)} detail="Funds reserved on hold" bp="metric-pending-payments" />
        <Metric label="Overdraft exposure" value={formatMoney(summary.overdraftExposure)} detail="Approved active and suspended limits" bp="metric-overdraft-exposure" />
        <Metric label="Repeat-use alerts" value={String(summary.repeatUseAlerts)} detail="FutureBank demo policy" bp="metric-repeat-use" />
      </div>
      <div className="two-column">
        <Panel title="Recent activity" description="Latest controlled actions across the core system">
          <div style={{ margin: "-16px" }}>
            <table className="data-table" data-bp="dashboard-activity-table">
              <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Operator</th></tr></thead>
              <tbody>{summary.recentActivity.map((event) => <tr key={event.id}><td>{formatDate(event.occurredAt, true)}</td><td><Badge tone="info">{labelEnum(event.action)}</Badge></td><td className="mono">{event.entityReference}</td><td>{event.actorUsername}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Quick actions" description="Common operator workflows">
          <div className="quick-actions">
            <Link href="/customers" data-bp="quick-find-customer"><strong>Find customer</strong><small>Search profiles and KYC</small></Link>
            <Link href="/customers/new" data-bp="quick-new-customer"><strong>New customer</strong><small>Create a retail or SME record</small></Link>
            <Link href="/accounts/new" data-bp="quick-open-account"><strong>Open account</strong><small>Select an eligible product</small></Link>
            <Link href="/payments" data-bp="quick-new-payment"><strong>New payment</strong><small>Internal or simulated external</small></Link>
            <Link href="/work-queue" data-bp="quick-work-queue"><strong>Work queue</strong><small>Claim and decide controlled work</small></Link>
            <Link href="/kyc" data-bp="quick-kyc"><strong>KYC operations</strong><small>CDD, evidence and fictional screening</small></Link>
            <Link href="/overdrafts" data-bp="quick-overdrafts"><strong>Arranged overdrafts</strong><small>Facilities, utilization and alerts</small></Link>
          </div>
        </Panel>
      </div>
    </AutomationPage>
  );
}
