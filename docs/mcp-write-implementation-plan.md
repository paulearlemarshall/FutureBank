# FutureBank MCP write implementation plan

Status: implementation in progress. This branch now includes customer/account controls, beneficiary operations, KYC maker-checker and work-item tools, immediate payments/reversals, scheduled payment instructions, direct debits, overdrafts, accounting workflows, loan origination, and customer-document deletion. Full database verification remains a release gate; full-size document upload still needs a staging and binary-transfer flow.
Baseline: `c34b183`, inspected 25 September 2026.

### First implementation slice (25 September 2026)

Implemented in the working tree: `list_kyc_cases`, `get_kyc_case`, `open_kyc_case`, `update_kyc_cdd`, `record_kyc_evidence`, `update_kyc_evidence`, and `run_kyc_screening`. These are low-scope preparation operations that do not decide cases or book financial movements. Create responses now include machine-readable case/evidence references. The MCP API adapter preserves structured API validation errors and converts thrown route failures through the same safe API error boundary. Adapter tests cover success, error fidelity, unexpected failures and malformed success envelopes.

This branch adds the KYC completion and work-item tools, plus a disposable-DB integration verification in `scripts/verify-workflows.ts`. It exercises Operator preparation/submission, rejects Operator decision, then lets Compliance claim and approve, checking the structured references, read projection and audit identities. The local Docker daemon and PostgreSQL service are unavailable, and `.env.local` targets an existing Neon development branch; do not run the destructive reset verifier against that branch. The new database gate still needs to run in CI or a new isolated Neon branch before treating the prerequisite as complete.

The current slice adds payment and reversal list/detail reads, immediate payment submission, approval/rejection, pending-payment expiry, reversal initiation and independent reversal decisions. Idempotency keys are forwarded in the API's `Idempotency-Key` header; action responses expose references and resulting states in structured data. The routes retain the existing permission, hold, ledger, maker-checker and audit behavior. This slice still needs CI's disposable-database workflow verification before release.

The scheduled-payment instruction and direct-debit slice adds mandate/collection reads and writes, including processing history. Cancellation uses the API's optimistic version and reason fields, due instruction processing is explicit by business date, and direct-debit collection idempotency is sent in the API header. Responses carry created references, run totals and collection state as structured data. Database-backed workflow verification remains outstanding.

The customer/account slice adds restriction application/lifting and account opening/status control, along with account and product discovery reads. Account opening returns its generated account number and opening-deposit amount; any positive deposit is booked by the existing balanced-ledger transaction. Account status changes and restriction actions preserve the action-layer authority and audit trail. This slice also requires database-backed workflow verification.

The current slice adds facility and alert reads plus overdraft applications, limit-change requests, maker-checker decisions, suspend/close and alert resolution. Application and limit-change actions now return both facility and work-item references; decision responses report the resulting state, including declined limit changes that leave an existing facility active. Existing KYC, debit-block, utilization, hold and checker controls remain authoritative. Database-backed verification is still outstanding.

The current slice completes EOD, reconciliation, accounting-period close, manual GL journal and loan-origination capabilities, together with their read models. Date-scoped runs return durable references and outcomes; journal/loan submission keys are sent as API headers; maker-checker responses expose references and resulting states. EOD and loan approval can book ledger movements, period close can block posting dates, and these tools are documented with those effects. Database-backed verification remains outstanding.

## 1. Outcome and scope

Expose every currently implemented banking write capability through explicit MCP tools at `/mcp`, using the same actor authentication, permissions, validation, transactions and audit behavior as the REST API and UI. Preserve the four existing read tools and add the reads required to complete workflows without guessing identifiers or versions.

The canonical OpenAPI source currently defines **47 write operations**. The target catalog below maps all 47. Document upload requires a file-transfer design in addition to a tool adapter. Products, reporting, statements and audit history are read capabilities; do not invent write operations for them. Reconciliation currently consumes existing settlement evidence; do not imply that a new settlement-import capability exists.

Default scope excludes demo reset, authentication/credential management and branding. Reset is a destructive UI action; branding has separate session-authenticated routes outside the versioned banking API. Optional administrative scope is described in section 10. No deferred roadmap module becomes writable merely because MCP can advertise it.

