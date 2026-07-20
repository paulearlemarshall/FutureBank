import type { Metadata } from "next";
import { AutomationPage } from "@/components/banking/automation-page";
import { OverdraftApplicationForm } from "@/components/banking/operations-forms";
import { Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { applyForOverdraftAction } from "@/modules/actions/overdrafts";
import { listAccounts } from "@/modules/queries";

export const metadata: Metadata = { title: "New overdraft application" };

export default async function NewOverdraftPage() {
  const accounts = await listAccounts({ limit: 200 });
  return <AutomationPage name="overdraft-application"><Breadcrumbs items={[{ label: "Arranged overdrafts", href: "/overdrafts" }, { label: "New application" }]} /><PageHeader title="New arranged overdraft" description="KYC and eligibility are rechecked when submitted and independently approved." /><StatusRegion id="overdraft-application-policy">Only active current accounts with approved KYC and no debit restriction are eligible.</StatusRegion><Panel title="Application and affordability"><OverdraftApplicationForm action={applyForOverdraftAction} accounts={accounts} /></Panel></AutomationPage>;
}
