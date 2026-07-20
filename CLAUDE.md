@AGENTS.md

# Full review (Claude, 2026-07-20, v3 — customer documents)

Reviewed at commit `f17008d` (after PR #5 `feature/customer-documents-blob` and follow-up fixes #6/#7/#8). All quality gates verified: `next build` passes, ESLint clean, `tsc --noEmit` clean, 71/71 Vitest unit tests pass, Playwright e2e last run passed. Also live-probed the deployed API directly against `https://future-bank-demo.vercel.app`: seeded Passport/National ID documents list and fetch correctly, downloaded content is a byte-exact real JPEG with correct `Content-Type`/`Content-Disposition`/`ETag`, an invalid slot returns 400, and a `bp.supervisor` actor (lacking `KYC_GATHER`) is correctly rejected with 403 on both read-adjacent and write routes.

## What works — customer documents (Passport / National ID)

- **Storage architecture is sound**: private Vercel Blob holds bytes; Neon holds only the customer/slot relationship, display metadata, blob locator (url/pathname/etag), sha256, and audit history — never bytes. `DocumentMeta` DTOs and audit JSON never carry the blob URL/pathname/etag, verified by grep.
- **Defense in depth on upload**: declared MIME type, magic-byte content sniffing (JPEG/PNG/PDF signatures), and file size are all cross-checked (`document-policy.ts`); filenames are sanitized to a safe basename; empty files rejected.
- **Two upload paths converge on the same validation**: small/API uploads go straight through `uploadCustomerDocument` (multipart); browser uploads go direct-to-Blob via a short-lived (10 min), customer+slot+filename-scoped client token, then the server independently re-fetches and re-validates the completed blob server-side in `completeClientDocumentUpload` before persisting — the client's declared type is never trusted.
- **Concurrency-safe writes**: per-`(customerId, slot)` Postgres advisory lock around upsert/delete; old blob is deleted only after the DB transaction commits, and never for seeded documents.
- **Auth**: reads require any authenticated session (`requireUser`); uploads/replace/delete require `KYC_GATHER` (OPERATOR or ADMIN) — enforced identically in the UI actions, the client-upload token route, and the REST API.
- **Deterministic seed + reset**: seed blobs are hash-addressed and idempotent (checked via `head` before re-upload); `resetBaseline` restores the two seeded documents and garbage-collects orphaned blobs, scoped to the current environment/CI-run namespace so parallel test runs can't clobber each other.
- **API**: `GET/PUT/DELETE .../customers/{n}/documents/{slot}` plus a list and a raw-bytes `/content` route, documented in the OpenAPI spec with the `/content` route correctly called out as the one endpoint returning raw bytes instead of the `{data}` envelope.

## To do

1. **The trickiest code path is not covered by automated CI.** The browser direct-to-Blob upload/finalization e2e test (`e2e/customer-documents.spec.ts`) `test.skip`s unless `PLAYWRIGHT_BASE_URL` is set, which `.github/workflows/ci.yml` does not set — so it only runs manually against a preview/production URL. Two of the four follow-up PRs (#6 "wait for document upload finalization", #7 "document deletion status") were fixes to exactly this path. Worth adding a workflow step (or scheduled job) that runs Playwright against the Vercel preview deployment URL so this round-trip is exercised automatically, not just ad hoc.
2. **README doesn't mention `BLOB_READ_WRITE_TOKEN`.** The local-setup section lists the Neon connection string and four `DEMO_*_PASSWORD` vars but not the Vercel Blob token now required to run uploads locally — add it alongside the others.

# Full review (Claude, 2026-07-20, v2)

Reviewed at commit `99d22b0` (after "feat: add KYC overdraft and maker-checker operations"). All quality gates verified: `next build` passes, ESLint clean, `tsc --noEmit` clean, 61/61 Vitest unit tests pass, Playwright e2e last run passed with 0 failures. Working tree clean apart from this file.

## Older recommendations — status

All earlier findings are resolved except one:

- ✅ Beneficiary ownership verified on external payments (round 1).
- ✅ Unused `payment-executor.ts` abstraction and its test deleted (round 1).
- ✅ `overdraftLimit` dead column → replaced by a full overdraft-facility module (application, maker-checker approval, limit changes, holds, alerts, limit history); payment execution now blocks drawings unless an ACTIVE/PENDING_CHANGE facility exists.
- ✅ Unreachable `PENDING` payment status → external payments now book as PENDING with an available-balance hold, maker-checker approval/rejection, and expiry of stale items.
- ✅ `login_attempts` unbounded growth → rows older than 24h are pruned on each login.
- ✅ `ilike` wildcard escaping → `escapeLikePattern` added; search inputs are escaped.
- ✅ README now documents all four `DEMO_*_PASSWORD` env vars and the e2e workflow.
- ✅ Read-route auth no longer relies on the `(banking)` layout alone — every exported query in `src/modules/queries.ts` and `src/modules/operations-queries.ts` now calls `await requireUser()` itself, so data access is enforced at the query layer regardless of how the page is reached.

## What works

- **Staff workflows**: dashboard, customer create/edit (RETAIL/SME), account opening with product minimums and opening-deposit clearing, account status management with close guards, beneficiaries, internal transfers (instant) and external payments (maker-checker), products, audit trail, global search, admin demo reset behind a typed confirmation.
- **New in v2 — KYC case management**: case opening, CDD profile, evidence gathering/verification, fictional screening with COMPLIANCE-only resolution, submission to a COMPLIANCE-approved work item, and customer restrictions (apply/lift).
- **New in v2 — overdraft facilities**: application → SUPERVISOR approval → active facility; limit changes with `validateLimitReduction` guarding against reductions below utilization+holds; suspension; utilization alerts; UK repeat-use review heuristics; drawings blocked without an active facility.
- **New in v2 — maker-checker workflow engine**: `work_items` with FOR UPDATE locking, self-approval forbidden, optimistic versioning (stale-item rejection), per-type checker roles (COMPLIANCE for KYC, SUPERVISOR for payments/overdrafts, ADMIN for both), assignment respect, and a full event log. Four roles (OPERATOR/SUPERVISOR/COMPLIANCE/ADMIN) with an explicit permission matrix in `src/modules/domain/auth-policy.ts`; all new actions use `requirePermission`.
- **Money handling remains correct by construction**: regex-validated string money → bigint minor units (signed variant added for overdrawn balances), double-entry ledger with `balanceAfter`, clearing accounts, stable-order row locks, advisory-locked reference generation, unique idempotency keys re-checked after locking, audit events on every mutation.
- **Auth**: better-auth username/password, signup disabled, login rate limiting with 24h attempt pruning, env-only seeded passwords for four demo users, dev-fallback secret refuses to apply on Vercel.
- **Ops**: CI workflow in `.github/workflows/ci.yml`, drizzle migrations (0000–0002), health endpoint, Vercel-ready, `.env*`/`.neon` gitignored, roadmap documented in `docs/core-banking-roadmap.md`.
- **Automation contract**: stable `data-bp` selectors, documented in `docs/blue-prism-selector-contract.md`, enforced by `e2e/selector-contract.spec.ts`.

## REST API probe (2026-07-20, after PR #3 / `fbe33d1`)

Probed `https://future-bank-demo.vercel.app/api/v1` live. All checks passed:

- Auth: missing/invalid key → 401 with structured error; valid key works via both `X-API-Key` and `Authorization: Bearer`; unknown `X-Staff-Username` → 403; key compared with `timingSafeEqual`; key held in `FUTUREBANK_API_KEY` env, not committed anywhere in git history.
- Reads: `/`, `/dashboard`, `/products`, `/customers` (search/limit), `/accounts`, `/kyc-cases`, `/overdrafts`, `/work-items`, `/audit-events` all return 200 with a consistent `{data}` envelope and `Cache-Control: no-store`.
- Errors: unknown routes and unknown entities → 404 `{error:{code,message}}`; malformed writes → 400 with per-field `fieldErrors`.
- Authorization on writes verified without mutating: a fully valid customer payload submitted as `bp.supervisor` (no `CUSTOMER_MAINTAIN`) → 403 FORBIDDEN.
- Architecture: the router is a thin JSON→FormData adapter over the same server actions and queries the UI uses (actor injected via `AsyncLocalStorage`), so role gates, maker-checker, holds, ledger, and audit controls apply identically.

Observations (acceptable for a demo, worth knowing):

1. **The single API key selects its own actor.** `X-Staff-Username` lets any key holder act as any active staff member including `bp.admin`, so maker-checker separation is procedural, not cryptographic, over the API — one key holder can make as `bp.operator` and approve as `bp.supervisor`. Per-actor keys would be needed if that ever matters.
2. Request validation runs before the permission check (invalid payload from an unauthorized actor returns 400, not 403). Harmless, just slightly unconventional ordering.
3. No API-specific rate limiting (the login limiter doesn't apply); Vercel's platform protections are the only throttle.

## To do

1. **Optional**: pending-payment expiry runs on every Payments page render (`src/app/(banking)/payments/page.tsx`) plus the manual SUPERVISOR action — sufficient for the demo. A Vercel cron would add guaranteed timed execution if unattended expiry ever matters.
2. **Minor**: `estimatedDailyInterest` in `overdraft-policy.ts` uses float arithmetic — intentionally display-only; keep it out of any booked ledger math if interest posting ships (roadmap item 2).
3. **Future modules** are sequenced in `docs/core-banking-roadmap.md` (standing orders, interest/charges/EOD, loans, FX/term deposits, cards/channels) — follow the doc's bar: real data model, authorization, audit, deterministic seeds, and stable selectors before adding navigation.
