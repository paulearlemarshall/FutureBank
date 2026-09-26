# FutureBank REST API

The FutureBank API is a fictional integration surface for demonstrations and automation. It supports reads and controlled writes across customers, customer documents, accounts, beneficiaries, immediate payments, payment instructions, direct debits, payment reversals, end-of-day posting, clearing reconciliation, general-ledger journals and trial balances, accounting-period close, loan origination, KYC, overdrafts and work items.

## External discovery and accessibility

An external actor can discover the contract without credentials:

- `GET /api/openapi.json` returns the complete OpenAPI 3.0 document.
- `GET /api/v1` returns authenticated runtime discovery, including the API version and top-level resources.
- The production OpenAPI URL is `https://future-bank-demo.vercel.app/api/openapi.json`.

The OpenAPI document is self-describing for paths, methods, request and response schemas, permissions and error shapes. It deliberately does not publish an API key. An external caller still needs an actor-owned API key from the environment owner before any `/api/v1` business route is accessible.

## Authentication and actors

Each API key belongs to one active staff user. The key owner determines the audit identity and permissions for every request; callers cannot select another user. Send the issued key using either header:

```text
X-API-Key: <actor-owned-key>
Authorization: Bearer <actor-owned-key>
```

`X-Staff-Username` is not supported and is rejected. An environment owner provisions the four demonstration credentials and any initial actor keys in one operation with `npm run auth:provision`. `FUTUREBANK_API_OPERATOR_KEY`, `FUTUREBANK_API_SUPERVISOR_KEY`, `FUTUREBANK_API_COMPLIANCE_KEY`, and `FUTUREBANK_API_ADMIN_KEY` are one-time provisioning inputs; the legacy `FUTUREBANK_API_KEY` name is accepted only as the operator-key input. Runtime verification uses hashed keys in Neon, so plaintext keys and demo passwords are not required in the Vercel runtime environment after provisioning.

The key owner is passed through the normal application control layer. Operator, Supervisor, Compliance and Admin permissions, maker-checker separation, optimistic versions, account locks, idempotency, KYC restrictions, payment holds, double-entry posting and audit events are still enforced.

## MCP server

The remote MCP endpoint is available at `/mcp` over Streamable HTTP. It uses the same actor-owned API key authentication as `/api/v1`; configure the MCP client to send the key as `Authorization: Bearer <actor-owned-key>` or `X-API-Key`. Each request is authenticated, and read calls run through the existing API router and actor permission context.

The server exposes these read tools:

| Tool | Purpose |
| --- | --- |
| `search_customers` | Search fictional customers by name or customer number |
| `get_customer` | Read a customer by customer number |
| `get_account` | Read account details and balance |
| `get_account_statement` | Read an account statement as CSV |
| `list_accounts` | Search accounts by account or customer details |
| `list_products` | Read product currency, active status and minimum opening balance |
| `list_overdraft_facilities` | List facilities with requested and approved limits, utilization and headroom |
| `get_overdraft_facility` | Read terms, holds, version, alerts and limit history |
| `list_end_of_day_runs` | List recent daily charge/interest processing runs |
| `get_end_of_day_run` | Read a daily run and its posting outcomes |
| `list_reconciliation_runs` | List recent clearing reconciliation runs |
| `get_reconciliation_run` | Read a run's matched and exception items |
| `list_accounting_periods` | List period status and close evidence |
| `get_accounting_period` | Read a period version and latest close work item |
| `list_general_ledger_accounts` | List GL accounts and posting controls |
| `get_trial_balance` | Read a posted trial balance by date/currency |
| `list_general_ledger_journals` | List journal lines and decision state |
| `get_general_ledger_journal` | Read a journal and its approval work item |
| `list_loan_applications` | List loan applications by status |
| `get_loan_application` | Read terms, decision evidence and repayment schedule |
| `list_beneficiaries` | List beneficiaries, optionally filtered by customer |
| `list_payments` | List payments, optionally filtered by status |
| `get_payment` | Read a payment, its approval work item, hold and reversal state |
| `list_payment_reversals` | List payment reversal requests, optionally filtered by status |
| `get_payment_reversal` | Read a reversal request, decision work item and any posted transaction |
| `list_payment_instructions` | List scheduled payments and standing orders with execution history |
| `get_payment_instruction` | Read a schedule, current version and execution history |
| `list_payment_instruction_runs` | List recent scheduled-payment processing runs |
| `list_direct_debit_mandates` | List mandates with status, version and collection history |
| `get_direct_debit_mandate` | Read a mandate and collection history |
| `list_kyc_cases` | List KYC case summaries |
| `get_kyc_case` | Read a case, its version, CDD profile, evidence, screening checks and restrictions |
| `list_work_items` | List work items using status, type, priority, assignee or overdue filters |
| `get_work_item` | Read a work item's version, assignment, state and event history |

