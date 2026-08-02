import type { Metadata } from "next";
import { AutomationPage } from "@/components/banking/automation-page";
import { LoanApplicationForm } from "@/components/banking/loan-origination-forms";
import { Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireUser } from "@/lib/auth/session";
import { submitLoanApplicationAction } from "@/modules/actions/loan-originations";
import { hasPermission } from "@/modules/domain/auth-policy";
import { listAccounts, listCustomers, listProducts } from "@/modules/queries";

export const metadata: Metadata = { title: "New loan application" };

export default async function NewLoanApplicationPage() {
  const firstPayment = new Date(); firstPayment.setUTCDate(firstPayment.getUTCDate() + 30);
  const [actor, customers, products, accounts] = await Promise.all([requireUser(), listCustomers({ limit: 100 }), listProducts(), listAccounts({ limit: 100 })]);
  const permitted = hasPermission(actor.role, "LOAN_ORIGINATION_INITIATE");
  return <AutomationPage name="loan-application"><Breadcrumbs items={[{ label: "Loan origination", href: "/loans" }, { label: "New application" }]} />
    <PageHeader eyebrow="Lending operations" title="New loan application" description="Capture fictional affordability evidence and submit an exact loan proposal for independent approval." />
    <StatusRegion id="loan-application-guidance">FutureBank permits 6–60 month loans between 1,000.00 and 1,000,000.00 with total debt service at or below 40%.</StatusRegion>
    {permitted ? <Panel title="Application details" description="Product pricing is snapshotted at submission and revalidated before booking."><LoanApplicationForm action={submitLoanApplicationAction} customers={customers} products={products} accounts={accounts} firstPaymentDate={firstPayment.toISOString().slice(0, 10)} idempotencyKey={crypto.randomUUID()} /></Panel> : <StatusRegion id="loan-application-forbidden" tone="warning">Your role cannot submit loan applications.</StatusRegion>}
  </AutomationPage>;
}
