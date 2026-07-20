import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { Breadcrumbs, PageHeader, Panel } from "@/components/banking/ui";
import { updateCustomerAction } from "@/modules/actions/banking";
import { getCustomer } from "@/modules/queries";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ customerNumber: string }> }) {
  const { customerNumber } = await params;
  const customer = await getCustomer(customerNumber);
  if (!customer) notFound();
  const action = updateCustomerAction.bind(null, customerNumber);
  return (
    <AutomationPage name="customer-edit">
      <Breadcrumbs items={[{ label: "Customers", href: "/customers" }, { label: customer.customerNumber, href: `/customers/${customer.customerNumber}` }, { label: "Edit" }]} />
      <PageHeader eyebrow={customer.customerNumber} title={`Edit ${customer.displayName}`} description="Changes are recorded in the immutable audit trail." />
      <Panel title="Customer details"><CustomerForm action={action} customer={customer} /></Panel>
    </AutomationPage>
  );
}