The initial write slice covers fictional KYC intake and preparation:

| Tool | Purpose | Permission |
| --- | --- | --- |
| `open_kyc_case` | Open a case; returns its reference in structured result data | `KYC_GATHER` |
| `update_kyc_cdd` | Create or replace a case's complete CDD profile | `KYC_GATHER` |
| `record_kyc_evidence` | Record fictional evidence metadata only; returns the evidence reference | `KYC_GATHER` |
| `delete_customer_document` | Delete an uploaded document by customer and document reference; seeded baseline files are protected | `KYC_GATHER` |
| `update_kyc_evidence` | Update evidence metadata within the specified case | `KYC_GATHER` |
| `run_kyc_screening` | Run fictional screening rules and create screening history | `KYC_SCREEN` |
| `set_kyc_case_lock` | Lock or unlock a KYC case with reason and expected version | `KYC_LOCK` |
| `verify_kyc_evidence` | Verify or reject recorded evidence with reviewer notes | `KYC_GATHER` |
| `resolve_kyc_screening` | Resolve a possible fictional match with a decision comment | `KYC_DECIDE` |
| `submit_kyc_case` | Submit a complete case and create a Compliance work item | `KYC_GATHER` |
| `decide_kyc_case` | Approve or reject a submitted case using the current work-item version | `KYC_DECIDE` |
| `claim_work_item` | Claim an eligible work item using its current version | Work-item role eligibility |
| `release_work_item` | Release an item assigned to the authenticated actor | Current assignee or Admin |

These tools validate inputs at the MCP boundary and dispatch through the existing API router, so the same actor context, permission checks, audit events and KYC rules apply. Successful write calls return structured status and the API ActionState; a successful case or evidence creation also returns its reference in `data.result`. A tool success indicates the requested KYC operation succeeded, not that the case was approved. Evidence metadata does not upload file bytes.

`delete_customer_document` uses the existing document API and service, preserving actor permissions and audit history. It reports whether a reference was deleted; an unknown reference is safe, and seeded baseline documents are rejected. Document upload is not available through MCP yet: the MCP request body limit cannot carry the REST API's supported 4 MB files. Full-size upload needs an authenticated, short-lived staging flow and a separate binary transfer step.

Customer and beneficiary tools include:

| Tool | Purpose | Actor requirement |
| --- | --- | --- |
| `list_beneficiaries` | List beneficiaries, optionally filtered by customer | Any authenticated actor allowed by the API |
| `create_customer` | Create a retail or SME customer; returns `customerNumber` in `data.result` | Operator or Admin |
| `update_customer` | Replace the supported mutable CRM fields; this is not a partial patch | Operator or Admin |
| `create_beneficiary` | Create a customer's external beneficiary; returns `beneficiaryId` in `data.result` | Operator or Admin |
| `set_beneficiary_status` | Activate or deactivate a beneficiary | Operator or Admin |

Beneficiary creation retains the API's KYC and debit-restriction checks. All customer and beneficiary mutations use the existing UI/API validation and audit path. Customer creation and update responses now include the customer number as structured result data; beneficiary creation and status updates return the beneficiary ID and status.

