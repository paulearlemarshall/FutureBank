# Core-banking roadmap

FutureBank deliberately exposes only working navigation. Wave 1 delivered future-dated payments and standing orders. Wave 2 delivered bounded, authenticated CSV account statements. Wave 3 delivered direct-debit mandates, cancellation, collection history and idempotent collection processing through existing payment and ledger controls. Wave 4 delivered full-value payment reversal requests, independent decisions and immutable counter-postings.

The following representative modules remain documented for later delivery and do not appear as inactive menu entries.

1. Charges, interest accrual and posting, reconciliation, general ledger, and end-of-day processing.
2. Loan origination, arrears, collections, collateral, and enterprise limits.
3. Foreign exchange, term-deposit maturity and rollover, and bulk corporate payments.
4. Cards, ATM/POS, teller/cash, trade finance, channels, and safe-deposit operations.

The sequence is representative of established core-banking suites. Each module must include a real data model, read/write workflows, authorization, audit events, deterministic seed scenarios, and stable Blue Prism selectors before navigation is added.
