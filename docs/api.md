# FutureBank REST API

The FutureBank API is a fictional integration surface for demonstrations and automation. It supports reads and controlled writes across customers, customer documents, accounts, beneficiaries, immediate payments, payment instructions, KYC, overdrafts and work items.

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