## 2. Current implementation and gaps

Owners inspected:

- `src/lib/mcp/server.ts`: four read tools, JSON responses, Streamable HTTP, 64 KB request limit, Host/Origin checks.
- `src/lib/api/http.ts`: actor-key verification and request-local actor context, API error envelope and action-response conversion.
- `src/lib/api/router.ts`: REST adapters calling existing Server Actions/services; document uploads require multipart input.
- `openapi/futurebank.v1.source.json`: public request/response contracts.
- `src/modules/actions/`, `src/modules/services/`: actual validation, permissions, transaction and mutation owners.
- `src/modules/domain/auth-policy.ts`, `workflow-policy.ts`: role permissions and checker eligibility.
- `src/components/banking/*forms.tsx`, document UI and brand manager: user-visible operations, confirmation fields, references and versions.

Specific gaps to resolve:

1. Resolved for current JSON operations: the MCP API adapter accepts an explicit method, body and headers, returns status and structured errors, and converts thrown router failures through the safe API error boundary. File-upload transport remains separate.
2. Mostly resolved for implemented domains: write responses now expose structured references/statuses where clients need them. Document finalization and its receipt/retry contract remain to be designed.
3. Existing idempotency is not universal. Explicit API header contracts cover payments, reversals, direct-debit collections, manual journals and loan applications. Other operations use varying version, date or state controls; audit each separately.
4. Supporting reads are now exposed for accounts, products, work items, approvals, runs, periods, ledgers and loans. Document staging/finalization reads and any missing UI branch-choice discovery remain to be assessed.
5. A 4 MB document cannot fit in a 64 KB MCP request. Base64 also adds roughly one third to byte size. Raising the global limit does not by itself solve hosting or client payload limits.
6. Some business rules live directly in Server Actions. Reuse the established router/action path initially; extract shared services only where a concrete response, retry or file-transfer change requires it.
7. Production authentication remains an unresolved release prerequisite: the previous production probe rejected the locally available key. That result does not establish why it was rejected or that it is exclusively a development key. Diagnose before issuing or rotating any credentials.

## 3. Complete proposed write catalog

Paths below are relative to `/api/v1`. Tools take path references as named arguments and validated body fields from the corresponding OpenAPI operation. Combined decision/status tools expose only the enums valid for that operation, not the broadest enum in a shared schema.

