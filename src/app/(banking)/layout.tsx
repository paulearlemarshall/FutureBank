import { AppShell } from "@/components/banking/app-shell";
import { requireUser } from "@/lib/auth/session";

export default async function BankingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
