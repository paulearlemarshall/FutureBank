import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../openapi/futurebank.v1.json", import.meta.url);
const doc = JSON.parse(await readFile(file, "utf8"));
const S = doc.components.schemas;
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const obj = (description, required, properties, extra = {}) => ({ type: "object", description, required, additionalProperties: false, properties, ...extra });
const array = (name) => ({ type: "array", items: ref(name) });
const envelope = (schema) => obj("Successful response envelope.", ["data"], { data: schema });

doc.info.version = "1.1.0";
doc.info.description = "OpenAPI contract for the authenticated read/write FutureBank demonstration API. It covers CRM, Passport and National ID files, accounts, payments, KYC, overdrafts, work queues and audit data. All people, documents, screening results and policies are fictional. Mutations use the same role, maker-checker, KYC, hold, ledger and audit controls as the user interface.";
doc.components.securitySchemes.BearerAuth = { type: "http", scheme: "bearer", bearerFormat: "API key", description: "The FUTUREBANK_API_KEY supplied as an HTTP Bearer token. This is an alternative to X-API-Key, not a staff OAuth token." };
doc.components.securitySchemes.ApiKeyAuth.description = "The FUTUREBANK_API_KEY supplied in X-API-Key.";
doc.security = [{ ApiKeyAuth: [] }, { BearerAuth: [] }];

