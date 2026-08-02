# FutureBank architecture and invariants

This document explains where important behavior is owned and which properties must survive a change. It is a navigation aid for contributors and coding agents; the executable source and tests remain authoritative.

## System boundary

FutureBank is a fictional operations platform for Blue Prism demonstrations. It is a Next.js App Router application deployed on Vercel, with Neon Postgres for relational state, Better Auth for staff sessions, and private Vercel Blob storage for customer-document bytes.

The principal paths are:

```text
Browser page or REST request
  -> authenticated page/query, Server Action, or API adapter
  -> permission and input boundary
  -> domain service and policy
  -> locked Neon transaction / private Blob operation
  -> audit event and stable DTO
  -> persistent UI status or structured API response
```

REST handlers are adapters over the same application services used by the UI. They must not become a second implementation of banking rules.

## Ownership map

| Concept | Authoritative owner | Supporting contract or proof |
| --- | --- | --- |
| Relational shape and enums | `src/db/schema.ts` and committed migrations | schema contract tests |
| Deterministic demonstration state | `src/db/seed.ts`, `src/db/seed-manifest.ts` | `scripts/verify-db.ts`, baseline tests |
| Roles and permissions | `src/modules/domain/auth-policy.ts` | auth policy tests and role journeys |
| KYC restrictions and risk | KYC domain policy and services | KYC policy tests and Compliance journeys |
| Maker-checker state | workflow service inside locked transactions | workflow policy tests and `scripts/verify-workflows.ts` |
| Ledger, payments, and holds | payment services and transfer policy | balance invariants and payment journeys |
| Future-dated payments and standing orders | payment-instruction service and processing-run tables | schedule policy tests and exactly-once workflow verification |
| Account statement export | statement service over ledger entries | date/CSV policy tests and authenticated download journey |
| Arranged overdrafts | overdraft policy/services and facility tables | overdraft tests and approval/alert journeys |
| Customer-document files | document policy/service plus private Blob adapter | feature specification and real-Blob journey |
| Public API | `openapi/futurebank.v1.source.json` and API adapter | generated artifact, drift check and API contract tests |
| Blue Prism DOM compatibility | selector contract and native page controls | selector-contract Playwright suite |
| Deployment acceptance | GitHub CI and Vercel deployment state | `/api/health` and affected live journey |

When two representations disagree, repair the downstream representation or finish the migration to one owner; do not maintain two competing sources of truth.

## Security and authority

The browser uses database-backed Better Auth sessions. Reads must verify an active user near the query or service, and mutations must check the required permission near the write.

The REST API intentionally uses simple demonstration authentication. `FUTUREBANK_API_KEY` authenticates the client, and `X-Staff-Username` selects an active staff actor. Possession of the shared key can therefore select multiple actors; role permissions and self-approval checks still apply, but the key is not a production-grade separation of human identities. Do not describe it as such or weaken the application controls because the outer authentication is simple.

Consequential decisions use work items, optimistic versions, row/advisory locks, different maker and checker identities, mandatory comments, and audit events. Alternate entry points—including API routes—must preserve those controls.

## Financial invariants

- Posted values use decimal strings at boundaries and exact minor-unit or database numeric handling internally; floating-point calculations are display-only.
- Ledger postings remain balanced, idempotent, and atomically reflected in account projections.
- Pending payments create holds without ledger entries. Approval rechecks current controls and books once; rejection or expiry releases the hold without booking.
- A payment instruction owns future intent only and never reserves funds. Each due occurrence has one stable idempotency key, rechecks live controls, and delegates the actual booking to the existing payment service and ledger owner.
- Available balance reconciles ledger balance, the active arranged overdraft limit, and active holds.
- Only eligible current accounts with acceptable KYC and restrictions may receive or increase an overdraft facility.
- Limit reductions cannot strand utilization plus holds, and suspension prevents further drawing while preserving debt.

## KYC invariants

- Screening data and matches are explicitly fictional.
- Possible matches require Compliance resolution. A confirmed sanctions scenario rejects KYC and applies a debit restriction.
- PEP status drives enhanced due diligence and approval; it is not an automatic rejection.
- Mandatory evidence and expiry rules gate submission. Approved cases update the customer summary and next-review state.
- KYC and restriction state must be re-evaluated at downstream payment, beneficiary, account-opening, and overdraft boundaries rather than trusted from an old screen.

## Customer-document invariants

- Neon stores the customer/slot relationship and safe metadata; private Blob stores bytes.
- Exactly one file may occupy each `PASSPORT` or `NATIONAL_ID` slot.
- Files are non-empty JPEG, PNG, or PDF, no larger than 4 MB, with matching declared type and signature.
- DTOs and audits exclude private Blob URL/pathname/ETag and content bytes.
- Replacements are concurrency-safe, remove obsolete non-seed blobs after persistence, and rotate the versioned preview URL without remounting the stable card.
- Reset restores Amelia Hart's two exact seeded originals and cleans only the current environment namespace.

## Deterministic baseline and automation

Reset restores exactly nine customers and nineteen accounts while preserving the original five customer numbers and fourteen account numbers. The baseline deliberately covers reachable KYC, account, payment, hold, work-item, facility, alert, screening, evidence, beneficiary, and restriction states.

Two UAE scenarios exercise UTF-8 and bidirectional text end to end: `C000002` is an Arabic-script retail customer and `C000005` is an Arabic-script SME. Their short names retain Latin transliterations for operational search, while names, industries and primary addresses retain Arabic text. The English application shell remains LTR; native human-readable fields use automatic direction and structured banking identifiers remain explicitly LTR.

Historical terminal scenarios retain fixed timestamps. Time-sensitive active and pending scenarios are anchored to the UTC day on which reset runs, so their due, review and expiry semantics remain stable without rewriting transaction history. `scripts/verify-db.ts` rejects a reset whose pending payment, active hold, non-terminal KYC case, open work item, live facility or verified active-case evidence has already aged out.

Blue Prism compatibility is a public contract. New screens require native labelled controls, stable identifiers and `data-bp` values, fixed table ordering, a permanent `data-bp-page` readiness marker, and persistent status/error regions. Avoid portals, virtualized lists, canvas controls, generated selectors, and position-dependent automation.

## Change verification

Choose evidence that matches the claim:

| Claim | Required evidence |
| --- | --- |
| Policy or calculation is correct | focused unit tests with boundary cases |
| Schema and baseline reconcile | migration, reset, `scripts/verify-db.ts` |
| Maker-checker and locking work | workflow verification and database-backed journeys |
| API is compatible | committed OpenAPI validation and API tests |
| UI is automatable | Chromium/Edge journey and selector-contract tests |
| Blob upload/replacement works | isolated tunneled real-Blob CI job |
| Change is live in production | merged commit identity, green CI, Vercel Ready, health check, safe live journey |

Record known limits when the available evidence does not establish the full claim. Keep deployment and runtime evidence tied to the same revision that was tested.