| # | Proposed tool | API operation / UI capability |
|---|---|---|
| 1 | `create_customer` | POST `/customers`; full retail/SME onboarding fields |
| 2 | `update_customer` | PATCH `/customers/{customerNumber}`; complete mutable CRM values, not an arbitrary partial patch |
| 3 | `apply_customer_restriction` | POST `/customers/{customerNumber}/restrictions`; type and reason |
| 4 | `lift_customer_restriction` | POST `/customers/{customerNumber}/restrictions/{restrictionReference}/lift`; reason |
| 5 | `open_account` | POST `/accounts`; customer, product, branch, nickname and initial deposit |
| 6 | `set_account_status` | PATCH `/accounts/{accountNumber}/status`; activate, block or close with reason |
| 7 | `create_beneficiary` | POST `/beneficiaries`; customer, bank/account identifiers and currency |
| 8 | `set_beneficiary_status` | PATCH `/beneficiaries/{beneficiaryId}`; active/inactive |
| 9 | `submit_payment` | POST `/payments`; internal/external discriminated input and idempotency key |
| 10 | `decide_payment` | POST `/payments/{paymentReference}/decision`; approve/reject |
| 11 | `expire_pending_payments` | POST `/payments/expiry-run`; expire eligible pending payments and release holds |
| 12 | `request_payment_reversal` | POST `/payments/{paymentReference}/reversals`; full reversal, reason and idempotency key |
| 13 | `decide_payment_reversal` | POST `/payment-reversals/{reversalReference}/decision` |
| 14 | `create_payment_instruction` | POST `/payment-instructions`; scheduled payment or standing order |
| 15 | `cancel_payment_instruction` | POST `/payment-instructions/{instructionReference}/cancellation`; version and reason |
| 16 | `run_payment_instructions` | POST `/payment-instructions/processing-runs`; business date, potentially many occurrences |
| 17 | `create_direct_debit_mandate` | POST `/direct-debits`; existing mandate contract |
| 18 | `cancel_direct_debit_mandate` | POST `/direct-debits/{mandateReference}/cancellation`; version and reason |
| 19 | `submit_direct_debit_collection` | POST `/direct-debits/{mandateReference}/collections`; amount, collection date and idempotency key |
| 20 | `run_end_of_day` | POST `/end-of-day-runs`; business date, server-owned rates and calculated postings |
| 21 | `run_reconciliation` | POST `/reconciliation-runs`; business date and existing imported evidence |
| 22 | `resolve_reconciliation_item` | POST `/reconciliation-runs/{runReference}/items/{itemReference}/resolution`; version and comment |
| 23 | `request_accounting_period_close` | POST `/accounting-periods/{periodReference}/close-requests`; version and comment |
| 24 | `decide_accounting_period_close` | POST `/accounting-periods/{periodReference}/close-decisions` |
| 25 | `submit_manual_journal` | POST `/general-ledger/journals`; same-currency debit/credit accounts, amount, date, description, comment, idempotency key |
| 26 | `decide_manual_journal` | POST `/general-ledger/journals/{journalReference}/decision` |
| 27 | `submit_loan_application` | POST `/loans`; product, destination, exact principal, term, affordability evidence and idempotency key |
| 28 | `decide_loan_application` | POST `/loans/{applicationReference}/decision` |
| 29 | `open_kyc_case` | POST `/kyc-cases`; customer and case type |
| 30 | `set_kyc_case_lock` | POST `/kyc-cases/{caseReference}/lock`; locked, reason and case version |
| 31 | `update_kyc_cdd` | PATCH `/kyc-cases/{caseReference}/cdd`; complete CDD profile |
| 32 | `record_kyc_evidence` | POST `/kyc-cases/{caseReference}/evidence`; metadata only |
| 33 | `update_kyc_evidence` | PATCH `/kyc-cases/{caseReference}/evidence/{evidenceReference}` |
| 34 | `verify_kyc_evidence` | POST `/kyc-cases/{caseReference}/evidence-verification`; accept/reject evidence using existing contract |
| 35 | `run_kyc_screening` | POST `/kyc-cases/{caseReference}/screening`; fictional screening |
| 36 | `resolve_kyc_screening` | POST `/kyc-cases/{caseReference}/screening-resolution`; match reference, outcome and comment |
| 37 | `submit_kyc_case` | POST `/kyc-cases/{caseReference}/submission`; existing completeness/risk gates |
| 38 | `decide_kyc_case` | POST `/kyc-cases/{caseReference}/decision`; decision, risk/override fields where applicable |
| 39 | `apply_for_overdraft` | POST `/overdrafts`; existing facility application contract |
| 40 | `request_overdraft_limit_change` | POST `/overdrafts/{facilityReference}/limit-changes`; requested limit and reason |
| 41 | `decide_overdraft` | POST `/overdrafts/{facilityReference}/decision`; application/change approval or decline |
| 42 | `set_overdraft_status` | POST `/overdrafts/{facilityReference}/status`; suspend or close, with reason |
| 43 | `resolve_overdraft_alert` | POST `/overdraft-alerts/{alertReference}/resolution`; intervention and comment |
| 44 | `claim_work_item` | POST `/work-items/{workItemReference}/claim`; expected work-item version |
| 45 | `release_work_item` | POST `/work-items/{workItemReference}/release`; expected work-item version |
| 46 | `upload_customer_document` | POST `/customers/{customerNumber}/documents`; add or replace by documentReference; file handling in section 7 |
| 47 | `delete_customer_document` | DELETE `/customers/{customerNumber}/documents/{documentReference}` |

Do not expose a generic `call_api(method, path, body)` tool. Maintain an explicit operation allowlist and typed schemas. Existing source validation governs required fields; verify every mapping against its action and UI form before registering it.

## 4. Supporting reads and result contracts

