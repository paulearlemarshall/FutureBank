import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "openapi", "futurebank.v1.source.json");
const outputPath = path.join(root, "docs", "FutureBank-API-Guide.docx");

let openapi = null;

const checkMode = process.argv.includes("--check");

function resolve(node) {
  let current = node;
  while (current && typeof current === "object" && current.$ref) {
    const parts = current.$ref.replace(/^#\//, "").split("/");
    current = parts.reduce((acc, part) => acc?.[part], openapi);
  }
  return current;
}

function refName(node) {
  return node?.$ref ? node.$ref.split("/").pop() : "";
}

function schemaType(node) {
  const s = resolve(node);
  if (!s) return "unknown";
  if (refName(node) === "Money") return "string (decimal, up to 2 dp)";
  const t = s.type ?? "object";
  let out = t;
  if (t === "array") out = `array<${s.items ? schemaType(s.items) : "any"}>`;
  if (s.format) out += ` (${s.format})`;
  if (s.nullable) out += " / null";
  return out;
}

function constraints(node) {
  const s = resolve(node);
  if (!s) return [];
  const out = [];
  if (s.minLength !== undefined) out.push(`min ${s.minLength} chars`);
  if (s.maxLength !== undefined) out.push(`max ${s.maxLength} chars`);
  if (s.minimum !== undefined) out.push(`min ${s.minimum}`);
  if (s.maximum !== undefined) out.push(`max ${s.maximum}`);
  if (s.pattern) out.push(`pattern ${s.pattern}`);
  if (s.default !== undefined) out.push(`default ${String(s.default)}`);
  if (s.example !== undefined) out.push(`e.g. ${String(s.example)}`);
  return out;
}

function combinedSchema(node) {
  const resolved = resolve(node);
  if (resolved?.oneOf) return { kind: "oneOf", variants: resolved.oneOf };
  if (resolved?.allOf) return { kind: "allOf", variants: resolved.allOf };
  return { kind: "object", schema: resolved };
}

function mergeAllOf(variants) {
  const properties = {};
  const required = new Set();
  let description = "";
  for (const variant of variants) {
    const resolved = resolve(variant);
    if (!resolved) continue;
    Object.assign(properties, resolved.properties ?? {});
    for (const name of resolved.required ?? []) required.add(name);
    if (resolved.description && !description) description = resolved.description;
  }
  return { properties, required: [...required], description };
}

const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };
const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
};

function cell(text, width, options = {}) {
  const runs = Array.isArray(text) ? text : [new TextRun({ text: String(text), bold: options.bold, size: options.size ?? 18, font: options.font })];
  return new TableCell({
    children: [new Paragraph({ children: runs, spacing: { before: 0, after: 0 } })],
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.TOP,
    borders: CELL_BORDER,
  });
}

function dataTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((header, index) => cell(header, widths[index], { bold: true, fill: "D9E2F3", size: 18 })),
  });
  const bodyRows = rows.map((row) => new TableRow({
    children: row.map((value, index) => cell(value, widths[index])),
  }));
  return new Table({ rows: [headerRow, ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

function paragraph(text, options = {}) {
  const runs = Array.isArray(text) ? text : [new TextRun({ text, size: options.size ?? 21, bold: options.bold, italics: options.italics })];
  return new Paragraph({
    children: runs,
    heading: options.heading,
    spacing: { before: options.before ?? 0, after: options.after ?? 120 },
    alignment: options.alignment,
  });
}

function heading(text, level) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function codeBlock(lines) {
  return lines.flatMap((line, index) => [new Paragraph({
    children: [new TextRun({ text: line, font: "Consolas", size: 16 })],
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
    spacing: { before: 0, after: 0, line: 240 },
    indent: { left: 180, right: 180 },
  }), ...(index === lines.length - 1 ? [] : [])]);
}

function roleLine(role) {
  return paragraph([
    new TextRun({ text: "Required role: ", bold: true, size: 21 }),
    new TextRun({ text: role, size: 21 }),
  ]);
}

function renderParameterRows(operation) {
  const rows = [];
  for (const parameter of operation.parameters ?? []) {
    const resolved = resolve(parameter);
    const schema = resolve(resolved.schema);
    const type = schemaType(schema);
    const constraintText = constraints(schema).join("; ");
    const description = [resolved.description, constraintText].filter(Boolean).join(" — ");
    rows.push([resolved.name, resolved.in ?? "query", resolved.required ? "Yes" : "No", type, description || "—"]);
  }
  return rows;
}

function renderBodyTables(requestBody) {
  if (!requestBody) return [];
  const resolvedBody = resolve(requestBody);
  const content = resolvedBody.content ?? {};
  const media = content["application/json"] ?? content["multipart/form-data"] ?? Object.values(content)[0];
  if (!media) return [];
  const schema = resolve(media.schema);
  const combined = combinedSchema(schema);

  if (combined.kind === "oneOf") {
    const tables = [];
    for (const variant of combined.variants) {
      const merged = mergeAllOf([schema, variant]);
      const variantName = refName(variant) || "variant";
      const title = paragraph([
        new TextRun({ text: `Request body — ${variantName}`, bold: true, size: 20 }),
      ], { after: 60 });
      const rows = fieldRows(merged.properties, merged.required);
      tables.push(title, dataTable(["Field", "Required", "Type", "Allowed values", "Notes"], rows, [20, 10, 22, 15, 33]));
    }
    return tables;
  }

  const merged = combined.kind === "allOf"
    ? mergeAllOf(combined.variants)
    : { properties: schema.properties ?? {}, required: schema.required ?? [], description: schema.description ?? "" };

  const contentTypeNote = content["multipart/form-data"]
    ? paragraph([new TextRun({ text: "Request body is multipart/form-data.", italics: true, size: 18 })], { after: 60 })
    : undefined;

  const rows = fieldRows(merged.properties, merged.required);
  return [
    ...(contentTypeNote ? [contentTypeNote] : []),
    dataTable(["Field", "Required", "Type", "Allowed values", "Notes"], rows, [20, 10, 22, 15, 33]),
  ];
}

function fieldRows(properties, required) {
  const rows = [];
  for (const [name, schemaNode] of Object.entries(properties ?? {})) {
    const resolved = resolve(schemaNode);
    const enumValues = resolved?.enum ? resolved.enum.join(" | ") : "";
    const constraintText = constraints(schemaNode).join("; ");
    const notes = [resolved?.description, constraintText].filter(Boolean).join(" — ") || "—";
    rows.push([name, required.includes(name) ? "Yes" : "No", schemaType(schemaNode), enumValues || "—", notes]);
  }
  return rows;
}

function renderResponses(operation) {
  const lines = [];
  const responses = operation.responses ?? {};
  const ordered = ["200", "201", "202"].filter((status) => responses[status]);
  for (const status of ordered) {
    const response = resolve(responses[status]);
    const body = response.content?.["application/json"]?.schema;
    let note = response.description ?? "";
    if (body) {
      const name = refName(body);
      note = name === "ActionState" ? "ActionState envelope: {ok, code, message, fieldErrors?}" : `${name || "data"} envelope`;
    }
    lines.push(`${status} — ${note}`);
  }
  if (lines.length) {
    return paragraph([new TextRun({ text: "Response: ", bold: true, size: 20 }), new TextRun({ text: lines.join("; "), size: 20 })], { after: 60 });
  }
  return undefined;
}

function renderOperation(method, route, operation) {
  const children = [];
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `${method} `, bold: true, size: 22, color: "1F3864" }),
      new TextRun({ text: route, bold: true, size: 22 }),
    ],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
  }));
  if (operation.summary) children.push(paragraph([new TextRun({ text: operation.summary, italics: true, size: 21 })], { after: 80 }));
  if (operation.description && operation.description !== operation.summary) {
    children.push(paragraph(operation.description, { after: 80 }));
  }
  children.push(roleLine(requiredRole(method, route)));
  children.push(paragraph([new TextRun({ text: `Operation ID: ${operation.operationId}`, size: 18, italics: true })], { after: 100 }));

  const parameterRows = renderParameterRows(operation);
  if (parameterRows.length) {
    children.push(paragraph([new TextRun({ text: "Parameters", bold: true, size: 20 })], { after: 60 }));
    children.push(dataTable(["Name", "In", "Required", "Type", "Description"], parameterRows, [24, 8, 12, 20, 36]));
    children.push(paragraph("", { after: 40 }));
  }

  const bodyTables = renderBodyTables(operation.requestBody);
  if (bodyTables.length) {
    children.push(paragraph([new TextRun({ text: "Request body", bold: true, size: 20 })], { after: 60 }));
    children.push(...bodyTables);
    children.push(paragraph("", { after: 40 }));
  }

  const responseNote = renderResponses(operation);
  if (responseNote) children.push(responseNote);

  return children;
}

