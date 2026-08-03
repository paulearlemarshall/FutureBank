# FutureBank Core

FutureBank Core is a fictional core-banking application for Blue Prism demonstrations. It provides a deliberately conventional, desktop-first interface, stable automation selectors, persistent Neon Postgres data, and realistic KYC, maker-checker, arranged-overdraft, payment-hold, future-dated payment, standing-order, direct-debit, payment-reversal, end-of-day charge and interest, clearing-reconciliation, general-ledger, accounting-period close, controlled loan-origination, customer, account, CSV statement, and audit workflows.

All people, businesses, identifiers, balances, and transactions in the seeded dataset are fictional.

The system boundaries, authoritative owners, and non-negotiable invariants are mapped in [docs/architecture.md](docs/architecture.md). Coding agents should begin with [AGENTS.md](AGENTS.md), which routes tasks to the smallest relevant local context and proof.

## Deterministic demonstration baseline

An administrative reset restores nine customers and nineteen accounts. The original identifiers `C000001`–`C000005` and `1000000001`–`1000000014` remain unchanged. Additional scenarios cover KYC not started, in progress, pending approval and expired; active, blocked and closed accounts; every reachable overdraft lifecycle state; booked, pending, rejected and expired payments; all hold and work-item states; and open, assigned and resolved overdraft alerts.

The baseline includes two Arabic-language UAE records without changing identifier counts: retail customer `C000002` and SME customer `C000005`. Arabic-script names and addresses, Latin short-name transliterations, authenticated API search/write, and RTL-aware native form controls are covered by reset, database and browser verification.

Useful starting records include `KYC-000007` for an unresolved fictional match, `KYC-000008` for Compliance approval, `1000000017` for a blocked account, `1000000018` for a closed account, `ODF-000006` for a pending limit change, `PAY-000002`–`PAY-000004` for terminal payment and hold outcomes, `REV-000001` for pending reversal approval, `PIN-000001`–`PIN-000003` for payment instructions, `DDM-000001`–`DDM-000003` for direct-debit mandate lifecycles, `EOD-000001` for a failed historical end-of-day control scenario, `ACP-000001` for the open July 2026 close-control period, `GLJ-000001` / `WRK-000011` for pending manual-journal approval, and `LOA-000001` / `WRK-000012` for pending loan-origination approval. The reset also creates 20 GBP/AED/USD/EUR general-ledger accounts—including currency loan-receivable controls—and one posted GL projection for every baseline subledger transaction. Product rules `PCR-000001` and `PCR-000002` configure fictional GBP and AED daily overdraft usage charges. Nineteen fictional settlement records for `2026-07-18` provide seventeen exact reconciliation matches, one amount mismatch, and one external-only exception.

## Live demonstration