Retain `search_customers`, `get_customer`, `get_account`, `get_account_statement` unchanged. Add explicit list/detail tools for accounts, products, beneficiaries, payments, reversals, instructions and processing runs, mandates and collection history, KYC cases, facilities/alerts, work items, EOD runs, reconciliation runs/items, accounting periods, GL accounts/journals/trial balance, loans and document metadata. Reuse nested details where they already contain history. Branch choices must come from an existing authoritative source; add a narrow REST discovery route if no suitable route exists.

Add `get_current_actor` with safe actor identity, role and permitted capabilities. Never accept `actorId`, staff username, credentials or permission overrides as tool arguments. Audit reads remain bounded and authenticated. Use pagination/filters for large lists and expose versions exactly as owned by the domain.

Proposed write response:

```json
{
  "ok": true,
  "code": "PAYMENT_PENDING_APPROVAL",
  "message": "Payment submitted for approval.",
  "data": {
    "paymentReference": "<returned reference>",
    "status": "PENDING",
    "workItem": {"reference": "<returned reference>", "version": 1}
  },
  "correlationId": "<server-generated identifier>"
}
```

This is a proposed shape, not the current API payload or a promise that this exact code already exists. Preserve actual domain codes. Return MCP `structuredContent` and a concise text rendering with consistent semantics. Preserve existing read-tool text contracts. Never label `PENDING`, `PENDING_APPROVAL`, an HTTP 202, or an accepted processing request as a completed posting.

Add references, status and versions at the authoritative action/service result boundary where missing; update REST/OpenAPI accordingly. Do not parse message strings or perform an unscoped “latest created record” lookup. A successful mutation followed by a failed read-back must remain a successful mutation with incomplete enrichment, not become a retryable failure.

Map domain/validation failures to `isError: true` with safe `code`, `message`, `fieldErrors` and HTTP status. Preserve transport authentication errors and protocol-level errors distinctly. Catch both non-2xx responses and thrown `ApiError`/domain errors; unexpected errors get a safe internal-error result with no SQL, stack, key or Blob locator.

## 5. Architecture and authorization

Keep `/mcp` on the Node runtime. Proposed modules:

```text
src/lib/mcp/server.ts          handler, authentication and server construction
src/lib/mcp/api-adapter.ts     internal Request construction and result/error mapping
src/lib/mcp/catalog.ts         explicit operation, permission and annotation metadata
src/lib/mcp/schemas.ts         shared boundary types/schema adapters
src/lib/mcp/tools/*.ts         registration grouped by banking domain
tests/mcp-*.test.ts            schema, routing and transport contracts
```

Execute each tool inside the existing authenticated actor context and call `routeApiRequest` using a fixed internal URL, explicit method and serialized body. Do not make a network call back to Vercel for ordinary banking operations or forward user-supplied URLs/headers. Reuse existing permissions at mutation boundaries. Any extracted service must enforce the same controls for both REST/UI and MCP callers.

Keep discovery stable across roles in the first release, with documented required capabilities; enforcement remains authoritative at execution. Optional server configuration can disable write groups, and must deny execution as well as omit discovery. MCP annotations communicate intent, not authorization: writes set `readOnlyHint: false`; use conservative destructive hints for debits, decisions, restrictions, closure, cancellation and deletion. Set `idempotentHint` true only where repeat behavior is actually established. Financial business-date runs are not automatically harmless or globally idempotent just because a date key exists.

Permission examples from the current policy:

- Operator: customer maintenance, KYC gathering/screening, payment and reversal initiation, instruction maintenance, direct debits, overdraft and loan initiation.
- Supervisor: payment/reversal/overdraft/loan decisions, scheduled execution, EOD, reconciliation, period-close requests and manual-journal submission.
- Compliance: KYC decisions and restrictions.
- Admin: extensive but explicit permissions; notably period-close initiation and manual-journal initiation are not granted by the current permission table. Do not assume Admin is a universal permission bypass.

Work-item claim/release follows workflow-type eligibility and assignment ownership. Exact evidence verification, account maintenance and alert rules come from their actions, not inferred role labels.

## 6. Versions, retries and approval behavior

Decision input includes the entity reference, work-item reference, **current work-item version**, allowed decision and comment, plus domain-specific fields. Case/period/item versions must not be confused with work-item versions. A claim increments the version; clients must reread or use the returned new version before deciding.