Object.assign(S, {
  Address: obj("A postal address held in CRM.", ["id", "type", "line1", "city", "postalCode", "country"], { id: str("Stable address identifier."), type: str("Address classification."), line1: str("First address line."), line2: str("Optional second address line.", { nullable: true }), city: str("City."), region: str("State, emirate or region.", { nullable: true }), postalCode: str("Postal code."), country: str("ISO-style country code or seeded country value.") }),
  Contact: obj("A customer contact channel.", ["id", "type", "value", "preferred"], { id: str("Stable contact identifier."), type: str("EMAIL, MOBILE or another supported channel."), value: str("Contact value."), preferred: { type: "boolean", description: "Whether this is the preferred channel." } }),
  IdentityDocument: obj("Identity-document metadata; this is distinct from the private uploaded file.", ["id", "type", "documentNumber", "issuingCountry", "issuedAt", "expiresAt", "verificationStatus"], { id: str("Stable identity record identifier."), type: str("Document type."), documentNumber: str("Passport or national identity number."), issuingCountry: str("Issuing country."), issuedAt: str("Issue date.", { format: "date" }), expiresAt: str("Expiry date.", { format: "date" }), verificationStatus: str("Verification lifecycle state.", { enum: ["NOT_VERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"] }), verificationMethod: str("Verification method, when available.", { nullable: true }), expiryAlertAt: str("Expiry alert date.", { format: "date", nullable: true }) }),
  Relationship: obj("Relationship to another customer, controller or beneficial owner.", ["id", "relatedCustomerNumber", "relatedDisplayName", "relationshipType", "beneficialOwner", "verificationStatus"], { id: str("Stable relationship identifier."), relatedCustomerNumber: str("Related FutureBank customer number."), relatedDisplayName: str("Display name."), relationshipType: str("Relationship classification."), ownershipPercent: str("Ownership percentage as a decimal string.", { nullable: true }), controlType: str("Control classification.", { nullable: true }), beneficialOwner: { type: "boolean", description: "Whether the related party is a beneficial owner." }, verificationStatus: str("Verification state.", { enum: ["NOT_VERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"] }) }),
  Product: obj("A banking product available for account opening.", ["code", "name", "kind", "currency", "interestRate", "minimumOpeningBalance", "active"], { code: str("Stable product code."), name: str("Product name."), kind: str("Account kind.", { enum: ["CURRENT", "SAVINGS", "TERM_DEPOSIT", "FOREIGN_CURRENCY", "LOAN"] }), currency: str("ISO 4217 currency code."), interestRate: str("Annual percentage rate as a decimal string."), minimumOpeningBalance: ref("Money"), active: { type: "boolean", description: "Whether new accounts may be opened." } }),
  CustomerListItem: obj("Customer search result.", ["customerNumber", "rimNumber", "partyType", "displayName", "status", "kycStatus", "riskRating", "nationality", "updatedAt"], { customerNumber: str("Stable CRM customer number.", { example: "C000001" }), rimNumber: str("Relationship information management number.", { example: "RIM000001" }), partyType: str("Customer party type.", { enum: ["RETAIL", "SME"] }), displayName: str("Retail full name or SME legal name."), status: str("Customer relationship status.", { enum: ["ACTIVE", "INACTIVE", "RESTRICTED"] }), kycStatus: str("Current KYC summary.", { enum: ["NOT_STARTED", "IN_PROGRESS", "AWAITING_INFORMATION", "PENDING_APPROVAL", "APPROVED", "DUE", "REJECTED", "EXPIRED"] }), riskRating: str("Current risk rating.", { enum: ["LOW", "MEDIUM", "HIGH"] }), nationality: str("Nationality or country of incorporation."), updatedAt: str("Last update timestamp.", { format: "date-time" }) }),
  AccountListItem: obj("Bank account list result.", ["accountNumber", "customerNumber", "customerName", "productCode", "productName", "kind", "currency", "balance", "availableBalance", "status", "readOnly", "openedAt"], { accountNumber: str("Stable account number.", { example: "1000000001" }), customerNumber: str("Owning customer number."), customerName: str("Owning customer display name."), productCode: str("Product code."), productName: str("Product name."), kind: str("Account kind.", { enum: ["CURRENT", "SAVINGS", "TERM_DEPOSIT", "FOREIGN_CURRENCY", "LOAN"] }), currency: str("ISO 4217 currency code."), balance: ref("Money"), availableBalance: ref("Money"), status: str("Account state.", { enum: ["ACTIVE", "BLOCKED", "CLOSED"] }), readOnly: { type: "boolean", description: "Whether API/UI debit mutations are disabled." }, openedAt: str("Opening date.", { format: "date" }) }),
  Transaction: obj("A booked or pending account movement.", ["reference", "bookedAt", "valueDate", "description", "type", "direction", "amount", "currency", "balanceAfter", "status"], { reference: str("Transaction reference."), bookedAt: str("Booking timestamp.", { format: "date-time" }), valueDate: str("Value date.", { format: "date" }), description: str("Statement narrative."), type: str("Transaction type."), direction: str("Ledger direction.", { enum: ["DEBIT", "CREDIT"] }), amount: ref("Money"), currency: str("ISO 4217 currency code."), balanceAfter: ref("Money"), counterparty: str("Counterparty name or reference.", { nullable: true }), status: str("Payment lifecycle state.", { enum: ["BOOKED", "PENDING", "REJECTED", "EXPIRED"] }) }),
  Beneficiary: obj("External payment beneficiary.", ["id", "customerNumber", "name", "bankName", "accountNumber", "currency", "status", "createdAt"], { id: str("Beneficiary identifier."), customerNumber: str("Owning customer number."), name: str("Beneficiary name."), bankName: str("Beneficiary bank."), accountNumber: str("Local account number."), iban: str("IBAN when supplied.", { nullable: true }), swiftBic: str("SWIFT/BIC when supplied.", { nullable: true }), currency: str("ISO 4217 currency code."), status: str("Beneficiary state.", { enum: ["ACTIVE", "INACTIVE"] }), createdAt: str("Creation timestamp.", { format: "date-time" }) }),
  WorkQueueItem: obj("Maker-checker work queue item.", ["reference", "type", "status", "priority", "entityType", "entityReference", "title", "requiredRole", "createdBy", "dueAt", "version"], { reference: str("Work item reference."), type: str("Approval or alert type.", { enum: ["KYC_APPROVAL", "PAYMENT_APPROVAL", "OVERDRAFT_APPROVAL", "OVERDRAFT_CHANGE", "OVERDRAFT_ALERT"] }), status: str("Work item state.", { enum: ["OPEN", "ASSIGNED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"] }), priority: str("Priority.", { enum: ["LOW", "NORMAL", "HIGH", "CRITICAL"] }), entityType: str("Controlled entity type."), entityReference: str("Controlled entity reference."), title: str("Queue title."), requiredRole: str("Role required to act.", { enum: ["OPERATOR", "SUPERVISOR", "COMPLIANCE", "ADMIN"] }), createdBy: str("Maker username."), assignedTo: str("Assignee username.", { nullable: true }), dueAt: str("Due timestamp.", { format: "date-time" }), version: { type: "integer", minimum: 1, description: "Optimistic concurrency version required by decisions and assignment changes." } }),
  AccountHold: obj("Funds reserved for a pending payment without a ledger movement.", ["reference", "accountNumber", "paymentReference", "amount", "currency", "status", "expiresAt"], { reference: str("Hold reference."), accountNumber: str("Account number."), paymentReference: str("Payment reference."), amount: ref("Money"), currency: str("ISO 4217 currency code."), status: str("Hold lifecycle state.", { enum: ["ACTIVE", "RELEASED", "CONSUMED", "EXPIRED"] }), expiresAt: str("Expiry timestamp.", { format: "date-time" }) }),
  Payment: obj("Payment detail including approval hold and work item.", ["reference", "type", "status", "sourceAccountNumber", "customerNumber", "customerName", "destinationReference", "amount", "currency", "description", "initiatedBy", "createdAt"], { reference: str("Payment reference."), type: str("Payment type.", { enum: ["INTERNAL", "EXTERNAL"] }), status: str("Lifecycle state.", { enum: ["BOOKED", "PENDING", "REJECTED", "EXPIRED"] }), sourceAccountNumber: str("Debited account number."), customerNumber: str("Owning customer number."), customerName: str("Customer display name."), destinationReference: str("Destination account number or beneficiary identifier."), amount: ref("Money"), currency: str("ISO 4217 currency code."), description: str("Payment narrative."), approvalReason: str("Reason approval was required.", { nullable: true }), initiatedBy: str("Maker username."), createdAt: str("Creation timestamp.", { format: "date-time" }), expiresAt: str("Pending-payment expiry timestamp.", { format: "date-time", nullable: true }), hold: { ...ref("AccountHold"), nullable: true }, workItem: { ...ref("WorkQueueItem"), nullable: true } }),
  KycCaseSummary: obj("KYC case register row.", ["reference", "customerNumber", "customerName", "type", "jurisdiction", "status", "riskScore", "riskRating", "enhancedDueDiligence", "dueAt"], { reference: str("KYC case reference."), customerNumber: str("Customer number."), customerName: str("Customer display name."), type: str("Case type.", { enum: ["ONBOARDING", "PERIODIC_REVIEW", "TRIGGER_EVENT", "REMEDIATION"] }), jurisdiction: str("Policy jurisdiction."), status: str("Case state.", { enum: ["OPEN", "IN_PROGRESS", "AWAITING_INFORMATION", "PENDING_APPROVAL", "APPROVED", "REJECTED"] }), riskScore: { type: "integer", minimum: 0, description: "Calculated demo-policy score." }, riskRating: str("Calculated rating.", { enum: ["LOW", "MEDIUM", "HIGH"] }), enhancedDueDiligence: { type: "boolean", description: "Whether EDD is required." }, dueAt: str("Case due timestamp.", { format: "date-time" }) }),
  OverdraftFacilitySummary: obj("Arranged-overdraft register row.", ["reference", "accountNumber", "customerNumber", "customerName", "requestedLimit", "approvedLimit", "utilization", "headroom", "currency", "status"], { reference: str("Facility reference."), accountNumber: str("Linked current account."), customerNumber: str("Owning customer."), customerName: str("Customer display name."), requestedLimit: ref("Money"), approvedLimit: ref("Money"), utilization: ref("Money"), headroom: ref("Money"), currency: str("ISO 4217 currency code."), status: str("Facility lifecycle state.", { enum: ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "DECLINED", "PENDING_CHANGE", "SUSPENDED", "EXPIRED", "CLOSED"] }), reviewDate: str("Review date.", { format: "date", nullable: true }) }),
  AuditEvent: obj("Append-only audit event without private file content or URLs.", ["id", "occurredAt", "actorUsername", "action", "entityType", "entityReference", "correlationId"], { id: str("Event identifier."), occurredAt: str("Event timestamp.", { format: "date-time" }), actorUsername: str("Actor username."), action: str("Action code."), entityType: str("Entity type."), entityReference: str("Entity reference."), correlationId: str("Request correlation identifier.") }),
  DeleteDocumentResult: obj("Idempotent delete result.", ["deleted"], { deleted: { type: "boolean", description: "True when a document record existed and was deleted; false when the slot was already empty." } }),
  Discovery: obj("API discovery links relative to /api/v1.", ["name", "version", "resources", "openapi"], { name: str("API name."), version: str("API version."), resources: { type: "array", description: "Available top-level resource paths.", items: { type: "string" } }, openapi: str("Public OpenAPI artifact URL.") }),
});

