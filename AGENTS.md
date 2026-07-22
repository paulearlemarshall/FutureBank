# FutureBank agent guide

This file is a route map, not a substitute for inspecting the system. The user's requested outcome and authority govern every task. Repository-local code, tests, contracts, and current external state take precedence over general guidance.

## Start with local truth

1. Read the request, inspect `git status --short --branch`, and preserve unrelated user work.
2. Find the current owner of the behavior before proposing a new abstraction. Inspect neighboring implementations, tests, schema, migrations, and operational state.
3. Name the claim that must be true when the task is complete and the evidence that would prove it.
4. Make the smallest change at the earliest authoritative owner. Do not weaken tests, permissions, validation, or acceptance criteria to make a run pass.
5. Run the native checks and, when the claim is user-facing or operational, exercise the real journey as well.

## Retrieve context just in time

Load only the routes relevant to the task:

| Concern | Start here | Authoritative implementation or proof |
| --- | --- | --- |
| System boundaries and invariants | `docs/architecture.md` | `src/modules/domain/`, `src/modules/services/`, `src/db/schema.ts`, migrations |
| Local setup, reset baseline and release shape | `README.md` | `src/db/seed.ts`, `src/db/seed-manifest.ts`, `scripts/verify-db.ts` |
| REST API and authentication | `docs/api.md` | `openapi/futurebank.v1.source.json`, generated artifact, `src/app/api/v1/`, API contract tests |
| Customer Passport and National ID files | `docs/customer-documents-feature-spec.md` | document policy/service, Blob routes, `e2e/customer-documents.spec.ts` |
| Blue Prism automation compatibility | `docs/blue-prism-selector-contract.md` | `e2e/selector-contract.spec.ts`, canonical Playwright journeys |
| Deferred product scope | `docs/core-banking-roadmap.md` | no navigation until a module is functional |
| CI and deployment evidence | `.github/workflows/ci.yml` | GitHub checks, Vercel deployment identity, `/api/health` |

Do not preload every document. Follow a second route only when a distinct unresolved decision remains.

## Non-negotiable product contracts

- All people, businesses, identifiers, documents, screening results, balances, and policies are fictional demonstration data. Never introduce real personal data or live watchlists.
- The deterministic reset baseline contains exactly nine customers and nineteen accounts. Preserve the original customer and account identifiers unless the user explicitly authorizes a contract change.
- Enforce authentication and authorization near the data or mutation, not only in layouts or navigation. UI and API paths must converge on the same permissions and domain services.
- Maker-checker decisions require distinct actors, expected work-item versions, database locking, decision comments, and audit history.
- Money crosses boundaries as validated decimal strings and is booked through balanced ledger operations. Do not use floating point for posted financial values.
- `overdraft_facilities` is the arranged-limit source of truth. Pending payments reserve funds through holds; approval must recheck current KYC, screening, ownership, balance, facility, and work-item state before booking exactly once.
- Customer-document bytes remain in private Vercel Blob storage. DTOs, logs, and audit JSON must not expose private Blob locators or bytes. Maintain signature/type/size validation and reset restoration of Amelia Hart's seeded files.
- Blue Prism controls retain native HTML, stable `id`, `name`, and `data-bp` selectors, fixed table columns, permanent page-ready markers, and persistent status/error regions.
- Roadmap features stay out of navigation until their data model, authorization, audit, deterministic seeds, working journeys, and selectors are implemented.

## Change and proof loop

Use this loop for a bounded task:

1. Record the current behavior from code, a failing test, CI, or a reproducible journey.
2. Classify the earliest gap: context, capability, domain ownership, authority, proof, or delivery.
3. State the intervention and expected observable effect.
4. Implement through the repository's normal architecture and add the narrowest regression proof at the claim boundary.
5. Run proportional checks, then rerun the affected user or operational journey from a clean equivalent state.
6. Keep the intervention only if it is used, proves the claim, and has lower carrying cost than the failure it prevents.

Minimum evidence by change type:

- Documentation only: `git diff --check` and `npm run verify:docs`.
- Domain policy or state transition: focused unit tests plus `npm run typecheck`.
- Schema, seed, ledger, hold, KYC, workflow, or overdraft mutation: migration/reset/database verification and workflow invariants.
- UI or selector change: lint/typecheck plus the relevant Playwright journey and selector contract.
- API change: update the canonical OpenAPI source, run `npm run openapi:generate` and `npm run openapi:check`, then run API contract tests; verify the raw response shape where an endpoint is not JSON.
- Customer-document lifecycle change: the isolated real-Blob CI journey must pass; mocks alone do not prove callback finalization.
- Release claim: identify the merged commit, require clean CI, confirm the Vercel production deployment for that revision is Ready, call `/api/health`, and exercise the affected live journey when safe.

Do not claim that a proxy proves more than it does. A successful build does not prove a Blob callback, a mocked test does not prove Neon locking, and a preview deployment does not prove production promotion.

## Authority and consequential operations

- Capability is not permission. Do not reset production, rotate credentials, mutate live demonstration data, merge, deploy, or change external tracking state unless the request authorizes that outcome.
- Use isolated Neon branches, Vercel previews, disposable CI databases, and environment-scoped Blob namespaces for destructive verification.
- Never expose credentials in files, output, audit events, PR text, or test artifacts. GitHub, Vercel, and Linear access should be checked only when the requested workflow needs those systems; request OAuth/login when access is unavailable.
- Preserve recovery paths for migrations and material production changes. State what was deleted and how it can be recovered.

## Documentation ownership

- Put a settled fact beside its owner: domain rules in code/tests, API shapes in OpenAPI, automation contracts in the selector guide, and operational procedures in README or CI.
- Update documentation in the same change that alters its contract. Remove stale review journals instead of accumulating parallel truth.
- When an escaped bug reveals a durable invariant, add a regression test or verification script first; prose is supporting context, not the only control.
- Keep this file compact. Add a route to an owning document rather than embedding an exhaustive implementation manual here.

<!-- BEGIN:nextjs-agent-rules -->
## This is not the Next.js you know

This version has breaking changes—APIs, conventions, and file structure may differ from training data. Before changing Next.js or React code, read the relevant guide in `node_modules/next/dist/docs/` completely and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Provenance

The routing, authority, proof, and feedback-loop structure is adapted to FutureBank from the ideas in [lopopolo/harness-engineering](https://github.com/lopopolo/harness-engineering) (CC BY 4.0). This repository's own contracts and evidence remain authoritative.