Maker and checker must be distinct staff users even when both hold Admin-capable credentials. Use separate WorkHQ connections or a real handoff between actors; do not equip one autonomous flow to select another identity in tool arguments. Client confirmation does not satisfy bank maker-checker rules. Conversely, not every write currently requires bank approval: eligible immediate payments and account opening may post immediately. Tool descriptions must state that effect plainly.

For existing idempotent submissions, require a stable caller-supplied `idempotencyKey` and forward it as `Idempotency-Key`. A transport retry uses the same key and identical intended payload. Before advertising safe retries, verify actor scoping, payload mismatch handling, concurrent duplicates and response replay in each service. Where those guarantees are absent, fix the shared service contract first.

For creates without replay protection (such as customer/account/beneficiary/instruction/mandate creation), add a durable operation receipt at the shared mutation owner before enabling automatic retries. Proposed receipt identity: actor + operation + caller key, with canonical payload hash, outcome/reference and timestamps, protected by a unique constraint. Persist receipt completion atomically with the banking mutation; define recovery for in-progress or uncertain outcomes. Do not claim exactly-once execution from an MCP-only cache written after a transaction commits. Keep credentials and document content out of receipts.

Version-protected decisions/cancellations may safely reject a duplicate as stale; that is not response replay. On a conflict or lost response, read current entity/work-item state before taking another action. Never silently fetch a newer version and retry a rejected decision. State setters and screening may create audit/history effects even when final state looks unchanged; assess those separately.

For date-scoped runs, return the durable run reference/status and outcomes from existing run tables. Check actual runtime duration against hosting limits. If necessary, introduce a durable job handoff shared by REST/MCP, with polling reads; an in-memory promise is not a background job.

## 7. Customer document design

Preserve private Blob storage, supported JPEG/PNG/PDF signatures, the 4 MB limit, replacement concurrency behavior and seeded-original protection. KYC evidence metadata and uploaded customer files remain separate capabilities.

Recommended full-size flow:

1. Add an authenticated staging contract for a file transfer, bound to actor, customer, document reference/type and short expiry.
2. WorkHQ transfers bytes through a dedicated binary upload channel. Use the established private-Blob client upload mechanism where suitable; staging must not change the current document record.
3. `upload_customer_document` accepts an opaque upload reference plus expected metadata and finalizes the upload using shared document validation/persistence rules.
4. Consume the reference with durable replay behavior, recheck the actor, verify actual bytes and signature, update the current document atomically, and clean abandoned staging objects by environment namespace.
5. Return safe metadata and authenticated application references. Never return private Blob locators or accept arbitrary remote URLs/local filesystem paths.

This adds a staging API and small persistent upload-session model; it is not a direct wrapper around today's multipart route. Retain the existing REST multipart route for compatibility and converge finalization on one document owner. WorkHQ must support the external byte-transfer step. Validate this integration early; if it cannot, present a bounded small-file MCP option with an explicit size limit, and do not claim full 4 MB parity. Full document capability is a release acceptance item, not silently omitted.

## 8. Delivery phases and acceptance gates

| Phase | Implementation | Exit condition |
|---|---|---|
| 0 — contract inventory | Record all 47 mappings, action permissions, request schemas, current responses, version owner and retry guarantees. Compare each to UI controls. Validate WorkHQ transport/file support. | Complete operation manifest; no unclassified write; document transfer approach confirmed. |
| 1 — shared foundation | Adapter, structured errors/results, domain registrations, supporting reads, actor discovery, feature controls. Fill missing structured results in shared owners. | Existing four reads stay compatible; actor context and errors work through real MCP calls. |
| 2 — customer operations | Customer/account/beneficiary writes, applicable retry receipts, work-item reads/claim/release. | Creation results return exact references; concurrent/repeated create behavior is proven. |
| 3 — compliance and overdrafts | Complete KYC, restriction and overdraft workflows. | Gathering-to-decision journeys work with distinct actors; locks, evidence and risk gates hold. |
| 4 — payments | Immediate payments, decisions, expiry, reversals, instructions and direct debits. | Holds, approval, replay, expiry, reversal and scheduled processing preserve balances and audit history. |
| 5 — accounting and lending | EOD, reconciliation/resolution, period close, manual journals and loans. | Shared posting guards, exact journals, close gates and disbursement invariants pass. |
| 6 — document integration | Staging, byte transfer, MCP finalization, replacement and deletion. Can begin alongside phase 2 once foundation settles. | Real private-Blob journey proves full-size upload, replacement, retry and cleanup. |
| 7 — integration and release | WorkHQ examples, generated docs, production credentials diagnosis, preview validation, release and smoke checks. | All 47 operations covered, CI green, production Ready and valid actor-authenticated checks pass. |