const roleFor = {
  "POST /customers": "Operator (CUSTOMER_MAINTAIN); Admin",
  "PATCH /customers/{customerNumber}": "Operator (CUSTOMER_MAINTAIN); Admin",
  "POST /customers/{customerNumber}/restrictions": "Compliance (RESTRICTION_MAINTAIN); Admin",
  "POST /customers/{customerNumber}/restrictions/{restrictionReference}/lift": "Compliance (RESTRICTION_MAINTAIN); Admin",
  "PUT /customers/{customerNumber}/documents/{slot}": "Operator (KYC_GATHER); Admin",
  "DELETE /customers/{customerNumber}/documents/{slot}": "Operator (KYC_GATHER); Admin",
  "POST /accounts": "Operator; Admin",
  "PATCH /accounts/{accountNumber}/status": "Operator; Admin",
  "POST /beneficiaries": "Operator; Admin",
  "PATCH /beneficiaries/{beneficiaryId}": "Operator; Admin",
  "POST /payments": "Operator (PAYMENT_INITIATE); Admin",
  "POST /payments/{paymentReference}/decision": "Supervisor (PAYMENT_DECIDE); Admin",
  "POST /payments/{paymentReference}/reversals": "Operator (PAYMENT_REVERSAL_INITIATE); Admin",
  "POST /payments/expiry-run": "Supervisor (PAYMENT_DECIDE); Admin",
  "POST /payment-reversals/{reversalReference}/decision": "Supervisor (PAYMENT_REVERSAL_DECIDE); Admin",
  "POST /payment-instructions": "Operator (PAYMENT_INSTRUCTION_MAINTAIN); Admin",
  "POST /payment-instructions/{instructionReference}/cancellation": "Operator (PAYMENT_INSTRUCTION_MAINTAIN); Admin",
  "POST /payment-instructions/processing-runs": "Supervisor (PAYMENT_SCHEDULE_EXECUTE); Admin",
  "POST /direct-debits": "Operator (DIRECT_DEBIT_MAINTAIN); Admin",
  "POST /direct-debits/{mandateReference}/cancellation": "Operator (DIRECT_DEBIT_MAINTAIN); Admin",
  "POST /direct-debits/{mandateReference}/collections": "Operator (DIRECT_DEBIT_COLLECT); Admin",
  "POST /end-of-day-runs": "Supervisor (END_OF_DAY_EXECUTE); Admin",
  "POST /reconciliation-runs": "Supervisor (RECONCILIATION_EXECUTE); Admin",
  "POST /reconciliation-runs/{runReference}/items/{itemReference}/resolution": "Supervisor (RECONCILIATION_RESOLVE); Admin",
  "POST /accounting-periods/{periodReference}/close-requests": "Supervisor (ACCOUNTING_PERIOD_CLOSE_INITIATE); Admin",
  "POST /accounting-periods/{periodReference}/close-decisions": "Admin (ACCOUNTING_PERIOD_CLOSE_DECIDE)",
  "POST /general-ledger/journals": "Supervisor (GENERAL_LEDGER_JOURNAL_INITIATE); Admin",
  "POST /general-ledger/journals/{journalReference}/decision": "Admin (GENERAL_LEDGER_JOURNAL_DECIDE)",
  "POST /loans": "Operator (LOAN_ORIGINATION_INITIATE); Admin",
  "POST /loans/{applicationReference}/decision": "Supervisor (LOAN_ORIGINATION_DECIDE); Admin",
  "POST /kyc-cases": "Operator (KYC_GATHER); Admin",
  "PATCH /kyc-cases/{caseReference}/cdd": "Operator (KYC_GATHER); Admin",
  "POST /kyc-cases/{caseReference}/evidence": "Operator (KYC_GATHER); Admin",
  "POST /kyc-cases/{caseReference}/evidence-verification": "Operator (KYC_GATHER); Admin",
  "POST /kyc-cases/{caseReference}/screening": "Operator (KYC_SCREEN); Admin",
  "POST /kyc-cases/{caseReference}/screening-resolution": "Compliance (KYC_DECIDE); Admin",
  "POST /kyc-cases/{caseReference}/submission": "Operator (KYC_GATHER); Admin",
  "POST /kyc-cases/{caseReference}/decision": "Compliance (KYC_DECIDE); Admin",
  "POST /overdrafts": "Operator (OVERDRAFT_INITIATE); Admin",
  "POST /overdrafts/{facilityReference}/decision": "Supervisor (OVERDRAFT_DECIDE); Admin",
  "POST /overdrafts/{facilityReference}/limit-changes": "Operator (OVERDRAFT_INITIATE); Admin",
  "POST /overdrafts/{facilityReference}/status": "Supervisor (OVERDRAFT_DECIDE); Admin",
  "POST /overdraft-alerts/{alertReference}/resolution": "Supervisor (OVERDRAFT_ALERT_RESOLVE); Admin",
  "POST /work-items/{workItemReference}/claim": "Any authenticated staff actor whose role can check the work-item type",
  "POST /work-items/{workItemReference}/release": "Any authenticated staff actor (the assignee, or any Admin)",
};

function requiredRole(method, route) {
  if (method === "GET") return "Any authenticated staff actor";
  return roleFor[`${method} ${route}`] ?? "Any authenticated staff actor";
}

