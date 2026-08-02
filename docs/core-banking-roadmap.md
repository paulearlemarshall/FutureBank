# Core-banking roadmap

FutureBank deliberately exposes only working navigation. Wave 1 delivered future-dated payments and standing orders. Wave 2 delivered bounded, authenticated CSV account statements. Wave 3 delivered direct-debit mandates, cancellation, collection history and idempotent collection processing through existing payment and ledger controls. Wave 4 delivered full-value payment reversal requests, independent decisions and immutable counter-postings. Wave 5 delivered effective-dated product charge rules, exact daily deposit interest, once-per-business-date end-of-day processing and balanced account/clearing postings. Wave 6 delivered imported fictional settlement evidence, once-per-date exact clearing reconciliation, durable mismatch and missing-side exceptions, and versioned resolution evidence without ledger mutation. Wave 7 delivered open/closing/closed accounting periods, final-processing and clearing-coverage close gates, independent Supervisor/Admin close approval, and a shared posting-date guard across every runtime ledger writer.

The following representative modules remain documented for later delivery and do not appear as inactive menu entries.

1. An enterprise general ledger, chart of accounts and trial balance beyond the implemented customer/clearing ledger and accounting-period boundary.
2. Loan origination, arrears, collections, collateral, and enterprise limits.
3. Foreign exchange, term-deposit maturity and rollover, and bulk corporate payments.
4. Cards, ATM/POS, teller/cash, trade finance, channels, and safe-deposit operations.

The sequence is representative of established core-banking suites. Each module must include a real data model, read/write workflows, authorization, audit events, deterministic seed scenarios, and stable Blue Prism selectors before navigation is added.