Use separate reviewable PRs per phase or cohesive domain group. Dependency order is foundation → domain adapters; document infrastructure can proceed independently after contract agreement. Estimate effort only after the receipt gaps and WorkHQ file-transfer capability are resolved; those determine whether this is chiefly adapter work or includes substantial shared infrastructure.

## 9. Verification and rollout

Tests must prove boundaries rather than duplicate registration code:

- Catalog completeness: all 47 OpenAPI write operations mapped, with explicit exclusions recorded for any changed scope; enums, required fields, money strings and headers agree with the canonical contract.
- Real MCP transport: initialize/discovery/call, denied/missing/revoked keys, inactive staff, host/origin/body limits, malformed payloads and concurrent requests under different actors.
- Error fidelity: thrown API errors and action failures retain safe codes/field errors; failed enrichment never disguises a successful write.
- Database-backed mutations: own-request approval forbidden, wrong role/assignee denied, stale versions rejected, duplicate keys concurrent/replayed, changed-payload conflicts, rollback with no partial movement.
- Domain journeys: customer/account creation; KYC evidence-to-approval/rejection; payment hold/decision/expiry/reversal; standing-order occurrence; mandate collection; overdraft limits; EOD/reconciliation/close; journal decision and loan disbursement.
- UI parity: perform a write through MCP and confirm the same state, work item, balance and audit identity in the existing UI. Reuse stable Blue Prism selectors.
- Real document journey: 4 MB boundary, invalid signature/size/type, wrong actor/customer token reuse, duplicate finalization, expiry, replacement races, deletion and environment-scoped orphan cleanup.
- Redaction: no API keys, passwords, private storage addresses or document bytes in logs, receipts, reports or example transcripts.

Use isolated Neon/CI databases and environment-specific Blob namespaces for mutation tests. Run relevant focused tests, typecheck/lint, OpenAPI generation/check, documentation generation/check, database/workflow verification and affected Playwright journeys. Require both normal CI and the real-Blob job for the final release. Preserve the nine-customer/nineteen-account reset baseline.

Rollout: keep existing reads available; enable write groups progressively in preview; validate maker and checker WorkHQ connections; merge only after gates; deploy the tested revision; verify Ready identity and health; check authenticated discovery and reads in production. Perform production write smoke tests only against explicitly approved fictional records and operations, with known cleanup/recovery. The implementation plan itself authorizes no production mutations or credential rotation.

Rollback: disable write groups at the server boundary, restore the previous deployment if needed, retain additive receipt/upload-session tables for safe rollback, and preserve operation records. Reverting code does not reverse booked money, delete audit history or reopen closed periods. Use the existing reversal and corrective business workflows for committed outcomes.

Final deliverables: domain tool modules, operation manifest, shared response/retry improvements, document transfer support, contract/integration proofs, updated `docs/api.md` and canonical OpenAPI where REST changed, generated API guide, and a WorkHQ guide with maker/checker examples, lost-response recovery and redacted bidirectional transcripts.

## 10. Optional administrative extension

If requested, add a separately enabled Admin tool group for `upload_brand_logo`, `select_brand_logo`, `delete_brand_logo` and `reset_demo`. First move the session-only branding operations behind shared, actor-key-compatible permission and audit boundaries, publish explicit API contracts and apply the file-transfer design with branding's own formats/size limit.

Reset requires an explicit environment identifier and a deliberate server-validated confirmation contract, preserves baseline restoration and environment-scoped Blob cleanup, and is disabled in production by default. It must never appear as a suggested recovery action for ordinary banking errors. Authentication/login/logout and credential rotation remain outside banking tool parity.