const sections = [
  {
    title: "API discovery",
    blurb: "The service publishes two endpoints for discovering the contract and its capabilities without business access. GET /api/v1 returns the runtime resource index, and GET /api/openapi.json returns the complete OpenAPI 3.0.3 document. Both are public; every /api/v1 business route remains authenticated.",
    match: (route) => route === "/",
  },
  {
    title: "Dashboard",
    blurb: "Authenticated summary of the demonstration bank covering customer, account, payment and work-queue totals.",
    match: (route) => route === "/dashboard",
  },
  {
    title: "Products",
    blurb: "Read the product register, including account kind, currency, minimum opening balance and product interest rates.",
    match: (route) => route === "/products",
  },
  {
    title: "Audit events",
    blurb: "Read the immutable audit trail. Every mutation records an actor, action, entity type and reference with a correlation ID.",
    match: (route) => route === "/audit-events",
  },
  {
    title: "Work items",
    blurb: "The maker-checker work queue. Decisions require a distinct actor from the initiator; items carry an optimistic version that must be supplied on claim, release and decision calls.",
    match: (route) => route.startsWith("/work-items"),
  },
  {
    title: "Customers",
    blurb: "Create, read, update and search customer records, record identity documents, maintain compliance restrictions and manage the Passport and National ID document slots. Names, addresses and descriptive fields accept Unicode, including Arabic script; structured identifiers stay LTR.",
    match: (route) => route === "/customers" || route.startsWith("/customers/"),
    examples: [
      {
        title: "Customer documents lifecycle (Passport slot)",
        code: [
          '# List Passport and National ID slots',
          'curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY"',
          '',
          '# Upload or replace the Passport slot (maximum 4 MB)',
          'curl -X PUT "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/PASSPORT" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -F "file=@Passport-AmeliaHart.jpg;type=image/jpeg"',
          '',
          '# Stream the authenticated file bytes',
          'curl "https://future-bank-demo.vercel.app/api/v1/customers/C000001/documents/PASSPORT/content" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" --output passport.jpg',
        ],
      },
      {
        title: "Create a retail customer",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/customers" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"partyType":"RETAIL","givenName":"Layla","familyName":"Haddad","dateOfBirth":"1992-04-17",',
          '    "shortName":"Layla Haddad","nationality":"AE","residenceCountry":"AE","sector":"Technology",',
          '    "industry":"Software","kycStatus":"NOT_STARTED","riskRating":"LOW","relationshipManager":"Sarah Chen",',
          '    "addressLine1":"12 Marina Walk","city":"Dubai","postalCode":"00000",',
          '    "email":"layla.haddad@example.com","phone":"+971500000000"}\'',
        ],
      },
    ],
  },
  {
    title: "Accounts",
    blurb: "Open and search accounts, read balances and transactions, update status and export a CSV statement. Opening an account with a deposit books a balanced ledger transaction against currency clearing.",
    match: (route) => route === "/accounts" || route.startsWith("/accounts/"),
    examples: [
      {
        title: "Account statement export",
        code: [
          'curl "https://future-bank-demo.vercel.app/api/v1/accounts/1000000001/statement?from=2026-01-01&to=2026-12-31" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  --output statement.csv',
        ],
      },
    ],
  },
  {
    title: "Beneficiaries",
    blurb: "Maintain the customer-owned beneficiary register used by external payments, direct-debit mandates and loans. Beneficiaries must belong to the same customer and currency for mandate use.",
    match: (route) => route === "/beneficiaries" || route.startsWith("/beneficiaries/"),
  },
  {
    title: "Payments",
    blurb: "Submit immediate internal or external payments, approve or reject pending payments as an independent checker, request reversals and run the pending-payment expiry sweep. External payments become pending with a hold until an independent approver acts; internal transfers book directly within limits. Retries reuse the Idempotency-Key.",
    match: (route) => route === "/payments" || route.startsWith("/payments/"),
    examples: [
      {
        title: "Submit an immediate payment",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/payments" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Idempotency-Key: demo-payment-0001" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"paymentType":"INTERNAL","sourceAccountNumber":"1000000001",',
          '    "destinationAccountNumber":"1000000002","amount":"10.00","description":"API demonstration"}\'',
        ],
      },
    ],
  },
  {
    title: "Payment reversals",
    blurb: "Request an idempotent full-value reversal of an immutable payment and let a distinct Supervisor approve or reject it with the work-item reference and expected version. Approval locks the original posting and books an equal-and-opposite transaction exactly once.",
    match: (route) => route === "/payment-reversals" || route.startsWith("/payment-reversals/"),
  },
  {
    title: "Payment instructions",
    blurb: "Create scheduled payments and standing orders without reserving funds, cancel with an expected version and reason, and execute all occurrences due on a business date. Each occurrence derives its idempotency key from the instruction and date and rechecks live account, KYC, restriction, beneficiary, currency and balance controls.",
    match: (route) => route === "/payment-instructions" || route.startsWith("/payment-instructions/"),
    examples: [
      {
        title: "Create a standing order",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/payment-instructions" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"type":"STANDING_ORDER","paymentType":"INTERNAL","sourceAccountNumber":"1000000002",',
          '    "destinationAccountNumber":"1000000001","amount":"25.00","description":"Monthly demonstration transfer",',
          '    "frequency":"MONTHLY","startDate":"2026-08-15"}\'',
        ],
      },
      {
        title: "Run due occurrences for a business date",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/payment-instructions/processing-runs" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"businessDate":"2026-08-15"}\'',
        ],
      },
    ],
  },
  {
    title: "Direct debits",
    blurb: "Create and cancel mandates and submit collections with an Idempotency-Key. Mandate creation requires an active source account and an active same-currency creditor beneficiary of the same customer; a mandate reserves no funds. Collections enforce mandate dates and maximum amount, then delegate to the external-payment service.",
    match: (route) => route === "/direct-debits" || route.startsWith("/direct-debits/"),
    examples: [
      {
        title: "Submit a direct-debit collection",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/direct-debits/DDM-000001/collections" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Idempotency-Key: creditor-run-20260802-001" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"amount":"25.00","collectionDate":"2026-08-02"}\'',
        ],
      },
    ],
  },
  {
    title: "End-of-day runs",
    blurb: "Run daily deposit interest and product charges for one business date. Only one run is claimed per business date; each eligible account occurrence has a stable idempotency key. Interest uses the product annual rate with a 365-day basis; every customer leg is paired with an equal-and-opposite currency-clearing leg.",
    match: (route) => route === "/end-of-day-runs" || route.startsWith("/end-of-day-runs/"),
    examples: [
      {
        title: "Run end-of-day posting for a business date",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/end-of-day-runs" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"businessDate":"2026-08-02"}\'',
        ],
      },
    ],
  },
  {
    title: "Clearing reconciliation",
    blurb: "Reconcile imported fictional external settlement records against immutable clearing entries by reference, currency, exact decimal amount and direction. Exceptions remain open until a Supervisor or Admin records a version-checked resolution comment. Reconciliation never alters settlement evidence, entries, journals or balances.",
    match: (route) => route === "/reconciliation-runs" || route.startsWith("/reconciliation-runs/"),
    examples: [
      {
        title: "Reconcile one settlement date",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/reconciliation-runs" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"businessDate":"2026-07-18"}\'',
        ],
      },
    ],
  },
  {
    title: "Accounting periods",
    blurb: "Read the period register and let a Supervisor request close and a distinct Admin approve or reject it. Close is accepted only after a completed end-of-day run and a later completed reconciliation covering the period, with no open exceptions, no active processing runs and every journal balanced and projected.",
    match: (route) => route === "/accounting-periods" || route.startsWith("/accounting-periods/"),
    examples: [
      {
        title: "Request close of an accounting period",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/accounting-periods/ACP-000001/close-requests" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"expectedVersion":1,"comment":"Final processing and reconciliation controls are complete."}\'',
        ],
      },
    ],
  },
  {
    title: "General ledger",
    blurb: "Read the ledger accounts, posted journals and the trial balance, and let a Supervisor submit a same-currency manual journal and a distinct Admin approve or reject it. Every booked subledger writer creates its posted GL journal and balanced lines in the same transaction; pending journals do not affect the trial balance.",
    match: (route) => route === "/general-ledger" || route.startsWith("/general-ledger/"),
    examples: [
      {
        title: "Submit a manual general-ledger journal",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/general-ledger/journals" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Idempotency-Key: manual-journal-demo-0001" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"valueDate":"2026-08-02","currency":"GBP","debitAccountCode":"5100-GBP",',
          '    "creditAccountCode":"1100-GBP","amount":"25.00","description":"Fictional accrual correction",',
          '    "comment":"Prepared from fictional period-end evidence."}\'',
        ],
      },
    ],
  },
  {
    title: "Loan origination",
    blurb: "Submit a loan proposal as Operator or Admin and let a distinct Supervisor or Admin approve or reject it. Submission requires an active customer with approved KYC, no blocking restriction, an active loan product and a same-currency deposit account; it does not move money. Approval rechecks every live control and books a read-only loan account, an exact schedule and a balanced disbursement.",
    match: (route) => route === "/loans" || route.startsWith("/loans/"),
    examples: [
      {
        title: "Submit a loan application",
        code: [
          'curl -X POST "https://future-bank-demo.vercel.app/api/v1/loans" \\',
          '  -H "X-API-Key: $FUTUREBANK_ACTOR_API_KEY" \\',
          '  -H "Idempotency-Key: loan-demo-0001" \\',
          '  -H "Content-Type: application/json" \\',
          '  -d \'{"customerNumber":"C000004","productCode":"LOAN-GBP","destinationAccountNumber":"1000000009",',
          '    "principal":"12000.00","termMonths":12,"firstPaymentDate":"2026-09-01","monthlyIncome":"20000.00",',
          '    "monthlyCommitments":"1000.00","purpose":"Fictional working-capital demonstration evidence.",',
          '    "riskGrade":"B"}\'',
        ],
      },
    ],
  },
  {
    title: "KYC cases",
    blurb: "Drive the KYC lifecycle: open a case, record and verify evidence, run screening, resolve screening results, submit for decision and record CDD. Operator gathers and screens; Compliance decides. KYC approval is a prerequisite for loans and overdrafts.",
    match: (route) => route === "/kyc-cases" || route.startsWith("/kyc-cases/"),
  },
  {
    title: "Overdrafts",
    blurb: "Apply for an overdraft facility, request limit changes, decide as Supervisor, set status and resolve overdraft alerts. Facility limits are the arranged-limit source of truth; pending payments reserve funds through holds. KYC must be approved before a facility is created or increased.",
    match: (route) => route === "/overdrafts" || route.startsWith("/overdrafts/") || route.startsWith("/overdraft-alerts/"),
  },
];

