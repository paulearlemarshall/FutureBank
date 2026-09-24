import { AppShell } from "@/components/banking/app-shell";
import { requireUser } from "@/lib/auth/session";
import { listBrandLogos } from "@/lib/branding";

export default async function BankingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const logos = await listBrandLogos();
  return <AppShell user={user} logos={logos}>{children}</AppShell>;
}
