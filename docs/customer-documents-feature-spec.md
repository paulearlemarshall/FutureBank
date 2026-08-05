# Customer documents — implemented architecture

FutureBank exposes a scalable customer document collection. Each file is keyed by `documentReference` and classified by `documentType`; Passport and National ID are seeded types. File bytes are held in a private Vercel Blob store; Neon holds the customer relationship, safe display metadata, private blob locator, ETag and audit history. The existing `identity_documents` metadata table is intentionally unchanged.

## Controls

- Files must be non-empty JPEG, PNG or PDF and no larger than 4 MB.
- MIME type and file signature must agree; filenames are reduced to a safe basename.
- Any authenticated active staff user may view a document through an authenticated proxy route.
- Upload, replacement and deletion require `KYC_GATHER` (`OPERATOR` or `ADMIN`).
- Private Blob URLs and bytes are never returned in DTOs or written to audit JSON.
- Browser uploads use a ten-minute, customer-and-reference-scoped Vercel Blob token. REST uploads use multipart form data.

## User interface and automation

The customer Documents tab always renders fixed Passport and National ID cards with stable `data-bp` selectors and persistent status regions. Card identity is based only on the document slot so upload and delete results remain visible across an App Router refresh. Image preview URLs include the document `uploadedAt` value as a version parameter, ensuring a replacement loads the new private file without remounting the card or requiring a full page reload. Document content remains authenticated and is served with `Cache-Control: no-store`.

## REST API

- `GET /api/v1/customers/{customerNumber}/documents`
- `GET /api/v1/customers/{customerNumber}/documents/{documentReference}`
- `GET /api/v1/customers/{customerNumber}/documents/{documentReference}/content`
- `POST /api/v1/customers/{customerNumber}/documents` with `documentReference`, `documentType` and multipart field `file`
- `DELETE /api/v1/customers/{customerNumber}/documents/{documentReference}`

All endpoints require an actor-owned FutureBank API key. Writes apply the key owner's permissions. The content endpoint is the only route that returns raw bytes instead of a `{data}` JSON envelope.

## Deterministic baseline

Amelia Hart (`C000001`) has both supplied `TestDocs` images. Generated fixture constants make resets independent of the function filesystem. Seed blobs use immutable hash-addressed paths and Neon rows use stable IDs, `system.seed`, deterministic timestamps and `is_seeded=true`.

Uploaded/replaced documents may be deleted during a demonstration. Reset re-establishes the original seed blobs and metadata, then removes unreferenced non-seed blobs within only the current production, preview, development or CI namespace.

The normal browser suite verifies seeded document access and selectors. A separate GitHub CI job runs the complete direct-to-Blob journey through a temporary public tunnel: upload, callback finalization, replacement with a changed preview URL, deletion, and environment-scoped Blob cleanup.