function renderSections() {
  const children = [];
  const resourceTitles = sections.map((section) => section.title).join(", ");
  const operationsBySection = new Map(sections.map((section) => [section, []]));
  for (const [route, methods] of Object.entries(openapi.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === "parameters") continue;
      const section = sections.find((candidate) => candidate.match(route));
      if (!section) throw new Error(`No section matched ${route}`);
      operationsBySection.get(section).push({ method: method.toUpperCase(), route, operation });
    }
  }

  children.push(heading("4. API reference", HeadingLevel.HEADING_1));
  children.push(paragraph("Each section below documents one resource group. Every operation lists its path parameters, query parameters, request-body fields, required role and response shape. Required fields are marked Yes; optional fields are marked No.", { after: 120 }));

  sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    children.push(heading(`4.${sectionNumber} ${section.title}`, HeadingLevel.HEADING_2));
    children.push(paragraph(section.blurb, { after: 100 }));
    const ops = operationsBySection.get(section) ?? [];
    ops.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
    for (const entry of ops) children.push(...renderOperation(entry.method, entry.route, entry.operation));
    for (const example of section.examples ?? []) {
      children.push(paragraph([new TextRun({ text: `Worked example — ${example.title}`, bold: true, size: 20 })], { before: 120, after: 60 }));
      children.push(...codeBlock(example.code));
      children.push(paragraph("", { after: 40 }));
    }
    if (index < sections.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
  });

  return { children, resourceTitles };
}

