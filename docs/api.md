# FutureBank REST API

The FutureBank API is a fictional integration surface for demonstrations and automation. It supports reads and controlled writes across customers, accounts, beneficiaries, payments, KYC, overdrafts and work items.

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

## OpenAPI

- Repository artifact: `openapi/futurebank.v1.json`
- Runtime document: `/api/openapi.json`
- API discovery: `/api/v1`

The OpenAPI document lists every implemented route and the API-key security scheme. The OpenAPI endpoint is public so tooling can import it without first configuring authentication; business endpoints remain authenticated.
