import type { Metadata } from "next";
import { CustomerForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { Breadcrumbs, PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { createCustomerAction } from "@/modules/actions/banking";

export const metadata: Metadata = { title: "New customer" };

export default function NewCustomerPage() {
  return (
    <AutomationPage name="customer-new">
      <Breadcrumbs items={[{ label: "Customers", href: "/customers" }, { label: "New customer" }]} />
      <PageHeader eyebrow="Customer relationship" title="Create customer" description="Create a fictional retail or business customer record." />
      <StatusRegion id="customer-guidance" tone="info">Fields marked with an asterisk are required. Use fictional information only.</StatusRegion>
      <Panel title="Basic details" description="Core identity, classification and primary contact information"><CustomerForm action={createCustomerAction} /></Panel>
    </AutomationPage>
  );
}
