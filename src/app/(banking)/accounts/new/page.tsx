import type { Metadata } from "next";
import { OpenAccountForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { openAccountAction } from "@/modules/actions/banking";
import { listCustomers, listProducts } from "@/modules/queries";

export const metadata: Metadata = { title: "Open account" };

export default async function OpenAccountPage() {
  const [customers, products] = await Promise.all([listCustomers({ limit: 100 }), listProducts()]);
  return <AutomationPage name="account-new"><Breadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: "Open account" }]} /><PageHeader eyebrow="Account management" title="Open account" description="Create a new deposit account for an existing customer." /><StatusRegion id="account-guidance">Loan products are maintained as seeded read-only facilities and cannot be originated here.</StatusRegion><Panel title="Account instructions"><OpenAccountForm action={openAccountAction} customers={customers} products={products} /></Panel></AutomationPage>;
}