Customer and account controls are available through MCP:

| Tool | Purpose | Important behavior |
| --- | --- | --- |
| `apply_customer_restriction` | Apply a debit block, payment review or onboarding hold | A debit block also marks the customer restricted; returns the reference needed for lifting. |
| `lift_customer_restriction` | Lift an active restriction with a reason | Does not automatically restore customer status after a debit block. |
| `open_account` | Open an account using an active product and branch | Returns account number; any opening deposit posts through the balanced ledger path. |
| `set_account_status` | Activate, block or close an account | Closing requires zero balance and no pending outgoing payments; loan accounts remain read-only. |

`list_accounts` and `list_products` support discovery for these operations. All writes use the same existing action permissions, validation and audit path as the API and UI.

The KYC workflow can now be completed through MCP: an Operator gathers CDD and evidence, runs the existing screening flow, and submits the case; a distinct Compliance actor can claim the resulting work item and decide the case. The server returns the work-item reference and incremented version in structured result data where required. The same permission, completeness and maker-checker rules remain enforced by the API actions.

Arranged overdrafts are available through these MCP tools:

| Tool | Purpose | Important behavior |
| --- | --- | --- |
| `apply_for_overdraft` | Submit a limit application | Only eligible active current accounts with approved KYC and no debit block qualify; creates a Supervisor work item. |
| `request_overdraft_limit_change` | Request a changed limit on an active facility | A reduction cannot go below utilization plus active holds; creates an independent approval item. |
| `decide_overdraft` | Approve or decline an application or change | Requires the current work-item version, comment and `OVERDRAFT_DECIDE`; approval rechecks eligibility and commitments. |
| `set_overdraft_status` | Suspend or close a facility | Closure requires utilization and active holds cleared. |
| `resolve_overdraft_alert` | Record an intervention and resolve an alert | Requires `OVERDRAFT_ALERT_RESOLVE`; completes its open work item when present. |

Facility detail returns its alerts and history; use `list_work_items` with type `OVERDRAFT_APPROVAL`, `OVERDRAFT_CHANGE` or `OVERDRAFT_ALERT` to discover the relevant work item. Application and limit-change responses include facility and work-item references. Decisions and status changes return the resulting facility status in `data.result`.

Accounting and lending workflows are also available through MCP:

| Tool | Purpose | Important behavior |
| --- | --- | --- |
| `run_end_of_day` | Post configured daily overdraft charges and product interest | Date is claimed once; can post balanced ledger movements. |
| `run_reconciliation` | Reconcile existing settlement evidence | Date is reconciled at most once; creates matched/exception records without changing ledger postings. |
| `resolve_reconciliation_item` | Resolve an open exception | Requires current item version and comment; does not change settlement or ledger records. |
| `request_accounting_period_close` | Request close review | Uses period version and close gates; the period freezes while under review. |
| `decide_accounting_period_close` | Approve or reject period close | Requires current work-item version and a distinct Admin; approval rechecks all gates. |
| `submit_manual_journal` | Submit an exact two-line, same-currency journal | Requires idempotency key; remains pending until a distinct Admin approves. |
| `decide_manual_journal` | Approve or reject a manual journal | Approval rechecks period, account controls and balance before posting. |
| `submit_loan_application` | Submit a loan with fictional affordability evidence | Requires idempotency key; creates a Supervisor work item without moving funds. |
| `decide_loan_application` | Approve or reject a loan | Approval rechecks KYC, restrictions, product, destination and period, then books account, schedule and disbursement atomically. |

Processing run, journal, period and loan write results include machine-readable references, statuses and counts where applicable. Use `list_work_items` to discover approval references and current versions. Idempotency keys are forwarded in the API header for manual journals and loan submissions. These tools reuse the established actor permissions, maker-checker rules, posting guards and audit records.

Payment operations are also available through MCP:

| Tool | Purpose | Important behavior |
| --- | --- | --- |
| `submit_payment` | Submit an internal transfer or external payment | Requires an idempotency key. Eligible internal transfers can book immediately; external payments may be held for independent approval. |
| `decide_payment` | Approve or reject a pending payment | Requires the current work-item version, a decision comment and `PAYMENT_DECIDE`; approval books, rejection releases the hold. |
| `expire_pending_payments` | Expire eligible stale pending payments | Requires `PAYMENT_DECIDE`; may affect multiple payments and release holds. |
| `request_payment_reversal` | Request a full-value reversal | Requires an idempotency key and `PAYMENT_REVERSAL_INITIATE`; the original posting is unchanged until approval. |
| `decide_payment_reversal` | Approve or reject a reversal request | Requires an independent checker, current work-item version and decision comment; approval posts a linked equal-and-opposite transaction. |

The submit and reversal-request tools return their payment or reversal reference, resulting status and duplicate indicator in `data.result`. Decision tools return the resulting reference, decision and status. These tools reuse the same API actions and services as the UI, including actor permissions, holds, balanced ledger posting, maker-checker separation, optimistic versions, idempotency and audit events. For retries, reuse the same idempotency key with the same operation payload.

Scheduled payments and direct debits are available through these additional MCP tools:

| Tool | Purpose | Important behavior |
| --- | --- | --- |
| `create_payment_instruction` | Create a future-dated payment or standing order | Reserves no funds; scheduled and standing-order frequencies are validated. |
| `cancel_payment_instruction` | Cancel an instruction | Requires its current version and a reason. |
| `run_payment_instructions` | Process due occurrences for a business date | Can book, create pending payments with holds or record failures; requires `PAYMENT_SCHEDULE_EXECUTE`. |
| `create_direct_debit_mandate` | Create a mandate for an owned active creditor beneficiary | Reserves no funds; account ownership, currency, KYC and debit restrictions are checked. |
| `cancel_direct_debit_mandate` | Cancel an active or suspended mandate | Requires current version and reason; blocked during a processing collection. |
| `submit_direct_debit_collection` | Submit a collection against a mandate | Requires `Idempotency-Key`; may book, become pending with a hold, or be rejected. |

Create, cancel and run results include machine-readable references, status or run totals under `data.result`. Collections also return a duplicate indicator. The operation tools reuse the same permission checks, scheduling and mandate policies, payment service, maker-checker controls, idempotency and audit events as the REST API and UI.

Existing API restrictions on account statements and customer data still apply. Requests with unapproved Host or Origin headers are rejected. Localhost and the production domain are allowed by default; add comma-separated hostnames to `MCP_ALLOWED_HOSTS` when serving from a custom domain. For example, an MCP client connecting to production uses `https://future-bank-demo.vercel.app/mcp` and must be configured with an actor-owned key. The key should be stored in the MCP client's secret or environment configuration, not committed to a project file.

Payment-instruction permissions are separated: Operator maintains instructions and Supervisor executes due-instruction runs. Admin can do both. An occurrence is initiated under the instruction creator's identity, so an external payment that becomes pending still requires an independent payment checker.

End-of-day execution is restricted to Supervisor and Admin. Product charge rules and product interest rates are read from the database; callers cannot supply a rate or amount in the run request.

## Read example

```bash
curl "https://future-bank-demo.vercel.app/api/v1/accounts/1000000001" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY"
```

## Write example

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/payments" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Idempotency-Key: demo-payment-0001" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentType": "INTERNAL",
    "sourceAccountNumber": "1000000001",
    "destinationAccountNumber": "1000000002",
    "amount": "10.00",
    "description": "API demonstration"
  }'
