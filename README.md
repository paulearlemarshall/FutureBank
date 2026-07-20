# FutureBank Core

FutureBank Core is a fictional core-banking application for Blue Prism demonstrations. It provides a deliberately conventional, desktop-first interface, stable automation selectors, persistent Neon Postgres data, and realistic customer, account, beneficiary, payment, statement, and audit workflows.

All people, businesses, identifiers, balances, and transactions in the seeded dataset are fictional.

## Live demonstration

The production demonstration is available at [future-bank-demo.vercel.app](https://future-bank-demo.vercel.app). Demo usernames are `bp.operator` and `bp.admin`; passwords are managed as Vercel environment variables and are intentionally not stored in this public repository.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Drizzle ORM with Neon Serverless Postgres
- Better Auth username/password sessions
- Vitest domain tests and Playwright browser tests
- Vercel deployment

## Local setup

Install dependencies and copy the required environment values into `.env.local`. At minimum the application requires its Neon connection string and authentication secrets; demo credentials are supplied through `DEMO_OPERATOR_PASSWORD` and `DEMO_ADMIN_PASSWORD` and must not be committed. For a linked Vercel project, `vercel env pull .env.local` retrieves the development values.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The seeded usernames are `bp.operator` and `bp.admin`; their passwords are the corresponding environment-variable values.

## Quality checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

The unit suite covers monetary validation, role boundaries, same-currency transfer rules, insufficient funds, read-only accounts, balanced double-entry postings, and deterministic seed identifiers.

Browser tests use the running local application by default and load its ignored `.env.local` through Next.js's environment loader. You can also override the two passwords in the test process, then run:

```powershell
$env:DEMO_OPERATOR_PASSWORD = "<operator password>"
$env:DEMO_ADMIN_PASSWORD = "<admin password>"
npm run test:e2e
```

Set `PLAYWRIGHT_BASE_URL` to test a deployed environment. The suite runs serially in Chromium and Microsoft Edge because canonical journeys share deterministic demo data. The suite includes an administrator reset that restores the deterministic baseline, so run it only against a demonstration environment that is safe to reset.

Test evidence (traces, screenshots, and video) is retained on failure. Playwright's HTML report is written to `playwright-report/`.

## Blue Prism automation contract

Automation must target `data-bp` attributes and wait for the route's `[data-bp-page][data-bp-ready="true"]` marker. Do not target generated CSS classes or element positions. The full compatibility rules and canonical journeys are documented in [docs/blue-prism-selector-contract.md](docs/blue-prism-selector-contract.md).

The application uses native labelled form controls and semantic tables, stable IDs and names, persistent status/error regions, and deterministic baseline customer/account numbers so processes remain spyable after an administrative reset.

## Database lifecycle

- `npm run db:generate` generates a migration after schema changes.
- `npm run db:migrate` applies committed migrations.
- `npm run db:seed` creates the deterministic demonstration dataset.
- `npm run db:reset` restores banking-domain data in a controlled development environment.

Migrations are applied explicitly and are not run during `next build`. Production and preview/development databases should use separate Neon branches.
