# FutureBank REST API

The FutureBank API is a fictional integration surface for demonstrations and automation. It supports reads and controlled writes across customers, customer documents, accounts, beneficiaries, payments, KYC, overdrafts and work items.

## Authentication and actors

Configure a random `FUTUREBANK_API_KEY` in the local or Vercel environment. Send it using either header:

```text
X-API-Key: <key>
Authorization: Bearer <key>
```

For mutations, `X-Staff-Username` selects an active seeded staff actor. If omitted, the API uses `FUTUREBANK_API_DEFAULT_USERNAME`, then `bp.operator`. This is deliberately simple demo authentication: possession of the shared API key permits selection of any seeded actor. Do not use it as a production banking-security model.

The selected actor is passed through the normal application control layer. Operator, Supervisor, Compliance and Admin permissions, maker-checker separation, optimistic versions, account locks, idempotency, KYC restrictions, payment holds, double-entry posting and audit events are still enforced.

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
