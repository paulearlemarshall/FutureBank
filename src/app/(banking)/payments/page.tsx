import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { PaymentForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { submitPaymentAction } from "@/modules/actions/banking";
import { listAccounts, listBeneficiaries } from "@/modules/queries";

export const metadata: Metadata = { title: "Payments and transfers" };

export default async function PaymentsPage() {
  const [accounts, beneficiaries] = await Promise.all([listAccounts({ limit: 100 }), listBeneficiaries({})]);
  return <AutomationPage name="payments"><PageHeader eyebrow="Payment services" title="Payments and transfers" description="Post same-currency internal transfers or simulated external payments." /><StatusRegion id="payment-guidance">Internal transfers require matching currencies. External payments are posted against the FutureBank clearing account.</StatusRegion><Panel title="Payment instruction" description="Funds and ledger entries are updated atomically"><PaymentForm action={submitPaymentAction} accounts={accounts} beneficiaries={beneficiaries} idempotencyKey={randomUUID()} /></Panel></AutomationPage>;
}