```

Successful responses use `{ "data": ... }`. Errors use `{ "error": { "code", "message", "fieldErrors"? } }` with an appropriate HTTP status. Money values are decimal strings and callers should reuse the same `Idempotency-Key` when retrying a payment.

## Payment instructions

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/payment-instructions` | List scheduled payments and standing orders |
| `POST` | `/payment-instructions` | Create an instruction without reserving funds |
| `GET` | `/payment-instructions/{reference}` | Read schedule and execution history |
| `POST` | `/payment-instructions/{reference}/cancellation` | Cancel with an expected version and reason |
| `GET` | `/payment-instructions/processing-runs` | List recent processing outcomes |
| `POST` | `/payment-instructions/processing-runs` | Execute all occurrences due on a business date |

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/payment-instructions" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "STANDING_ORDER",
    "paymentType": "INTERNAL",
    "sourceAccountNumber": "1000000002",
    "destinationAccountNumber": "1000000001",
    "amount": "25.00",
    "description": "Monthly demonstration transfer",
    "frequency": "MONTHLY",
    "startDate": "2026-08-15"
  }'

curl -X POST "https://future-bank-demo.vercel.app/api/v1/payment-instructions/processing-runs" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"businessDate":"2026-08-15"}'
```

Each occurrence uses an idempotency key derived from the instruction and scheduled date. Processing rechecks the live account, KYC, restriction, beneficiary, currency and available-balance controls, then delegates to the existing payment service. It either books a balanced ledger transaction, creates a pending payment plus hold, or records a failed occurrence.

## Account statement export

`GET /accounts/{accountNumber}/statement?from=YYYY-MM-DD&to=YYYY-MM-DD` returns an authenticated UTF-8 CSV download. Both dates are inclusive and the period is limited to 366 days. When omitted, the API returns the most recent 90-day period.

The statement derives opening and closing balances from the ordered ledger entries, preserves money as exact decimal strings, separates debit and credit columns, applies `Cache-Control: no-store`, and protects user-entered narrative cells from spreadsheet formula execution.

```bash
curl "https://future-bank-demo.vercel.app/api/v1/accounts/1000000001/statement?from=2026-01-01&to=2026-12-31" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  --output statement.csv
```

## Direct debits

Direct debit mandates and collections are available at:

- `GET|POST /direct-debits`
- `GET /direct-debits/{mandateReference}`
- `POST /direct-debits/{mandateReference}/cancellation`
- `POST /direct-debits/{mandateReference}/collections`

Mandate creation requires an active source account and an active creditor beneficiary owned by the same customer and using the same currency. A mandate reserves no funds. Collection submission requires `Idempotency-Key`, enforces the mandate dates and maximum single amount, and delegates the actual debit to the existing external-payment service. The resulting collection is booked, pending independent approval with a hold, or rejected with a durable failure reason.

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/direct-debits/DDM-000001/collections" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Idempotency-Key: creditor-run-20260802-001" \
  -H "Content-Type: application/json" \
  -d '{"amount":"25.00","collectionDate":"2026-08-02"}'
```

## Payment reversals

- `POST /payments/{paymentReference}/reversals` creates one idempotent, full-value reversal request.
- `GET /payment-reversals` and `GET /payment-reversals/{reversalReference}` expose request, approval and posting state.
- `POST /payment-reversals/{reversalReference}/decision` requires a distinct supervisor, expected work-item version and decision comment.

The original payment and ledger transaction remain immutable. Approval locks the request and original posting and creates a linked equal-and-opposite ledger transaction exactly once; rejection creates no accounting movement. Internal reversals additionally require sufficient available funds at the original destination account.

## End-of-day posting

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/end-of-day-runs` | List recent batch summaries and posting outcomes |
| `POST` | `/end-of-day-runs` | Run charges and daily deposit interest for one business date |
| `GET` | `/end-of-day-runs/{runReference}` | Read one run and its account-level postings |

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/end-of-day-runs" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"businessDate":"2026-08-02"}'
```

Only one run is claimed for a business date. Each eligible account/type occurrence also has a stable idempotency key. Interest uses the product annual rate, a 365-day basis and exact half-up cent rounding; overdraft charges use active effective-dated product rules. Each booked customer leg is paired with an equal-and-opposite currency-clearing leg and updates both balance projections atomically. Failed account postings remain visible with durable failure codes and messages.

## Clearing reconciliation

