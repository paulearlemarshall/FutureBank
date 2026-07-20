import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { PaymentForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import Link from "next/link";
import { formatDate, formatMoney } from "@/components/banking/format";
import { PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { submitPaymentAction } from "@/modules/actions/banking";
import { listAccounts, listBeneficiaries } from "@/modules/queries";
import { listPendingPayments } from "@/modules/operations-queries";
import { expirePendingPayments } from "@/modules/services/payments";

export const metadata: Metadata = { title: "Payments and transfers" };

export default async function PaymentsPage() {
  await expirePendingPayments();
  const [accounts, beneficiaries, pendingPayments] = await Promise.all([listAccounts({ limit: 100 }), listBeneficiaries({}), listPendingPayments()]);
  return <AutomationPage name="payments"><PageHeader eyebrow="Payment services" title="Payments and transfers" description="Post same-currency internal transfers or simulated external payments." /><StatusRegion id="payment-guidance">Risk-based external payments create a 24-hour hold and enter the independent approval queue. No ledger movement occurs until approval.</StatusRegion><Panel title={`Pending approvals (${pendingPayments.length})`}><table className="data-table" data-bp="pending-payments-table"><thead><tr><th>Reference</th><th>Customer</th><th>Debit account</th><th>Beneficiary</th><th className="numeric">Amount</th><th>Reason</th><th>Created</th><th>Expires</th></tr></thead><tbody>{pendingPayments.map((payment) => <tr key={payment.reference}><td className="mono"><Link href={`/payments/${payment.reference}`} data-bp={`pending-payment-${payment.reference}`}>{payment.reference}</Link></td><td>{payment.customerNumber} · {payment.customerName}</td><td className="mono">{payment.sourceAccountNumber}</td><td>{payment.destinationReference}</td><td className="numeric">{formatMoney(payment.amount, payment.currency)}</td><td>{payment.approvalReason ?? "—"}</td><td>{formatDate(payment.createdAt, true)}</td><td>{payment.expiresAt ? formatDate(payment.expiresAt, true) : "—"}</td></tr>)}</tbody></table>{pendingPayments.length === 0 ? <p>No pending payment approvals.</p> : null}</Panel><Panel title="Payment instruction" description="Immediate postings and approvals update balances and ledger entries atomically"><PaymentForm action={submitPaymentAction} accounts={accounts} beneficiaries={beneficiaries} idempotencyKey={randomUUID()} /></Panel></AutomationPage>;
}