S.DocumentSlot.description = "Fixed customer file slot. Only Passport and National ID are supported.";
S.DocumentMeta.description = "Safe document metadata. Private Blob URLs, paths, hashes and file bytes are never returned.";
for (const [name, schema] of Object.entries(S)) if (!schema.description) schema.description = `${name} API data contract.`;
for (const [name, property] of Object.entries(S.DocumentMeta.properties)) if (!property.description && !property.$ref) property.description = `${name} document metadata field.`;

const operations = {
  "GET /": ["discoverApi", "Returns API identity, version, resource links and the public OpenAPI URL.", ref("Discovery")],
  "GET /dashboard": ["getDashboard", "Returns current operational counts and exposure metrics for the authenticated caller.", { type: "object", description: "Operational dashboard metrics; monetary values are decimal strings.", additionalProperties: true }],
  "GET /products": ["listProducts", "Lists configured banking products, including inactive products.", array("Product")],
  "GET /customers": ["listCustomers", "Lists customers with optional escaped text search and pagination.", array("CustomerListItem")],
  "GET /customers/{customerNumber}": ["getCustomer", "Returns the complete CRM customer record, accounts, identity metadata, relationships and two document slots.", { allOf: [ref("CustomerListItem"), { type: "object", description: "Detailed customer fields.", additionalProperties: true }] }],
  "GET /accounts": ["listAccounts", "Lists accounts with optional escaped text search and pagination.", array("AccountListItem")],
  "GET /accounts/{accountNumber}": ["getAccount", "Returns account, transaction, loan and arranged-overdraft detail.", { allOf: [ref("AccountListItem"), { type: "object", description: "Detailed account fields.", additionalProperties: true }] }],
  "GET /accounts/{accountNumber}/transactions": ["listAccountTransactions", "Returns statement transactions in deterministic order.", array("Transaction")],
  "GET /beneficiaries": ["listBeneficiaries", "Lists external payment beneficiaries.", array("Beneficiary")],
  "GET /payments": ["listPayments", "Lists payments across booked, pending, rejected and expired states.", array("Payment")],
  "GET /payments/{paymentReference}": ["getPayment", "Returns payment detail, active or historical hold, and approval work item.", ref("Payment")],
  "GET /kyc-cases": ["listKycCases", "Lists onboarding, periodic review, trigger-event and remediation KYC cases.", array("KycCaseSummary")],
  "GET /kyc-cases/{caseReference}": ["getKycCase", "Returns CDD profile, risk, screening, evidence, restrictions and decision data.", { allOf: [ref("KycCaseSummary"), { type: "object", description: "Complete KYC case workspace.", additionalProperties: true }] }],
  "GET /overdrafts": ["listOverdraftFacilities", "Lists arranged-overdraft facilities in all lifecycle states.", array("OverdraftFacilitySummary")],
  "GET /overdrafts/{facilityReference}": ["getOverdraftFacility", "Returns facility pricing, utilization, headroom, limit history and alerts.", { allOf: [ref("OverdraftFacilitySummary"), { type: "object", description: "Complete overdraft facility detail.", additionalProperties: true }] }],
  "GET /work-items": ["listWorkItems", "Lists and filters maker-checker work queue items.", array("WorkQueueItem")],
  "GET /work-items/{workItemReference}": ["getWorkItem", "Returns a work item and its complete transition history.", { allOf: [ref("WorkQueueItem"), { type: "object", description: "Work item event history.", additionalProperties: true }] }],
  "GET /audit-events": ["listAuditEvents", "Lists metadata-only audit events. Private document bytes and Blob locations are excluded.", array("AuditEvent")],
  "GET /customers/{customerNumber}/documents": ["listCustomerDocumentSlots", "Returns exactly the PASSPORT and NATIONAL_ID slots; each contains safe metadata or empty=true.", { type: "array", minItems: 2, maxItems: 2, items: ref("CustomerDocumentSlot") }],
  "GET /customers/{customerNumber}/documents/{slot}": ["getCustomerDocumentMetadata", "Returns safe metadata for one Passport or National ID slot. File bytes are available from the /content operation.", ref("DocumentMeta")],
  "PUT /customers/{customerNumber}/documents/{slot}": ["putCustomerDocument", "Uploads or replaces one private Passport or National ID file. Requires KYC_GATHER; accepts JPEG, PNG or PDF up to exactly 4 MiB after MIME and file-signature validation.", ref("DocumentMeta")],
  "DELETE /customers/{customerNumber}/documents/{slot}": ["deleteCustomerDocument", "Idempotently deletes one customer file slot. Requires KYC_GATHER and never changes identity-document metadata.", ref("DeleteDocumentResult")],
};

