# Core-banking roadmap

FutureBank deliberately exposes only working navigation. Wave 1 delivered future-dated payments and standing orders. Wave 2 delivered bounded, authenticated CSV account statements. Wave 3 delivered direct-debit mandates, cancellation, collection history and idempotent collection processing through existing payment and ledger controls. Wave 4 delivered full-value payment reversal requests, independent decisions and immutable counter-postings. Wave 5 delivered effective-dated product charge rules, exact daily deposit interest, once-per-business-date end-of-day processing and balanced account/clearing postings. Wave 6 delivered imported fictional settlement evidence, once-per-date exact clearing reconciliation, durable mismatch and missing-side exceptions, and versioned resolution evidence without ledger mutation. Wave 7 delivered open/closing/closed accounting periods, final-processing and clearing-coverage close gates, independent Supervisor/Admin close approval, and a shared posting-date guard across every runtime ledger writer. Wave 8 delivered a multi-currency chart of accounts, exact synchronous projection of every subledger transaction, versioned Supervisor/Admin manual journals, posted trial balances, production backfill, and general-ledger close gates. Wave 9 is the final planned feature set: controlled loan applications, exact affordability and repayment calculations, independent approval, atomic loan-account creation and disbursement, and loan-receivable general-ledger projection.

## Final release checklist

- [x] Implement Waves 1–9 with data models, authorization, audit, deterministic seeds, API contracts and automation selectors.
- [x] Pass the final fast, database, production-build and canonical browser gates.
- [x] Fast-forward the complete wave chain to `main` and pass GitHub CI for the release revision.
- [x] Confirm the Vercel production deployment for that exact revision is Ready.
- [x] Verify production health and the safe public discovery journey.
- [x] Record the production evidence here and stop feature development.

## Production release evidence

The nine-wave release was completed on 2 August 2026 at Git commit [`5a10fbc`](https://github.com/paulearlemarshall/FutureBank/commit/5a10fbc80a4357cf08f7ffb4cda5d02dd54776ab). [GitHub CI run 30757158464](https://github.com/paulearlemarshall/FutureBank/actions/runs/30757158464) passed the database/workflow, documentation, OpenAPI, lint, typecheck, unit, production-build, Chromium, Edge and isolated real-Blob gates. The canonical browser job passed 178 tests with two intentional skips; the real-Blob tunnel job passed both tests.

Vercel production deployment [`dpl_4fkNrXqXJVbb7B8uMD7Zv78pDaxr`](https://future-bank-demo-dp2te1loh-paulearlemarshalls-projects.vercel.app) was `READY`, targeted production, identified commit `5a10fbc80a4357cf08f7ffb4cda5d02dd54776ab` on `main`, and owned the [`future-bank-demo.vercel.app`](https://future-bank-demo.vercel.app) alias. Live `/api/health` returned `status: ok` and `database: ready`; public `/api/openapi.json` returned OpenAPI 3.0.3, FutureBank API 1.9.0 and all loan-origination operations. Production migrations were applied without resetting demonstration data after creating Neon recovery branch `br-sweet-band-aumauovk`; read-only checks found the loan schema and all four currency loan-receivable controls, with zero unbalanced journals and zero duplicate subledger projections.

## Authentication hardening closeout

- [x] Replace the shared API key and caller-selected actor header with hashed, actor-owned API keys.
- [x] Move username sign-in throttling to Better Auth's database-backed production control.
- [x] Remove plaintext demo passwords and the legacy shared API key from new Vercel production runtimes after explicit database provisioning.
- [x] Publish OpenAPI 1.10.0 and update the API/accessibility documentation.
- [x] Pass pull-request and exact-merge CI, migrate production additively, exercise the live login/API journeys, and stop.

The authentication closeout was released on 2 August 2026 at Git commit [`4823394`](https://github.com/paulearlemarshall/FutureBank/commit/4823394f10d265c1948a19b982ca9efc6d11228b). [GitHub CI run 30762966824](https://github.com/paulearlemarshall/FutureBank/actions/runs/30762966824) passed database/workflow verification, documentation, OpenAPI, lint, typecheck, unit tests, production build, the Chromium/Edge matrix and the isolated real-Blob journey. One Edge navigation timeout recovered on retry; the run completed successfully.

Vercel deployment [`dpl_ENymG919rBHRt5SoDPSNtUd2f97m`](https://future-bank-demo-pea5iovhu-paulearlemarshalls-projects.vercel.app) was `READY`, targeted production, and owned the [`future-bank-demo.vercel.app`](https://future-bank-demo.vercel.app) alias. Live health returned 200, OpenAPI reported 1.10.0, an operator-owned key returned 200, the removed actor header returned 400, all four stored password hashes matched their retained provisioning inputs, and an operator reached a ready dashboard. Migration `0015_auth_simplification` and credential/key provisioning were applied without resetting production after creating recovery branch `br-red-salad-au84k1qd`, retained until 9 August 2026.

Arrears, collections, collateral, enterprise limits, foreign exchange, term-deposit rollover, bulk corporate payments, cards, ATM/POS, teller/cash, trade finance, channels and safe-deposit operations are explicitly outside this release. They are not an active backlog and must not be added to navigation. Further feature innovation is stopped after Wave 9 unless a future user explicitly starts a new product cycle.