- `GET|POST /reconciliation-runs` lists runs or reconciles one imported settlement date.
- `GET /reconciliation-runs/{runReference}` returns exact matches and durable exceptions.
- `POST /reconciliation-runs/{runReference}/items/{itemReference}/resolution` resolves an open exception using an expected version and comment.

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/reconciliation-runs" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"businessDate":"2026-07-18"}'
```

The control matches fictional external settlement records to immutable clearing entries by transaction reference, currency, exact decimal amount and direction. Missing-side and mismatch outcomes remain open until a Supervisor or Admin records a version-checked resolution comment. Reconciliation and resolution never alter settlement evidence, clearing entries, ledger transactions, or balances.

## Accounting periods

- `GET /accounting-periods` and `GET /accounting-periods/{periodReference}` expose the period register, versioned close evidence and latest work item.
- `POST /accounting-periods/{periodReference}/close-requests` lets a Supervisor request close with an expected period version and evidence comment.
- `POST /accounting-periods/{periodReference}/close-decisions` lets a distinct Admin approve or reject with the work-item reference, expected work-item version and decision comment.

Close is accepted only after a completed end-of-day run at the end date and a later completed reconciliation that covers every period-end clearing entry. All reconciliation exceptions must be resolved, no processing run may remain active in the period, every ledger transaction must balance and have a posted GL projection, every posted GL journal must reconcile to its lines, and no manual journal may remain pending in the period. The period is frozen while `CLOSING`; approval makes that boundary permanent as `CLOSED`, while rejection returns it to `OPEN`.

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/accounting-periods/ACP-000001/close-requests" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expectedVersion":1,"comment":"Final processing and reconciliation controls are complete."}'
```

## General ledger

- `GET /general-ledger/accounts` returns the 20 seeded GBP/AED/USD/EUR settlement, customer-deposit, loan-receivable, fee-income and interest-expense accounts.
- `GET /general-ledger/journals` and `GET /general-ledger/journals/{journalReference}` expose automated projections and manual-journal evidence.
- `GET /general-ledger/trial-balance?toDate=YYYY-MM-DD&fromDate=YYYY-MM-DD&currency=GBP` aggregates posted journals only; `toDate` is required.
- `POST /general-ledger/journals` lets a Supervisor submit a same-currency debit and credit with `Idempotency-Key`.
- `POST /general-ledger/journals/{journalReference}/decision` lets a distinct Admin approve or reject with the work-item reference, expected version and comment.

Every booked subledger writer creates its posted GL journal and balanced lines in the same database transaction. Manual journals do not affect the trial balance while pending and rejection creates no movement.

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/general-ledger/journals" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Idempotency-Key: manual-journal-demo-0001" \
  -H "Content-Type: application/json" \
  -d '{"valueDate":"2026-08-02","currency":"GBP","debitAccountCode":"5100-GBP","creditAccountCode":"1100-GBP","amount":"25.00","description":"Fictional accrual correction","comment":"Prepared from fictional period-end evidence."}'
