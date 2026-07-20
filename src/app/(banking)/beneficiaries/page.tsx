import type { Metadata } from "next";
import { BeneficiaryForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { formatDate } from "@/components/banking/format";
import { Badge, PageHeader, Panel } from "@/components/banking/ui";
import { createBeneficiaryAction } from "@/modules/actions/banking";
import { listBeneficiaries, listCustomers } from "@/modules/queries";

export const metadata: Metadata = { title: "Beneficiaries" };

export default async function BeneficiariesPage({ searchParams }: { searchParams: Promise<{ customerNumber?: string }> }) {
  const { customerNumber } = await searchParams;
  const [beneficiaries, customers] = await Promise.all([listBeneficiaries({ customerNumber }), listCustomers({ limit: 100 })]);
  return <AutomationPage name="beneficiaries"><PageHeader eyebrow="Payments" title="Beneficiaries" description="Maintain approved external payment recipients." /><div className="two-column"><Panel title={`Beneficiaries (${beneficiaries.length})`}><div style={{ margin: "-16px" }}><table className="data-table" data-bp="beneficiary-table"><thead><tr><th>Customer</th><th>Name</th><th>Bank</th><th>Account / IBAN</th><th>Currency</th><th>Status</th><th>Created</th></tr></thead><tbody>{beneficiaries.map((beneficiary) => <tr key={beneficiary.id} data-bp={`beneficiary-row-${beneficiary.id}`}><td className="mono">{beneficiary.customerNumber}</td><td><strong>{beneficiary.name}</strong></td><td>{beneficiary.bankName}</td><td className="mono">{beneficiary.iban || beneficiary.accountNumber}</td><td>{beneficiary.currency}</td><td><Badge tone={beneficiary.status === "ACTIVE" ? "positive" : "warning"}>{beneficiary.status}</Badge></td><td>{formatDate(beneficiary.createdAt)}</td></tr>)}</tbody></table></div></Panel><Panel title="Add beneficiary" description="Create an active external recipient"><BeneficiaryForm action={createBeneficiaryAction} customers={customers} /></Panel></div></AutomationPage>;
}
