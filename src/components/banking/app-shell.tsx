import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/modules/actions/auth";
import type { SessionUser } from "@/modules/contracts";

const navGroups = [
  {
    label: "Workspace",
    items: [
      ["Dashboard", "/dashboard", "nav-dashboard"],
      ["Customer search", "/customers", "nav-customers"],
    ],
  },
  {
    label: "Core banking",
    items: [
      ["Accounts", "/accounts", "nav-accounts"],
      ["Beneficiaries", "/beneficiaries", "nav-beneficiaries"],
      ["Payments & transfers", "/payments", "nav-payments"],
      ["Product catalogue", "/products", "nav-products"],
    ],
  },
  {
    label: "Controls",
    items: [
      ["Audit trail", "/audit", "nav-audit"],
      ["Demo reset", "/admin/reset", "nav-reset"],
    ],
  },
] as const;

export function AppShell({ children, user }: { children: ReactNode; user: SessionUser }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard" data-bp="brand-home">
          <span className="brand-mark" aria-hidden="true">FB</span>
          <span>
            <strong>FutureBank</strong>
            <small>CORE OPERATIONS</small>
          </span>
        </Link>
        <form className="global-search" action="/search" method="get" role="search">
          <label className="sr-only" htmlFor="global-search-query">Search customers or accounts</label>
          <input
            id="global-search-query"
            name="query"
            data-bp="global-search-query"
            placeholder="Customer, account or reference"
            autoComplete="off"
          />
          <button id="global-search-submit" name="intent" value="search" data-bp="global-search-submit" type="submit">
            Search
          </button>
        </form>
        <div className="operator-summary" data-bp="operator-summary">
          <span className="operator-avatar" aria-hidden="true">BO</span>
          <span><strong>{user.name}</strong><small>{user.role} · Demo Branch 001</small></span>
          <form action={logoutAction}>
            <button id="sign-out" name="intent" value="sign-out" data-bp="sign-out" className="text-button" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <aside className="sidebar" aria-label="Primary navigation">
        <div className="environment-label"><span /> Demonstration environment</div>
        {navGroups.map((group) => (
          <section className="nav-group" key={group.label}>
            <h2>{group.label}</h2>
            <ul>
              {group.items.map(([label, href, bp]) => (
                <li key={href}><Link href={href} data-bp={bp}>{label}</Link></li>
              ))}
            </ul>
          </section>
        ))}
        <div className="sidebar-footer">
          <strong>System status</strong>
          <span><i /> Operational</span>
          <small>FutureBank Core · v1.0</small>
        </div>
      </aside>

      <main className="workspace" id="main-content">{children}</main>
    </div>
  );
}