const generatedIds = new Set();
const verbs = ["get", "post", "put", "patch", "delete"];
const idFrom = (method, path) => `${method.toLowerCase()}${path.split("/").filter(Boolean).map((part) => part.replace(/[{}-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s/g, "")).join("") || "Api"}`;
for (const [path, item] of Object.entries(doc.paths)) {
  for (const method of verbs) {
    const op = item[method];
    if (!op) continue;
    const key = `${method.toUpperCase()} ${path}`;
    const known = operations[key];
    op.operationId = known?.[0] ?? idFrom(method, path);
    if (generatedIds.has(op.operationId)) throw new Error(`Duplicate operationId ${op.operationId}`);
    generatedIds.add(op.operationId);
    op.description = known?.[1] ?? `${op.summary}. The selected staff actor is permission-checked and the operation returns an ActionState in the standard data envelope.`;
    if (["post", "put", "patch", "delete"].includes(method) && !op.parameters?.some((p) => p.$ref === "#/components/parameters/StaffActor")) op.parameters = [...(op.parameters ?? []), { $ref: "#/components/parameters/StaffActor" }];
    const successSchema = known?.[2];
    if (successSchema && key !== "GET /customers/{customerNumber}/documents/{slot}/content") {
      for (const [status, response] of Object.entries(op.responses)) {
        if (!status.startsWith("2")) continue;
        op.responses[status] = { description: response.description ?? "Successful response.", content: { "application/json": { schema: envelope(successSchema) } } };
      }
    }
    for (const status of ["401", "403", "503"]) if (!op.responses[status]) op.responses[status] = { $ref: "#/components/responses/Error" };
  }
}