```

## Loan origination

## KYC case controls

- `GET /kyc-cases` includes `locked`, `lockReason`, `lockedAt` and `version` on every register row.
- `POST /kyc-cases/{caseReference}/lock` accepts `{ "locked": true|false, "reason": "...", "expectedVersion": 1 }`. All authenticated staff personas may toggle the lock; the operation is audited and version-checked.
- A locked case remains readable but rejects CDD, evidence, screening, submission and decision mutations until unlocked.
- `POST /kyc-cases/{caseReference}/evidence` records evidence metadata including `documentReference`, `documentNumber`, `issuedAt`, `expiresAt`, `firstName` and `lastName`; `GET /kyc-cases/{caseReference}` returns those fields. Customer identity documents use the same `documentReference`/`documentNumber` pairing.
- `PATCH /kyc-cases/{caseReference}/evidence/{evidenceReference}` corrects evidence metadata without changing verification status or uploading document bytes.

- `GET /loans` and `GET /loans/{applicationReference}` expose applications, independent-work state and any booked repayment schedule.
- `POST /loans` lets an Operator or Admin submit a proposal with `Idempotency-Key`; it does not move money.
- `POST /loans/{applicationReference}/decision` lets a distinct Supervisor or Admin approve or reject using the work-item reference, expected version and evidence comment.

Submission requires an active customer with approved KYC, no blocking restriction, an active loan product and the customer's own active same-currency deposit account. Principal is limited to 1,000.00–1,000,000.00, term to 6–60 months, and total projected debt service to 40% of monthly income. Approval rechecks every live control and the open posting date. It then atomically creates one read-only loan account, exact equal-principal/decreasing-interest schedule, balanced subledger disbursement, loan-receivable/customer-deposit GL projection and destination credit. Concurrent or retried approval cannot book twice; rejection has no accounting effect.

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/loans" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -H "Idempotency-Key: loan-demo-0001" \
  -H "Content-Type: application/json" \
  -d '{"customerNumber":"C000004","productCode":"LOAN-GBP","destinationAccountNumber":"1000000009","principal":"12000.00","termMonths":12,"firstPaymentDate":"2026-09-01","monthlyIncome":"20000.00","monthlyCommitments":"1000.00","purpose":"Fictional working-capital demonstration evidence.","riskGrade":"B"}'
```

Customer names, short names, addresses and descriptive fields accept Unicode, including Arabic script. Customer search accepts Arabic names and the Latin transliterations retained in seeded short names. Structured banking identifiers such as customer numbers, account numbers, IBANs, country codes, dates and money remain LTR formatted.

## Customer document examples

The document collection is the canonical API. Each file has a `documentReference` and `documentType`; the former is shared with identity metadata. Passport and National ID are seeded document types, not API route slots.

```bash
# List all customer documents
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY"

# Add any document type to the collection
curl -X POST "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \
  -F "documentReference=IDN-C000001-VISA-001" \
  -F "documentType=VISA" \
  -F "file=@visa.pdf;type=application/pdf"

# Read safe metadata by document reference (never returns a private Blob URL)
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/IDN-C000001-NATIONAL_ID" \
  -H "Authorization: Bearer $FUTUREBANK_ACTOR_API_KEY"

# Stream the authenticated file bytes
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/IDN-C000001-PASSPORT/content" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" --output passport.jpg

# Compatibility response for clients that cannot preserve binary HTTP bodies
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/IDN-C000001-PASSPORT/content?encoding=base64" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" --output passport.json

# Delete by document reference (idempotent; reset restores Amelia Hart's seeded originals)
curl -X DELETE "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/IDN-C000001-PASSPORT" \
  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY"
```

`POST` accepts `documentReference`, `documentType` and one `multipart/form-data` field named `file`, returning `201` for a new reference or `200` when replacing it. Only non-empty JPEG, PNG and PDF files up to 4,194,304 bytes are accepted; the declared MIME type must match the file signature. `GET .../{documentReference}/content` returns raw authenticated bytes with `Content-Type`, `Content-Length`, `Content-Disposition`, `ETag` and `Cache-Control: no-store`. For connectors that cannot preserve binary response bodies, add `?encoding=base64`; the response is JSON-wrapped and its `data.contentBase64` field decodes to the exact original bytes. All other document operations use the standard JSON envelope.

## OpenAPI

- Canonical source: `openapi/futurebank.v1.source.json`
- Generated repository artifact: `openapi/futurebank.v1.json`
- Runtime document: `/api/openapi.json`
- API discovery: `/api/v1`

Run `npm run openapi:generate` after changing the canonical source and commit both source and artifact. `npm run openapi:check` validates OpenAPI 3.0.3 and fails when the generated artifact is stale. The document lists every implemented route with unique operation IDs, descriptions, typed success and error contracts, API-key and Bearer alternatives, actor selection, examples, upload constraints and raw binary document responses. The OpenAPI endpoint is public so tooling can import it without first configuring authentication; business endpoints remain authenticated.