The production demonstration is available at [future-bank-demo.vercel.app](https://future-bank-demo.vercel.app). Demo usernames are `bp.operator`, `bp.supervisor`, `bp.compliance`, and `bp.admin`; plaintext passwords are retained outside the runtime and are intentionally not stored in this public repository.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Drizzle ORM with Neon Serverless Postgres
- Better Auth username/password sessions
- Private Vercel Blob storage for authenticated Passport and National ID files
- Vitest domain tests and Playwright browser tests
- Versioned authenticated REST API with an OpenAPI 3.0 artifact
- Vercel deployment

## Local setup

Install dependencies and copy the required environment values into `.env.local`. At minimum local provisioning and tests require the Neon connection string, authentication secret, four demo credentials (`DEMO_OPERATOR_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD`, `DEMO_COMPLIANCE_PASSWORD`, and `DEMO_ADMIN_PASSWORD`), an operator-owned integration key (`FUTUREBANK_API_OPERATOR_KEY`, with `FUTUREBANK_API_KEY` accepted as a compatibility input), and a Vercel Blob read-write token (`BLOB_READ_WRITE_TOKEN`) for the customer-documents feature. Secrets must not be committed. Use a dedicated Neon branch for development; do not pull production database values over a checked-out branch context.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The four seeded usernames are listed above; their passwords are the corresponding environment-variable values.

## REST API

The read/write API is rooted at `/api/v1`. Send an actor-owned key in `X-API-Key` or as a bearer token. The key owner determines the actor and permissions; `X-Staff-Username` is rejected. Normal role permissions and maker-checker separation remain enforced.

```powershell
$headers = @{
  "X-API-Key" = "<api key>"
}
Invoke-RestMethod "http://localhost:3000/api/v1/customers?limit=9" -Headers $headers
```

The canonical OpenAPI source is [`openapi/futurebank.v1.source.json`](openapi/futurebank.v1.source.json). `npm run openapi:generate` produces the committed [`openapi/futurebank.v1.json`](openapi/futurebank.v1.json) artifact, and `npm run openapi:check` validates the source and rejects artifact drift. `npm run api-guide:generate` produces the committed [`docs/FutureBank-API-Guide.docx`](docs/FutureBank-API-Guide.docx) Word guide (overview, authentication and roles, format conventions, per-operation parameter tables and error reference); `npm run api-guide:check` rejects drift, and `npm run verify:docs` includes both artifact freshness checks. The running app serves the generated document publicly at `/api/openapi.json`, allowing an external actor to discover the contract without credentials; all `/api/v1` business routes remain authenticated. See [`docs/api.md`](docs/api.md) for accessibility, authentication, payment-instruction and response conventions.

## Quality checks

```powershell
npm run verify:docs
npm run openapi:check
npm run api-guide:check
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run verify:fast` for the documentation, OpenAPI, API-guide, lint, typecheck and unit-test contract. `npm run verify:db` migrates and resets the configured disposable database, verifies the baseline, exercises database-backed workflows and verifies the restored baseline again. After installing the Playwright browsers, `npm run verify:full` adds the production build and canonical browser journeys.

The unit suite covers monetary validation, role boundaries, same-currency transfer rules, insufficient funds, read-only accounts, balanced double-entry postings, deterministic seed identifiers, and baseline state coverage.

Browser tests use the running local application by default and load its ignored `.env.local` through Next.js's environment loader. You can also override the two passwords in the test process, then run:

```powershell
$env:DEMO_OPERATOR_PASSWORD = "<operator password>"
$env:DEMO_SUPERVISOR_PASSWORD = "<supervisor password>"
$env:DEMO_COMPLIANCE_PASSWORD = "<compliance password>"
$env:DEMO_ADMIN_PASSWORD = "<admin password>"
npm run test:e2e
```

Set `PLAYWRIGHT_BASE_URL` to test a deployed environment. The suite runs serially in Chromium and Microsoft Edge because canonical journeys share deterministic demo data. The suite includes an administrator reset that restores the deterministic baseline, so run it only against a demonstration environment that is safe to reset.

GitHub CI also runs the customer-document browser journey in an isolated job using a temporary public tunnel. That job exercises direct-to-Blob upload completion, image replacement and preview refresh, deletion, and namespace cleanup against a dedicated CI database and Blob namespace.

Test evidence (traces, screenshots, and video) is retained on failure. Playwright's HTML report is written to `playwright-report/`.

## Blue Prism automation contract

Automation must target `data-bp` attributes and wait for the route's `[data-bp-page][data-bp-ready="true"]` marker. Do not target generated CSS classes or element positions. The full compatibility rules and canonical journeys are documented in [docs/blue-prism-selector-contract.md](docs/blue-prism-selector-contract.md).

The application uses native labelled form controls and semantic tables, stable IDs and names, persistent status/error regions, and deterministic baseline customer/account numbers so processes remain spyable after an administrative reset.

## Database lifecycle

- `npm run db:generate` generates a migration after schema changes.
- `npm run auth:provision` rotates the four staff password hashes and provisions any supplied actor-owned API keys as one explicit operation.
- `npm run db:migrate` applies committed migrations.
- `npm run db:seed` creates the deterministic demonstration dataset.
- `npm run db:reset` restores banking-domain data in a controlled development environment.

Migrations are applied explicitly and are not run during `next build`. Production and preview/development databases use separate Neon branches. The completed nine-wave delivery and final production-release checklist are documented in [docs/core-banking-roadmap.md](docs/core-banking-roadmap.md). Additional product innovation is intentionally stopped after the loan-origination release.