const content = doc.paths["/customers/{customerNumber}/documents/{slot}/content"].get;
content.operationId = "getCustomerDocumentContent";
content.description = "Streams authenticated private Passport or National ID bytes. This operation is not JSON-wrapped and is never cacheable.";
content.responses["200"].headers = {
  "Content-Disposition": { description: "Attachment disposition containing a sanitized filename.", schema: { type: "string", example: "attachment; filename=Passport-AmeliaHart.jpg" } },
  "Content-Length": { description: "Exact file size in bytes.", schema: { type: "integer", format: "int64" } },
  ETag: { description: "Private Blob entity tag.", schema: { type: "string" } },
  "Cache-Control": { description: "Always no-store.", schema: { type: "string", enum: ["no-store"] } },
};
content.responses["200"].content = Object.fromEntries(["image/jpeg", "image/png", "application/pdf"].map((mime) => [mime, { schema: { type: "string", format: "binary", description: `Raw ${mime} file bytes.` } }]));
content.responses["401"] = { $ref: "#/components/responses/Error" };
content.responses["403"] = { $ref: "#/components/responses/Error" };
content.responses["404"] = { $ref: "#/components/responses/Error" };
content.responses["503"] = { $ref: "#/components/responses/Error" };

const upload = doc.paths["/customers/{customerNumber}/documents/{slot}"].put;
upload.requestBody.description = "A single multipart part named file. The route rejects other Content-Types with 415.";
upload.requestBody.content["multipart/form-data"].schema.properties.file = { type: "string", format: "binary", description: "Non-empty JPEG, PNG or PDF whose declared MIME type matches its file signature; maximum 4,194,304 bytes." };
upload.responses["415"] = { $ref: "#/components/responses/Error" };

