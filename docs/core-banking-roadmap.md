# Core-banking roadmap

FutureBank deliberately exposes only working navigation. Wave 1 delivered future-dated payments and standing orders. Wave 2 delivered bounded, authenticated CSV account statements. Wave 3 delivered direct-debit mandates, cancellation, collection history and idempotent collection processing through existing payment and ledger controls. Wave 4 delivered full-value payment reversal requests, independent decisions and immutable counter-postings. Wave 5 delivered effective-dated product charge rules, exact daily deposit interest, once-per-business-date end-of-day processing and balanced account/clearing postings. Wave 6 delivered imported fictional settlement evidence, once-per-date exact clearing reconciliation, durable mismatch and missing-side exceptions, and versioned resolution evidence without ledger mutation. Wave 7 delivered open/closing/closed accounting periods, final-processing and clearing-coverage close gates, independent Supervisor/Admin close approval, and a shared posting-date guard across every runtime ledger writer. Wave 8 delivered a multi-currency chart of accounts, exact synchronous projection of every subledger transaction, versioned Supervisor/Admin manual journals, posted trial balances, production backfill, and general-ledger close gates. Wave 9 is the final planned feature set: controlled loan applications, exact affordability and repayment calculations, independent approval, atomic loan-account creation and disbursement, and loan-receivable general-ledger projection.

## Final release checklist

- [x] Implement Waves 1–9 with data models, authorization, audit, deterministic seeds, API contracts and automation selectors.
- [ ] Pass the final fast, database, production-build and canonical browser gates.
- [ ] Fast-forward the complete wave chain to `main` and pass GitHub CI for the release revision.
- [ ] Confirm the Vercel production deployment for that exact revision is Ready.
- [ ] Verify production health and the safe public discovery journey.
- [ ] Record the production evidence here and stop feature development.

Arrears, collections, collateral, enterprise limits, foreign exchange, term-deposit rollover, bulk corporate payments, cards, ATM/POS, teller/cash, trade finance, channels and safe-deposit operations are explicitly outside this release. They are not an active backlog and must not be added to navigation. Further feature innovation is stopped after Wave 9 unless a future user explicitly starts a new product cycle.
