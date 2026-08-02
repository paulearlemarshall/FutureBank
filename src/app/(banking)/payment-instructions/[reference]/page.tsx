import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate, formatMoney, labelEnum } from "@/components/banking/format";
import { PaymentInstructionCancellationForm } from "@/components/banking/payment-instruction-forms";
import { Badge, Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { cancelPaymentInstructionAction } from "@/modules/actions/payment-instructions";
import { hasPermission } from "@/modules/domain/auth-policy";
import { getPaymentInstruction } from "@/modules/operations-queries";

export const metadata: Metadata = { title: "Payment instruction" };

export default async function PaymentInstructionPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [actor, instruction] = await Promise.all([requireUser(), getPaymentInstruction(reference)]);
  if (!instruction) notFound();
  const cancellable = ["ACTIVE", "PAUSED"].includes(instruction.status) && hasPermission(actor.role, "PAYMENT_INSTRUCTION_MAINTAIN");
  return (
    <AutomationPage name="payment-instruction-detail">
      <Breadcrumbs items={[{ label: "Payments", href: "/payments" }, { label: instruction.reference }]} />
      <PageHeader eyebrow={labelEnum(instruction.type)} title={instruction.reference} description={instruction.description} actions={<Badge tone={instruction.status === "ACTIVE" ? "positive" : instruction.status === "FAILED" ? "negative" : "neutral"}>{labelEnum(instruction.status)}</Badge>} />
      <StatusRegion id="payment-instruction-guidance">This instruction does not reserve funds. Execution applies current controls and creates a separate payment order.</StatusRegion>
      <Panel title="Instruction details">
        <dl className="detail-grid" data-bp="payment-instruction-details"><div><dt>Customer</dt><dd><Link href={`/customers/${instruction.customerNumber}`}>{instruction.customerNumber} · {instruction.customerName}</Link></dd></div><div><dt>Debit account</dt><dd className="mono"><Link href={`/accounts/${instruction.sourceAccountNumber}`}>{instruction.sourceAccountNumber}</Link></dd></div><div><dt>Destination</dt><dd>{instruction.destinationReference}</dd></div><div><dt>Amount</dt><dd>{formatMoney(instruction.amount, instruction.currency)}</dd></div><div><dt>Frequency</dt><dd>{labelEnum(instruction.frequency)}</dd></div><div><dt>First execution</dt><dd>{formatDate(instruction.startDate)}</dd></div><div><dt>Next execution</dt><dd>{formatDate(instruction.nextExecutionDate)}</dd></div><div><dt>End date</dt><dd>{instruction.endDate ? formatDate(instruction.endDate) : "No end date"}</dd></div><div><dt>Created by</dt><dd className="mono">{instruction.createdBy}</dd></div><div><dt>Version</dt><dd>{instruction.version}</dd></div></dl>
        {instruction.cancellationReason ? <StatusRegion id="payment-instruction-cancellation">Cancelled: {instruction.cancellationReason}</StatusRegion> : null}
      </Panel>
      <Panel title={`Execution history (${instruction.executions.length})`}>
        <table className="data-table" data-bp="payment-instruction-executions-table"><thead><tr><th>Scheduled for</th><th>Status</th><th>Payment</th><th>Attempted</th><th>Completed</th><th>Failure</th></tr></thead><tbody>{instruction.executions.map((execution) => <tr key={`${execution.scheduledFor}-${execution.attemptedAt}`}><td>{formatDate(execution.scheduledFor)}</td><td>{labelEnum(execution.status)}</td><td className="mono">{execution.paymentReference ? <Link href={`/payments/${execution.paymentReference}`}>{execution.paymentReference}</Link> : "—"}</td><td>{formatDate(execution.attemptedAt, true)}</td><td>{execution.completedAt ? formatDate(execution.completedAt, true) : "—"}</td><td>{execution.failureMessage ?? "—"}</td></tr>)}</tbody></table>
        {instruction.executions.length === 0 ? <p>No execution attempts yet.</p> : null}
      </Panel>
      {cancellable ? <Panel title="Cancel instruction"><PaymentInstructionCancellationForm action={cancelPaymentInstructionAction} reference={instruction.reference} version={instruction.version} /></Panel> : null}
    </AutomationPage>
  );
}