const jsonBody = (description, schema) => ({ required: true, description, content: { "application/json": { schema } } });
const fieldObject = (description, required, properties) => obj(description, required, properties);
const requestBodies = {
  "PATCH /customers/{customerNumber}": jsonBody("Complete replacement values for the mutable CRM fields.", ref("CustomerWrite")),
  "POST /beneficiaries": jsonBody("Creates an active external beneficiary owned by the customer.", fieldObject("Beneficiary creation request.", ["customerNumber", "name", "bankName", "accountNumber", "currency"], { customerNumber: str("Owning customer number."), name: str("Beneficiary name.", { minLength: 2 }), bankName: str("Beneficiary bank.", { minLength: 2 }), accountNumber: str("Local account number.", { minLength: 4 }), iban: str("Optional IBAN.", { nullable: true }), swiftBic: str("Optional SWIFT/BIC.", { nullable: true }), currency: str("Three-letter currency code.", { minLength: 3, maxLength: 3 }) })),
  "PATCH /kyc-cases/{caseReference}/cdd": jsonBody("Creates or replaces the case CDD profile. expectedCountries is a comma-separated list of country codes.", fieldObject("CDD profile write request.", ["accountPurpose", "occupationOrBusiness", "expectedMonthlyCredits", "expectedMonthlyDebits", "expectedCountries", "cashUsage", "sourceOfFunds", "sourceOfWealth", "incomeOrTurnoverBand", "netWorthBand"], { accountPurpose: str("Purpose of the relationship."), occupationOrBusiness: str("Occupation or business activity."), expectedMonthlyCredits: ref("Money"), expectedMonthlyDebits: ref("Money"), expectedCountries: str("Comma-separated expected countries."), cashUsage: str("Expected cash usage."), sourceOfFunds: str("Source of funds."), sourceOfWealth: str("Source of wealth."), incomeOrTurnoverBand: str("Income or turnover band."), netWorthBand: str("Net worth band.") })),
  "POST /kyc-cases/{caseReference}/evidence": jsonBody("Records evidence metadata only; it does not upload a file.", fieldObject("KYC evidence metadata request.", ["evidenceType", "documentReference", "source", "receivedAt"], { evidenceType: str("Requirement/evidence type."), documentReference: str("Fictional document reference."), source: str("Evidence source."), receivedAt: str("Receipt date.", { format: "date" }), expiresAt: str("Expiry date.", { format: "date", nullable: true }), reviewerNotes: str("Optional notes.", { nullable: true }) })),
  "POST /kyc-cases/{caseReference}/evidence-verification": jsonBody("Verifies or rejects recorded evidence.", fieldObject("Evidence verification request.", ["evidenceReference", "outcome", "reviewerNotes"], { evidenceReference: str("Evidence reference."), outcome: str("Verification outcome.", { enum: ["VERIFIED", "REJECTED"] }), reviewerNotes: str("Mandatory reviewer rationale.", { minLength: 3 }) })),
  "POST /kyc-cases/{caseReference}/screening-resolution": jsonBody("Compliance resolution of a fictional possible match.", fieldObject("Screening resolution request.", ["screeningReference", "outcome", "comment"], { screeningReference: str("Screening check reference."), outcome: str("Resolution.", { enum: ["FALSE_POSITIVE", "CONFIRMED_MATCH"] }), comment: str("Mandatory decision rationale.", { minLength: 5 }) })),
  "POST /overdrafts": jsonBody("Submits an arranged-overdraft application and creates an approval work item.", fieldObject("Overdraft application request.", ["accountNumber", "requestedLimit", "annualInterestRate", "purpose", "monthlyIncomeOrTurnover", "monthlyCommittedOutgoings", "riskGrade"], { accountNumber: str("Eligible active current account."), requestedLimit: ref("Money"), annualInterestRate: str("Annual percentage rate with up to four decimal places."), purpose: str("Facility purpose.", { minLength: 5 }), monthlyIncomeOrTurnover: ref("Money"), monthlyCommittedOutgoings: ref("Money"), riskGrade: str("Internal risk grade, one to three characters.", { minLength: 1, maxLength: 3 }) })),
  "POST /overdrafts/{facilityReference}/limit-changes": jsonBody("Requests independent approval of a new limit.", fieldObject("Overdraft limit-change request.", ["requestedLimit", "reason"], { requestedLimit: ref("Money"), reason: str("Business reason.", { minLength: 5 }) })),
  "POST /overdrafts/{facilityReference}/status": jsonBody("Suspends further drawings or closes a cleared facility.", fieldObject("Overdraft status request.", ["action", "reason"], { action: str("Status action.", { enum: ["SUSPEND", "CLOSE"] }), reason: str("Mandatory rationale.", { minLength: 5 }) })),
  "POST /overdraft-alerts/{alertReference}/resolution": jsonBody("Records the monitoring intervention and completes the related work item.", fieldObject("Overdraft alert resolution.", ["intervention", "comment"], { intervention: str("Intervention outcome.", { enum: ["CONTACT_ATTEMPTED", "CUSTOMER_CONTACTED", "REPAYMENT_DISCUSSION", "LIMIT_REVIEW", "SUSPENSION", "NO_ACTION"] }), comment: str("Mandatory outcome rationale.", { minLength: 5 }) })),
};
for (const [key, body] of Object.entries(requestBodies)) {
  const [method, path] = key.split(" ");
  doc.paths[path][method.toLowerCase()].requestBody = body;
}

doc.components.parameters.StaffActor.description = "Active staff username used as the audit actor. Required for writes. Permissions and maker-checker separation are evaluated for this user.";
doc.components.responses.Error.description = "Structured API error. Authentication failures are 401, actor/permission failures are 403, missing entities are 404, conflicts are 409, unsupported upload media is 415, and unavailable dependencies are 503.";
doc.components.schemas.Error.example = { error: { code: "UNAUTHORIZED", message: "A valid API key is required." } };
delete doc.components.requestBodies.Mutation;
delete S.MutationRequest;

await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
