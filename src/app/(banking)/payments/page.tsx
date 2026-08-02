import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { PaymentForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { PaymentInstructionForm, PaymentInstructionRunForm } from "@/components/banking/payment-instruction-forms";
import { Badge, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { submitPaymentAction } from "@/modules/actions/banking";
import { createPaymentInstructionAction, runPaymentInstructionsAction } from "@/modules/actions/payment-instructions";
import { hasPermission } from "@/modules/domain/auth-policy";
import { listPaymentInstructionRuns, listPaymentInstructions, listPendingPayments } from "@/modules/operations-queries";
import { listAccounts, listBeneficiaries } from "@/modules/queries";
import { expirePendingPayments } from "@/modules/services/payments";

export const metadata: Metadata = { title: "Payments and transfers" };

export default async function PaymentsPage() {
  await expirePendingPayments();
  const actor = await requireUser();
  const [accounts, beneficiaries, pendingPayments, instructions, runs] = await Promise.all([
    listAccounts({ limit: 100 }),
    listBeneficiaries({}),
    listPendingPayments(),
    listPaymentInstructions(),
    listPaymentInstructionRuns(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <AutomationPage name="payments">
      <PageHeader eyebrow="Payment services" title="Payments and transfers" description="Post immediate transfers or manage future-dated and recurring payment instructions." />
      <StatusRegion id="payment-guidance">Instructions reserve no funds. Every due occurrence rechecks account, KYC, beneficiary, balance and approval controls before it can post.</StatusRegion>
      <Panel title={`Pending approvals (${pendingPayments.length})`}>
        <table className="data-table" data-bp="pending-payments-table"><thead><tr><th>Reference</th><th>Customer</th><th>Debit account</th><th>Beneficiary</th><th className="numeric">Amount</th><th>Reason</th><th>Created</th><th>Expires</th></tr></thead><tbody>{pendingPayments.map((payment) => <tr key={payment.reference}><td className="mono"><Link href={`/payments/${payment.reference}`} data-bp={`pending-payment-${payment.reference}`}>{payment.reference}</Link></td><td>{payment.customerNumber} · {payment.customerName}</td><td className="mono">{payment.sourceAccountNumber}</td><td>{payment.destinationReference}</td><td className="numeric">{formatMoney(payment.amount, payment.currency)}</td><td>{payment.approvalReason ?? "—"}</td><td>{formatDate(payment.createdAt, true)}</td><td>{payment.expiresAt ? formatDate(payment.expiresAt, true) : "—"}</td></tr>)}</tbody></table>
        {pendingPayments.length === 0 ? <p>No pending payment approvals.</p> : null}
      </Panel>
      <Panel title={`Payment instructions (${instructions.length})`} description="Future intent is stored separately from the payment order and ledger booking.">
        <table className="data-table" data-bp="payment-instructions-table"><thead><tr><th>Reference</th><th>Type</th><th>Customer</th><th>Debit account</th><th>Destination</th><th className="numeric">Amount</th><th>Frequency</th><th>Next execution</th><th>Status</th></tr></thead><tbody>{instructions.map((item) => <tr key={item.reference} data-bp={`payment-instruction-row-${item.reference}`}><td className="mono"><Link href={`/payment-instructions/${item.reference}`} data-bp={`payment-instruction-link-${item.reference}`}>{item.reference}</Link></td><td>{labelEnum(item.type)}</td><td>{item.customerNumber} · {item.customerName}</td><td className="mono">{item.sourceAccountNumber}</td><td>{item.destinationReference}</td><td className="numeric">{formatMoney(item.amount, item.currency)}</td><td>{labelEnum(item.frequency)}</td><td>{formatDate(item.nextExecutionDate)}</td><td><Badge tone={item.status === "ACTIVE" ? "positive" : item.status === "FAILED" ? "negative" : "neutral"}>{labelEnum(item.status)}</Badge></td></tr>)}</tbody></table>
      </Panel>
      {hasPermission(actor.role, "PAYMENT_INSTRUCTION_MAINTAIN") ? <Panel title="Create payment instruction" description="Creation records intent only; funds remain available until an occurrence executes."><PaymentInstructionForm action={createPaymentInstructionAction} accounts={accounts} beneficiaries={beneficiaries} today={today} /></Panel> : null}
      {hasPermission(actor.role, "PAYMENT_SCHEDULE_EXECUTE") ? <Panel title="Instruction processing" description="Runs are idempotent per instruction and scheduled date."><PaymentInstructionRunForm action={runPaymentInstructionsAction} businessDate={today} /><table className="data-table" data-bp="payment-instruction-runs-table"><thead><tr><th>Run</th><th>Business date</th><th>Status</th><th className="numeric">Attempted</th><th className="numeric">Booked</th><th className="numeric">Pending</th><th className="numeric">Failed</th><th>Started</th></tr></thead><tbody>{runs.map((run) => <tr key={run.reference}><td className="mono">{run.reference}</td><td>{formatDate(run.businessDate)}</td><td>{labelEnum(run.status)}</td><td className="numeric">{run.attempted}</td><td className="numeric">{run.booked}</td><td className="numeric">{run.pending}</td><td className="numeric">{run.failed}</td><td>{formatDate(run.startedAt, true)}</td></tr>)}</tbody></table></Panel> : null}
      <Panel title="Immediate payment" description="Immediate postings and approvals update balances and ledger entries atomically"><PaymentForm action={submitPaymentAction} accounts={accounts} beneficiaries={beneficiaries} idempotencyKey={randomUUID()} /></Panel>
    </AutomationPage>
  );
}
