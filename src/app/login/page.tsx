import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/banking/action-forms";
import { AutomationPage } from "@/components/banking/automation-page";
import { getCurrentUser } from "@/lib/auth/session";
import { loginAction } from "@/modules/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <AutomationPage name="login">
      <div className="login-page">
        <header className="login-header">
          <Link className="brand" href="/login" data-bp="login-brand">
            <span className="brand-mark" aria-hidden="true">FB</span>
            <span><strong>FutureBank</strong><small>CORE OPERATIONS</small></span>
          </Link>
        </header>
        <main className="login-main">
          <section className="login-card" aria-labelledby="login-title">
            <header>
              <h1 id="login-title">Core banking sign in</h1>
              <p>Authorised demonstration users only</p>
            </header>
            <LoginForm action={loginAction} />
          </section>
        </main>
        <footer className="login-footer"><span>FutureBank Core demonstration system</span><span>Do not enter real customer data</span></footer>
      </div>
    </AutomationPage>
  );
}
