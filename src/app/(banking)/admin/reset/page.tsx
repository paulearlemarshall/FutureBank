import type { Metadata } from "next";
import { ResetForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { PageHeader, Panel, StatusRegion } from "@/components/banking/ui";
import { requireRole } from "@/lib/auth/session";
import { resetDemoAction } from "@/modules/actions/banking";

export const metadata: Metadata = { title: "Reset demo" };

export default async function ResetPage() {
  await requireRole("ADMIN");
  return <AutomationPage name="admin-reset"><PageHeader eyebrow="Administration" title="Reset demonstration data" description="Restore the deterministic FutureBank baseline." /><StatusRegion id="reset-warning" tone="warning">This replaces all mutable banking-domain data. Authentication users and active sessions are preserved.</StatusRegion><Panel title="Reset baseline" description="The reset is protected by an exclusive database lock"><ul className="note-list"><li>Restores exactly five fictional customers and fourteen accounts.</li><li>Restores at least twenty-five transaction entries per seeded account.</li><li>Restores beneficiaries, relationships, KYC details and loan repayment schedules.</li><li>Removes customer, account and payment records created since the last reset.</li></ul><ResetForm action={resetDemoAction} /></Panel></AutomationPage>;
}
