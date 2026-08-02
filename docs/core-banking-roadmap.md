# Core-banking roadmap

FutureBank deliberately exposes only working navigation. Wave 1 delivered future-dated payments, weekly/monthly standing orders, cancellation, execution history and idempotent business-date processing through the existing payment and ledger controls. Wave 2 delivered bounded, authenticated CSV account statements derived from exact ledger entries.

The following representative modules remain documented for later delivery and do not appear as inactive menu entries.

1. Direct-debit mandates and payment reversals.
2. Charges, interest accrual and posting, reconciliation, general ledger, and end-of-day processing.
3. Loan origination, arrears, collections, collateral, and enterprise limits.
4. Foreign exchange, term-deposit maturity and rollover, and bulk corporate payments.
5. Cards, ATM/POS, teller/cash, trade finance, channels, and safe-deposit operations.

The sequence is representative of established core-banking suites. Each module must include a real data model, read/write workflows, authorization, audit events, deterministic seed scenarios, and stable Blue Prism selectors before navigation is added.
