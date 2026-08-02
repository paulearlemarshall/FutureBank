# FutureBank REST API

The FutureBank API is a fictional integration surface for demonstrations and automation. It supports reads and controlled writes across customers, customer documents, accounts, beneficiaries, immediate payments, payment instructions, direct debits, payment reversals, end-of-day posting, clearing reconciliation, general-ledger journals and trial balances, accounting-period close, KYC, overdrafts and work items.

## External discovery and accessibility

An external actor can discover the contract without credentials:

- `GET /api/openapi.json` returns the complete OpenAPI 3.0 document.
- `GET /api/v1` returns authenticated runtime discovery, including the API version and top-level resources.
- The production OpenAPI URL is `https://future-bank-demo.vercel.app/api/openapi.json`.

The OpenAPI document is self-describing for paths, methods, request and response schemas, actor headers, permissions and error shapes. It deliberately does not publish an API key. An external caller still needs `FUTUREBANK_API_KEY` from the environment owner before any `/api/v1` business route is accessible.

## Authentication and actors

Configure a random `FUTUREBANK_API_KEY` in the local or Vercel environment. Send it using either header:

```text
X-API-Key: <key>
Authorization: Bearer <key>
```

For mutations, `X-Staff-Username` selects an active seeded staff actor. If omitted, the API uses `FUTUREBANK_API_DEFAULT_USERNAME`, then `bp.operator`. This is deliberately simple demo authentication: possession of the shared API key permits selection of any seeded actor. Do not use it as a production banking-security model.

The selected actor is passed through the normal application control layer. Operator, Supervisor, Compliance and Admin permissions, maker-checker separation, optimistic versions, account locks, idempotency, KYC restrictions, payment holds, double-entry posting and audit events are still enforced.

Payment-instruction permissions are separated: Operator maintains instructions and Supervisor executes due-instruction runs. Admin can do both. An occurrence is initiated under the instruction creator's identity, so an external payment that becomes pending still requires an independent payment checker.

End-of-day execution is restricted to Supervisor and Admin. Product charge rules and product interest rates are read from the database; callers cannot supply a rate or amount in the run request.

## Read example

```bash
curl "https://future-bank-demo.vercel.app/api/v1/accounts/1000000001" \
  -H "X-API-Key: $FUTUREBANK_API_KEY"
```

## Write example

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/payments" \
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.operator" \
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
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.operator" \
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
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.supervisor" \
  -H "Content-Type: application/json" \
  -d '{"businessDate":"2026-08-15"}'
```

Each occurrence uses an idempotency key derived from the instruction and scheduled date. Processing rechecks the live account, KYC, restriction, beneficiary, currency and available-balance controls, then delegates to the existing payment service. It either books a balanced ledger transaction, creates a pending payment plus hold, or records a failed occurrence.

## Account statement export

`GET /accounts/{accountNumber}/statement?from=YYYY-MM-DD&to=YYYY-MM-DD` returns an authenticated UTF-8 CSV download. Both dates are inclusive and the period is limited to 366 days. When omitted, the API returns the most recent 90-day period.

The statement derives opening and closing balances from the ordered ledger entries, preserves money as exact decimal strings, separates debit and credit columns, applies `Cache-Control: no-store`, and protects user-entered narrative cells from spreadsheet formula execution.

```bash
curl "https://future-bank-demo.vercel.app/api/v1/accounts/1000000001/statement?from=2026-01-01&to=2026-12-31" \
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
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
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.operator" \
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
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.supervisor" \
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
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.supervisor" \
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
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.supervisor" \
  -H "Content-Type: application/json" \
  -d '{"expectedVersion":1,"comment":"Final processing and reconciliation controls are complete."}'
```

## General ledger

- `GET /general-ledger/accounts` returns the 16 seeded GBP/AED/USD/EUR settlement, customer-control, fee-income and interest-expense accounts.
- `GET /general-ledger/journals` and `GET /general-ledger/journals/{journalReference}` expose automated projections and manual-journal evidence.
- `GET /general-ledger/trial-balance?toDate=YYYY-MM-DD&fromDate=YYYY-MM-DD&currency=GBP` aggregates posted journals only; `toDate` is required.
- `POST /general-ledger/journals` lets a Supervisor submit a same-currency debit and credit with `Idempotency-Key`.
- `POST /general-ledger/journals/{journalReference}/decision` lets a distinct Admin approve or reject with the work-item reference, expected version and comment.

Every booked subledger writer creates its posted GL journal and balanced lines in the same database transaction. Manual journals do not affect the trial balance while pending and rejection creates no movement.

```bash
curl -X POST "https://future-bank-demo.vercel.app/api/v1/general-ledger/journals" \
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.supervisor" \
  -H "Idempotency-Key: manual-journal-demo-0001" \
  -H "Content-Type: application/json" \
  -d '{"valueDate":"2026-08-02","currency":"GBP","debitAccountCode":"5100-GBP","creditAccountCode":"1100-GBP","amount":"25.00","description":"Fictional accrual correction","comment":"Prepared from fictional period-end evidence."}'
```

Customer names, short names, addresses and descriptive fields accept Unicode, including Arabic script. Customer search accepts Arabic names and the Latin transliterations retained in seeded short names. Structured banking identifiers such as customer numbers, account numbers, IBANs, country codes, dates and money remain LTR formatted.

## Customer document examples

```bash
# List Passport and National ID slots
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents" \
  -H "X-API-Key: $FUTUREBANK_API_KEY"

# Read safe metadata for one slot (never returns a private Blob URL)
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/NATIONAL_ID" \
  -H "Authorization: Bearer $FUTUREBANK_API_KEY"

# Upload or replace the Passport slot (maximum 4 MB)
curl -X PUT "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/PASSPORT" \
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.operator" \
  -F "file=@Passport-AmeliaHart.jpg;type=image/jpeg"

# Stream the authenticated file bytes
curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/PASSPORT/content" \
  -H "X-API-Key: $FUTUREBANK_API_KEY" --output passport.jpg

# Delete a slot (idempotent; reset restores Amelia Hart's seeded originals)
curl -X DELETE "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/PASSPORT" \
  -H "X-API-Key: $FUTUREBANK_API_KEY" \
  -H "X-Staff-Username: bp.operator"
```

`PUT` accepts one `multipart/form-data` field named `file` and returns `201` for an empty slot or `200` when replacing a file. Only non-empty JPEG, PNG and PDF files up to 4,194,304 bytes are accepted; the declared MIME type must match the file signature. `GET .../content` returns raw authenticated bytes with `Content-Type`, `Content-Length`, `Content-Disposition`, `ETag` and `Cache-Control: no-store`. All other document operations use the standard JSON envelope.

## OpenAPI

- Canonical source: `openapi/futurebank.v1.source.json`
- Generated repository artifact: `openapi/futurebank.v1.json`
- Runtime document: `/api/openapi.json`
- API discovery: `/api/v1`

Run `npm run openapi:generate` after changing the canonical source and commit both source and artifact. `npm run openapi:check` validates OpenAPI 3.0.3 and fails when the generated artifact is stale. The document lists every implemented route with unique operation IDs, descriptions, typed success and error contracts, API-key and Bearer alternatives, actor selection, examples, upload constraints and raw binary document responses. The OpenAPI endpoint is public so tooling can import it without first configuring authentication; business endpoints remain authenticated.
