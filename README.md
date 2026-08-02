# FutureBank Core

FutureBank Core is a fictional core-banking application for Blue Prism demonstrations. It provides a deliberately conventional, desktop-first interface, stable automation selectors, persistent Neon Postgres data, and realistic KYC, maker-checker, arranged-overdraft, payment-hold, future-dated payment, standing-order, customer, account, CSV statement, and audit workflows.

All people, businesses, identifiers, balances, and transactions in the seeded dataset are fictional.

The system boundaries, authoritative owners, and non-negotiable invariants are mapped in [docs/architecture.md](docs/architecture.md). Coding agents should begin with [AGENTS.md](AGENTS.md), which routes tasks to the smallest relevant local context and proof.

## Deterministic demonstration baseline

An administrative reset restores nine customers and nineteen accounts. The original identifiers `C000001`–`C000005` and `1000000001`–`1000000014` remain unchanged. Additional scenarios cover KYC not started, in progress, pending approval and expired; active, blocked and closed accounts; every reachable overdraft lifecycle state; booked, pending, rejected and expired payments; all hold and work-item states; and open, assigned and resolved overdraft alerts.

The baseline includes two Arabic-language UAE records without changing identifier counts: retail customer `C000002` and SME customer `C000005`. Arabic-script names and addresses, Latin short-name transliterations, authenticated API search/write, and RTL-aware native form controls are covered by reset, database and browser verification.

Useful starting records include `KYC-000007` for an unresolved fictional match, `KYC-000008` for Compliance approval, `1000000017` for a blocked account, `1000000018` for a closed account, `ODF-000006` for a pending limit change, `PAY-000002`–`PAY-000004` for terminal payment and hold outcomes, and `PIN-000001`–`PIN-000003` for future-dated, recurring and cancelled payment instructions.

## Live demonstration

The production demonstration is available at [future-bank-demo.vercel.app](https://future-bank-demo.vercel.app). Demo usernames are `bp.operator`, `bp.supervisor`, `bp.compliance`, and `bp.admin`; passwords are managed as Vercel environment variables and are intentionally not stored in this public repository.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Drizzle ORM with Neon Serverless Postgres
- Better Auth username/password sessions
- Private Vercel Blob storage for authenticated Passport and National ID files
- Vitest domain tests and Playwright browser tests
- Versioned authenticated REST API with an OpenAPI 3.0 artifact
- Vercel deployment

## Local setup

Install dependencies and copy the required environment values into `.env.local`. At minimum the application requires its Neon connection string, authentication secret, four demo credentials (`DEMO_OPERATOR_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD`, `DEMO_COMPLIANCE_PASSWORD`, and `DEMO_ADMIN_PASSWORD`), `FUTUREBANK_API_KEY`, and a Vercel Blob read-write token (`BLOB_READ_WRITE_TOKEN`) for the customer-documents feature. Secrets must not be committed. Use a dedicated Neon branch for development; do not pull production database values over a checked-out branch context.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The four seeded usernames are listed above; their passwords are the corresponding environment-variable values.

## REST API

The read/write API is rooted at `/api/v1`. Send the configured key in `X-API-Key` or as a bearer token. Mutations may also send `X-Staff-Username` to select an active seeded staff actor; normal role permissions and maker-checker separation remain enforced. The default actor is `bp.operator`.

```powershell
$headers = @{
  "X-API-Key" = "<api key>"
  "X-Staff-Username" = "bp.operator"
}
Invoke-RestMethod "http://localhost:3000/api/v1/customers?limit=9" -Headers $headers
```

The canonical OpenAPI source is [`openapi/futurebank.v1.source.json`](openapi/futurebank.v1.source.json). `npm run openapi:generate` produces the committed [`openapi/futurebank.v1.json`](openapi/futurebank.v1.json) artifact, and `npm run openapi:check` validates the source and rejects artifact drift. The running app serves the generated document publicly at `/api/openapi.json`, allowing an external actor to discover the contract without credentials; all `/api/v1` business routes remain authenticated. See [`docs/api.md`](docs/api.md) for accessibility, authentication, payment-instruction and response conventions.

## Quality checks

```powershell
npm run verify:docs
npm run openapi:check
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run verify:fast` for the documentation, OpenAPI, lint, typecheck and unit-test contract. `npm run verify:db` migrates and resets the configured disposable database, verifies the baseline, exercises database-backed workflows and verifies the restored baseline again. After installing the Playwright browsers, `npm run verify:full` adds the production build and canonical browser journeys.

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
- `npm run db:migrate` applies committed migrations.
- `npm run db:seed` creates the deterministic demonstration dataset.
- `npm run db:reset` restores banking-domain data in a controlled development environment.

Migrations are applied explicitly and are not run during `next build`. Production and preview/development databases use separate Neon branches. The representative future module sequence is documented in [docs/core-banking-roadmap.md](docs/core-banking-roadmap.md); roadmap modules are intentionally absent from navigation until they work.