function titlePage() {
  const children = [];
  children.push(paragraph("", { after: 240 }));
  children.push(new Paragraph({
    children: [new TextRun({ text: openapi.info.title, size: 52, bold: true, color: "1F3864" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "REST API Reference Guide", size: 32 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Contract version ${openapi.info.version}`, size: 24 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Generated from openapi/futurebank.v1.source.json", size: 20, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Demonstration use only. All people, businesses, identifiers, documents, screening results, balances and policies are fictional.", size: 20, italics: true, color: "7F0000" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function sectionOverview(resourceTitles) {
  const children = [];
  children.push(heading("1. Overview", HeadingLevel.HEADING_1));
  children.push(paragraph(openapi.info.description, { after: 120 }));
  children.push(paragraph([new TextRun({ text: "Base URLs", bold: true })], { after: 60 }));
  children.push(dataTable(["Environment", "Base URL"], openapi.servers.map((server) => [server.description, server.url]), [30, 70]));
  children.push(paragraph("", { after: 40 }));
  children.push(paragraph([
    new TextRun({ text: "Discovery. ", bold: true }),
    new TextRun({ text: "GET /api/v1 returns the runtime resource index; GET /api/openapi.json returns the complete OpenAPI 3.0.3 document. Both are public so tooling can import the contract before configuring authentication; every /api/v1 business route remains authenticated." }),
  ], { after: 80 }));
  children.push(paragraph([
    new TextRun({ text: "Coverage. ", bold: true }),
    new TextRun({ text: "This guide documents every exposed function, grouped as: " }),
    new TextRun({ text: resourceTitles, italics: true }),
    new TextRun({ text: "." }),
  ], { after: 80 }));
  return children;
}

function sectionAuth() {
  const children = [];
  children.push(heading("2. Authentication and actors", HeadingLevel.HEADING_1));
  children.push(paragraph("Every /api/v1 business route requires a valid actor-owned API key. Each key is bound to exactly one active staff user who determines the audit identity and permissions for every request; callers cannot select or impersonate another actor.", { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Send the issued key using either header:", bold: true })], { after: 60 }));
  children.push(...codeBlock([
    "X-API-Key: <actor-owned-key>",
    "Authorization: Bearer <actor-owned-key>",
  ]));
  children.push(paragraph("The X-Staff-Username header is not supported and is rejected. A key whose owner is not an active staff actor returns 403 INACTIVE_API_ACTOR.", { after: 120 }));
  children.push(paragraph([new TextRun({ text: "Demonstration actors", bold: true })], { after: 60 }));
  children.push(dataTable(
    ["Username", "Role", "Responsibility"],
    [
      ["bp.operator", "OPERATOR", "Initiates customers, accounts, beneficiaries, payments, instructions, mandates, collections, loans, KYC evidence/screening and overdraft applications."],
      ["bp.supervisor", "SUPERVISOR", "Decides payments, reversals, loans and overdrafts; executes schedules, end-of-day, reconciliation, period-close requests and manual journals."],
      ["bp.compliance", "COMPLIANCE", "Decides KYC cases and maintains restrictions."],
      ["bp.admin", "ADMIN", "Performs every role and the demonstration reset (DEMO_RESET)."],
    ],
    [22, 16, 62],
  ));
  children.push(paragraph("", { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Permission matrix", bold: true })], { after: 60 }));
  children.push(dataTable(
    ["Role", "Permissions"],
    [
      ["OPERATOR", "CUSTOMER_MAINTAIN, KYC_GATHER, KYC_SCREEN, PAYMENT_INITIATE, PAYMENT_REVERSAL_INITIATE, PAYMENT_INSTRUCTION_MAINTAIN, DIRECT_DEBIT_MAINTAIN, DIRECT_DEBIT_COLLECT, OVERDRAFT_INITIATE, LOAN_ORIGINATION_INITIATE"],
      ["SUPERVISOR", "PAYMENT_DECIDE, PAYMENT_REVERSAL_DECIDE, PAYMENT_SCHEDULE_EXECUTE, END_OF_DAY_EXECUTE, RECONCILIATION_EXECUTE, RECONCILIATION_RESOLVE, ACCOUNTING_PERIOD_CLOSE_INITIATE, GENERAL_LEDGER_JOURNAL_INITIATE, OVERDRAFT_DECIDE, OVERDRAFT_ALERT_RESOLVE, LOAN_ORIGINATION_DECIDE"],
      ["COMPLIANCE", "KYC_DECIDE, RESTRICTION_MAINTAIN"],
      ["ADMIN", "Every OPERATOR, SUPERVISOR and COMPLIANCE permission plus DEMO_RESET"],
    ],
    [22, 78],
  ));
  children.push(paragraph("Maker-checker separation requires distinct actors: the initiator can never decide the same payment, reversal, loan, overdraft, journal, KYC case or period close. Decisions carry an expected work-item version and database locking prevents concurrent approval.", { before: 80, after: 80 }));
  return children;
}

function sectionFormat() {
  const children = [];
  children.push(heading("3. Format and conventions", HeadingLevel.HEADING_1));
  children.push(paragraph([new TextRun({ text: "Response envelope. ", bold: true }), new TextRun({ text: "Successful responses return { data: ... } where data is the resource, list or an ActionState mutation result { ok, code, message, fieldErrors? }. Errors return { error: { code, message, fieldErrors? } } with an appropriate HTTP status." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "HTTP status. ", bold: true })], { after: 40 }));
  children.push(dataTable(
    ["Status", "Meaning"],
    [
      ["200", "Successful read or mutation"],
      ["201", "Resource created"],
      ["202", "Accepted; queued processing run"],
      ["400", "Validation or malformed request (VALIDATION_ERROR, INVALID_JSON, INVALID_QUERY, CONFIRMATION_REQUIRED)"],
      ["401", "Missing or invalid API key (INVALID_API_KEY)"],
      ["403", "Actor forbidden or inactive (FORBIDDEN, INACTIVE_API_ACTOR)"],
      ["404", "Entity not found (code ends in _NOT_FOUND)"],
      ["409", "Business conflict such as CURRENCY_MISMATCH, KYC_NOT_APPROVED, STALE_WORK_ITEM, MINIMUM_BALANCE or CUSTOMER_RESTRICTED"],
      ["415", "Unsupported upload media type"],
      ["503", "Dependency unavailable (for example end-of-day already claimed for the date)"],
    ],
    [14, 86],
  ));
  children.push(paragraph("", { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Money. ", bold: true }), new TextRun({ text: "All amounts are exact decimal strings with up to two decimal places (for example \"1250.00\"). Floating point is never used for posted financial values." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Dates. ", bold: true }), new TextRun({ text: "ISO 8601 dates are sent and returned as YYYY-MM-DD; timestamps use ISO 8601 with timezone." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Idempotency. ", bold: true }), new TextRun({ text: "Write operations that can create records accept an Idempotency-Key header (also accepted in the body). Reuse the same key when retrying so a retried request never books twice; responses for a duplicated key report PAYMENT_ALREADY_BOOKED or the equivalent code." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Pagination. ", bold: true }), new TextRun({ text: "List endpoints accept limit (default 50, maximum 200) and offset (default 0) query parameters." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Unicode. ", bold: true }), new TextRun({ text: "Names, addresses and descriptive fields accept Unicode including Arabic script; customer search accepts Arabic names and Latin transliterations. Structured identifiers, country codes, dates and money remain LTR." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Content types. ", bold: true }), new TextRun({ text: "Business routes exchange application/json. Customer document upload is multipart/form-data with a field named file; document content is streamed as raw bytes with Content-Type, Content-Length, Content-Disposition, ETag and Cache-Control: no-store; account statements are text/csv downloads." })], { after: 80 }));
  children.push(paragraph([new TextRun({ text: "Caching. ", bold: true }), new TextRun({ text: "Every API response is served with Cache-Control: no-store." })], { after: 80 }));
  return children;
}

function sectionErrors() {
  const children = [];
  children.push(heading("5. Error reference", HeadingLevel.HEADING_1));
  children.push(paragraph("The following codes are used across the API. Mutation errors that do not match a validation or not-found case default to 409 Conflict.", { after: 80 }));
  children.push(dataTable(
    ["Code", "Status", "Meaning"],
    [
      ["INVALID_API_KEY", "401", "Missing or unrecognised API key."],
      ["ACTOR_HEADER_NOT_SUPPORTED", "400", "X-Staff-Username was supplied and is rejected."],
      ["INACTIVE_API_ACTOR", "403", "The key owner is not an active staff actor."],
      ["FORBIDDEN", "403", "The selected actor lacks the required role or permission."],
      ["INVALID_JSON", "400", "Request body is not a JSON object."],
      ["INVALID_QUERY", "400", "A query parameter is malformed or out of range."],
      ["INVALID_SLOT", "400", "Document slot is not PASSPORT or NATIONAL_ID."],
      ["VALIDATION_ERROR", "400", "One or more fields failed validation; fieldErrors lists them."],
      ["CONFIRMATION_REQUIRED", "400", "A confirmation phrase or precondition is missing."],
      ["*_NOT_FOUND", "404", "The referenced entity does not exist."],
      ["CURRENCY_MISMATCH", "409", "Source and destination currencies do not match."],
      ["KYC_NOT_APPROVED", "409", "The customer KYC state blocks the operation (loans, overdrafts)."],
      ["CUSTOMER_RESTRICTED", "409", "KYC controls or a restriction block the operation."],
      ["MINIMUM_BALANCE", "409", "Opening or operating balance is below the product minimum."],
      ["STALE_WORK_ITEM", "409", "An expected work-item version was supplied that no longer matches."],
      ["WORK_ITEM_ASSIGNED", "409", "The work item is already assigned to another actor."],
      ["UNSUPPORTED_MEDIA_TYPE", "415", "Upload content type is not multipart/form-data."],
      ["INTERNAL_ERROR", "500", "An unexpected server error occurred."],
      ["DEPENDENCY_UNAVAILABLE", "503", "A required dependency or exclusive run could not be claimed."],
    ],
    [26, 10, 64],
  ));
  return children;
}

function sectionAppendix() {
  const children = [];
  children.push(heading("6. Appendix — contract artifacts", HeadingLevel.HEADING_1));
  children.push(paragraph("The OpenAPI 3.0.3 contract is the single source of truth for shapes and parameterisation; this guide is generated from it and is regenerated whenever the contract changes.", { after: 80 }));
  children.push(dataTable(
    ["Artifact", "Location / command"],
    [
      ["Canonical OpenAPI source", "openapi/futurebank.v1.source.json"],
      ["Generated repository artifact", "openapi/futurebank.v1.json (npm run openapi:generate)"],
      ["Runtime document", "GET /api/openapi.json"],
      ["Runtime discovery", "GET /api/v1"],
      ["This guide", "docs/FutureBank-API-Guide.docx (npm run api-guide:generate)"],
      ["Contract freshness checks", "npm run openapi:check and npm run api-guide:check"],
    ],
    [38, 62],
  ));
  children.push(paragraph("The OpenAPI document lists every implemented route with unique operation IDs, typed success and error contracts, API-key and Bearer alternatives, examples, upload constraints and raw binary document responses.", { before: 80, after: 80 }));
  return children;
}

function buildDocument({ children, resourceTitles }) {
  return new Document({
    creator: "FutureBank",
    title: `${openapi.info.title} — API Reference Guide`,
    description: "FutureBank demonstration REST API reference guide generated from the OpenAPI contract.",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21, color: "1A1A1A" } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: [...titlePage(), ...sectionOverview(resourceTitles), new Paragraph({ children: [new PageBreak()] }), ...sectionAuth(), new Paragraph({ children: [new PageBreak()] }), ...sectionFormat(), new Paragraph({ children: [new PageBreak()] }), ...children, new Paragraph({ children: [new PageBreak()] }), ...sectionErrors(), new Paragraph({ children: [new PageBreak()] }), ...sectionAppendix()],
      },
    ],
  });
}

export async function renderGuide() {
  openapi = JSON.parse(await readFile(sourcePath, "utf8"));
  const { children, resourceTitles } = renderSections();
  return await Packer.toBuffer(buildDocument({ children, resourceTitles }));
}

function zipEntries(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let endPos = buffer.length - 22;
  while (view.getUint32(endPos, true) !== 0x06054b50) endPos -= 1;
  const centralOffset = view.getUint32(endPos + 16, true);
  const entryCount = view.getUint16(endPos + 10, true);
  const entries = [];
  let pos = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error(`invalid zip central directory entry ${i}`);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    entries.push({ name, data: buffer.subarray(dataStart, dataStart + compSize) });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function contentHash(buffer) {
  const hash = createHash("sha256");
  for (const { name, data } of zipEntries(buffer).sort((a, b) => a.name.localeCompare(b.name))) {
    if (name === "docProps/core.xml") continue;
    hash.update(name).update(data);
  }
  return hash.digest("hex");
}

export { contentHash };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const buffer = await renderGuide();
  if (checkMode) {
    try {
      const committed = await readFile(outputPath);
      if (contentHash(committed) !== contentHash(buffer)) {
        console.error("docs/FutureBank-API-Guide.docx is stale. Run npm run api-guide:generate and commit the regenerated file.");
        process.exit(1);
      }
      console.info("FutureBank API guide is current.");
    } catch (error) {
      console.error(`docs/FutureBank-API-Guide.docx is missing (${error.code ?? error.message}). Run npm run api-guide:generate and commit the file.`);
      process.exit(1);
    }
  } else {
    await writeFile(outputPath, buffer);
    console.info(`Wrote ${path.relative(root, outputPath)} (${buffer.length} bytes).`);
  }
}
