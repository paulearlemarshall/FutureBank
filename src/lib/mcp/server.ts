import "server-only";

import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/api/http";
import { routeApiRequest } from "@/lib/api/router";
import { invokeMcpApi, type McpApiResult } from "@/lib/mcp/api-adapter";

const accountNumberSchema = z.string().trim().regex(/^\d{10}$/, "Account number must contain 10 digits.");
const customerNumberSchema = z.string().trim().regex(/^C\d{6}$/, "Customer number must use the C000000 format.");
const caseReferenceSchema = z.string().trim().min(5).max(80);

const evidenceFields = {
  evidenceType: z.string().trim().min(2),
  documentReference: z.string().trim().min(3),
  documentNumber: z.string().trim().min(1).nullable().optional(),
  source: z.string().trim().min(3),
  receivedAt: z.string().date(),
  issuedAt: z.string().date().nullable().optional(),
  expiresAt: z.string().date().nullable().optional(),
  reviewerNotes: z.string().nullable().optional(),
  firstName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
};
const customerCreateSchema = z.object({
  partyType: z.enum(["RETAIL", "SME"]),
  title: z.string().nullable().optional(),
  givenName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  shortName: z.string().trim().min(2),
  dateOfBirth: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  nationality: z.string().trim().length(2),
  residenceCountry: z.string().trim().length(2),
  language: z.string().trim().min(2).optional(),
  sector: z.string().trim().min(2),
  industry: z.string().trim().min(2),
  kycStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "AWAITING_INFORMATION", "PENDING_APPROVAL", "APPROVED", "DUE", "REJECTED", "EXPIRED"]),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH"]),
  kycReviewDate: z.string().min(10).optional(),
  taxId: z.string().min(3).optional(),
  branchCode: z.string().min(3).optional(),
  relationshipManager: z.string().trim().min(2),
  addressLine1: z.string().trim().min(3),
  addressLine2: z.string().nullable().optional(),
  city: z.string().trim().min(2),
  region: z.string().nullable().optional(),
  postalCode: z.string().trim().min(2),
  country: z.string().trim().length(2).optional(),
  email: z.email(),
  phone: z.string().trim().min(7),
  identityDocumentType: z.string().nullable().optional(),
  identityDocumentNumber: z.string().nullable().optional(),
  identityIssuingCountry: z.string().length(2).nullable().optional(),
  identityIssuedAt: z.string().nullable().optional(),
  identityExpiresAt: z.string().nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.partyType === "RETAIL" && (!value.givenName?.trim() || !value.familyName?.trim() || !value.dateOfBirth?.trim())) {
    context.addIssue({ code: "custom", path: ["givenName"], message: "Retail customers require given name, family name, and date of birth." });
  }
  if (value.partyType === "SME" && (!value.legalName?.trim() || !value.registrationNumber?.trim())) {
    context.addIssue({ code: "custom", path: ["legalName"], message: "SME customers require legal name and registration number." });
  }
  if (value.identityDocumentNumber && (!value.identityDocumentType || !value.identityIssuingCountry || !value.identityIssuedAt || !value.identityExpiresAt)) {
    context.addIssue({ code: "custom", path: ["identityDocumentNumber"], message: "Identity type, issuing country, issue date, and expiry date are required with a document number." });
  }
});
const customerUpdateSchema = z.object({
  partyType: z.enum(["RETAIL", "SME"]),
  title: z.string().nullable().optional(),
  givenName: z.string().nullable().optional(),
  familyName: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  shortName: z.string().trim().min(2),
  dateOfBirth: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  nationality: z.string().trim().length(2),
  residenceCountry: z.string().trim().length(2),
  status: z.enum(["ACTIVE", "INACTIVE", "RESTRICTED"]),
  kycStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "AWAITING_INFORMATION", "PENDING_APPROVAL", "APPROVED", "DUE", "REJECTED", "EXPIRED"]),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH"]),
  kycReviewDate: z.string().min(10),
  language: z.string().trim().min(2),
  taxId: z.string().min(3),
  branchCode: z.string().min(3),
  relationshipManager: z.string().trim().min(2),
  sector: z.string().trim().min(2),
  industry: z.string().trim().min(2),
  addressLine1: z.string().trim().min(3),
  city: z.string().trim().min(2),
  postalCode: z.string().trim().min(2),
  country: z.string().trim().length(2),
  email: z.email(),
  phone: z.string().trim().min(7),
}).strict().superRefine((value, context) => {
  if (value.partyType === "RETAIL" && (!value.givenName?.trim() || !value.familyName?.trim() || !value.dateOfBirth?.trim())) {
    context.addIssue({ code: "custom", path: ["givenName"], message: "Retail customers require given name, family name, and date of birth." });
  }
  if (value.partyType === "SME" && (!value.legalName?.trim() || !value.registrationNumber?.trim())) {
    context.addIssue({ code: "custom", path: ["legalName"], message: "SME customers require legal name and registration number." });
  }
});
const beneficiaryCreateSchema = z.object({
  customerNumber: customerNumberSchema,
  name: z.string().trim().min(2),
  bankName: z.string().trim().min(2),
  accountNumber: z.string().trim().min(4),
  iban: z.string().nullable().optional(),
  swiftBic: z.string().nullable().optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
}).strict();
const workItemStatusSchema = z.enum(["OPEN", "ASSIGNED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"]);
const workItemTypeSchema = z.enum(["KYC_APPROVAL", "PAYMENT_APPROVAL", "PAYMENT_REVERSAL", "OVERDRAFT_APPROVAL", "OVERDRAFT_CHANGE", "OVERDRAFT_ALERT", "ACCOUNTING_PERIOD_CLOSE", "GENERAL_LEDGER_JOURNAL", "LOAN_ORIGINATION"]);
const workItemPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const mcpWriteOutputSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  data: z.object({}).passthrough().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
});

function mcpWriteResult(result: McpApiResult) {
  return { isError: !result.ok, structuredContent: result, content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

async function writeApi(method: string, segments: string[], body?: Record<string, unknown>, headers?: Record<string, string>) {
  return mcpWriteResult(await invokeMcpApi(method, segments, body, routeApiRequest, headers));
}

const paymentReferenceSchema = z.string().trim().min(5).max(80);
const idempotencyKeySchema = z.string().trim().min(8).max(100);
const moneySchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a decimal string with up to two decimal places.");

async function readApi(segments: string[], query?: URLSearchParams): Promise<unknown> {
  const url = new URL(`/api/v1/${segments.map(encodeURIComponent).join("/")}`, "http://futurebank.internal");
  if (query) url.search = query.toString();
  const response = await routeApiRequest(new Request(url, { method: "GET" }), segments);
  const body: unknown = await response.json();

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      && typeof body.error === "object" && body.error !== null && "message" in body.error
      && typeof body.error.message === "string"
      ? body.error.message
      : "The FutureBank read request failed.";
    throw new Error(message);
  }

  return typeof body === "object" && body !== null && "data" in body ? body.data : body;
}

function createFutureBankMcpServer(): McpServer {
  const server = new McpServer({ name: "futurebank-operations", version: "1.1.0" });

  server.registerTool("search_customers", {
    description: "Search fictional FutureBank customers by name or customer number. Results follow the authenticated actor's API permissions.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      query: z.string().trim().min(1).max(100).describe("A name or customer number to search for."),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of results. Defaults to 20."),
    },
  }, async ({ query, limit }) => {
    const params = new URLSearchParams({ query, limit: String(limit ?? 20), offset: "0" });
    const data = await readApi(["customers"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_customer", {
    description: "Read a fictional FutureBank customer by customer number.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { customerNumber: customerNumberSchema.describe("Customer number, for example C000001.") },
  }, async ({ customerNumber }) => {
    const data = await readApi(["customers", customerNumber]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_beneficiaries", {
    description: "List fictional external payment beneficiaries, optionally restricted to one customer.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      customerNumber: customerNumberSchema.optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async ({ customerNumber, limit }) => {
    const params = new URLSearchParams({ limit: String(limit ?? 20) });
    if (customerNumber) params.set("customerNumber", customerNumber);
    const data = await readApi(["beneficiaries"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("create_customer", {
    description: "Create a fictional retail or SME customer using the same validation, staff permissions and audit trail as the FutureBank UI. Returns the customer number in structured result data. Requires an Operator or Admin actor.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: customerCreateSchema,
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["customers"], input));

  server.registerTool("update_customer", {
    description: "Replace the supported mutable CRM fields for a fictional customer. This is a full update, not a partial patch. The request is subject to the same validation, staff permissions and audit trail as the FutureBank UI. Requires an Operator or Admin actor.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ customerNumber: customerNumberSchema, ...customerUpdateSchema.shape }).strict().superRefine((value, context) => {
      if (value.partyType === "RETAIL" && (!value.givenName?.trim() || !value.familyName?.trim() || !value.dateOfBirth?.trim())) {
        context.addIssue({ code: "custom", path: ["givenName"], message: "Retail customers require given name, family name, and date of birth." });
      }
      if (value.partyType === "SME" && (!value.legalName?.trim() || !value.registrationNumber?.trim())) {
        context.addIssue({ code: "custom", path: ["legalName"], message: "SME customers require legal name and registration number." });
      }
    }),
    outputSchema: mcpWriteOutputSchema,
  }, async ({ customerNumber, ...body }) => writeApi("PATCH", ["customers", customerNumber], body));

  server.registerTool("create_beneficiary", {
    description: "Create an active fictional external beneficiary for a customer. Existing KYC and debit restriction checks remain enforced. Returns the beneficiary ID in structured result data. Requires an Operator or Admin actor.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: beneficiaryCreateSchema,
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["beneficiaries"], input));

  server.registerTool("set_beneficiary_status", {
    description: "Activate or deactivate a fictional external beneficiary. Requires an Operator or Admin actor.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { beneficiaryId: z.uuid(), status: z.enum(["ACTIVE", "INACTIVE"]) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ beneficiaryId, status }) => writeApi("PATCH", ["beneficiaries", beneficiaryId], { status }));

  server.registerTool("apply_customer_restriction", {
    description: "Apply a debit block, payment review or onboarding hold to a fictional customer. A debit block also marks the customer restricted. Requires RESTRICTION_MAINTAIN; the result returns the restriction reference needed to lift it later.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { customerNumber: customerNumberSchema, type: z.enum(["DEBIT_BLOCK", "PAYMENT_REVIEW", "ONBOARDING_HOLD"]), reason: z.string().trim().min(5) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ customerNumber, type, reason }) => writeApi("POST", ["customers", customerNumber, "restrictions"], { type, reason }));

  server.registerTool("lift_customer_restriction", {
    description: "Lift an active restriction on the specified customer, with a reason. Requires RESTRICTION_MAINTAIN. Lifting a debit block does not automatically restore the customer's status.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { customerNumber: customerNumberSchema, restrictionReference: paymentReferenceSchema, reason: z.string().trim().min(5) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ customerNumber, restrictionReference, reason }) => writeApi("POST", ["customers", customerNumber, "restrictions", restrictionReference, "lift"], { reason }));

  server.registerTool("open_account", {
    description: "Open a fictional customer account using an active product and branch. Any opening deposit is booked as a balanced ledger transaction in the same database transaction. Existing KYC, minimum-balance, product and posting-period checks apply.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      customerNumber: customerNumberSchema,
      productCode: z.string().trim().min(2),
      branchCode: z.string().trim().min(3),
      nickname: z.string().nullable().optional(),
      initialDeposit: moneySchema.optional(),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ initialDeposit, ...body }) => writeApi("POST", ["accounts"], { ...body, initialDeposit: initialDeposit ?? "0.00" }));

  server.registerTool("set_account_status", {
    description: "Activate, block or close an account with a reason. Loan accounts cannot be changed; closing requires a zero balance and no pending outgoing payments. The existing account status controls run in the API action.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { accountNumber: accountNumberSchema, status: z.enum(["ACTIVE", "BLOCKED", "CLOSED"]), reason: z.string().trim().min(3) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ accountNumber, ...body }) => writeApi("PATCH", ["accounts", accountNumber, "status"], body));

  server.registerTool("list_payments", {
    description: "List fictional FutureBank payments, optionally filtered by payment status. Includes approval, hold and reversal context.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { status: z.enum(["BOOKED", "PENDING", "REJECTED", "EXPIRED"]).optional() },
  }, async ({ status }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const data = await readApi(["payments"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_payment", {
    description: "Read a payment and its approval work item, hold and reversal state.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { paymentReference: paymentReferenceSchema },
  }, async ({ paymentReference }) => {
    const data = await readApi(["payments", paymentReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_payment_reversals", {
    description: "List full-value payment reversal requests, optionally filtered by status.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { status: z.enum(["PENDING_APPROVAL", "BOOKED", "REJECTED"]).optional() },
  }, async ({ status }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const data = await readApi(["payment-reversals"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_payment_reversal", {
    description: "Read a full-value reversal request, its decision work item and any posted reversal transaction.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { reversalReference: paymentReferenceSchema },
  }, async ({ reversalReference }) => {
    const data = await readApi(["payment-reversals", reversalReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("submit_payment", {
    description: "Submit an internal transfer or external payment. An eligible internal payment may book immediately; an external payment may be held for independent approval. Use a stable idempotencyKey and repeat the same payload when retrying.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
    inputSchema: z.object({
      paymentType: z.enum(["INTERNAL", "EXTERNAL"]),
      sourceAccountNumber: accountNumberSchema,
      destinationAccountNumber: accountNumberSchema.nullable().optional(),
      beneficiaryId: z.uuid().nullable().optional(),
      amount: moneySchema,
      description: z.string().trim().min(3).max(140),
      idempotencyKey: idempotencyKeySchema,
    }).strict().superRefine((value, context) => {
      if (value.paymentType === "INTERNAL" && !value.destinationAccountNumber) context.addIssue({ code: "custom", path: ["destinationAccountNumber"], message: "Internal payments require a destination account." });
      if (value.paymentType === "EXTERNAL" && !value.beneficiaryId) context.addIssue({ code: "custom", path: ["beneficiaryId"], message: "External payments require a beneficiary." });
    }),
    outputSchema: mcpWriteOutputSchema,
  }, async ({ idempotencyKey, ...body }) => writeApi("POST", ["payments"], body, { "Idempotency-Key": idempotencyKey }));

  server.registerTool("decide_payment", {
    description: "Approve or reject a pending payment using the current work-item version and a decision comment. Approval books the payment; rejection releases its hold. Requires PAYMENT_DECIDE and an independent checker.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      paymentReference: paymentReferenceSchema,
      workItemReference: paymentReferenceSchema,
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["APPROVE", "REJECT"]),
      comment: z.string().trim().min(5),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ paymentReference, ...body }) => writeApi("POST", ["payments", paymentReference, "decision"], body));

  server.registerTool("expire_pending_payments", {
    description: "Expire eligible stale pending payments and release their holds. Requires PAYMENT_DECIDE; this can affect multiple payments.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: z.object({}),
    outputSchema: mcpWriteOutputSchema,
  }, async () => writeApi("POST", ["payments", "expiry-run"], {}));

  server.registerTool("request_payment_reversal", {
    description: "Request a full-value reversal of an eligible payment. The original posting is unchanged until an independent checker approves. Use a stable idempotencyKey and repeat the same payload when retrying.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
    inputSchema: { paymentReference: paymentReferenceSchema, reason: z.string().trim().min(10).max(500), idempotencyKey: idempotencyKeySchema },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ paymentReference, reason, idempotencyKey }) => writeApi("POST", ["payments", paymentReference, "reversals"], { reason }, { "Idempotency-Key": idempotencyKey }));

  server.registerTool("decide_payment_reversal", {
    description: "Approve or reject a pending full-value reversal with its current work-item version and a decision comment. Approval posts a linked equal-and-opposite ledger transaction exactly once; requires an independent checker.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      reversalReference: paymentReferenceSchema,
      workItemReference: paymentReferenceSchema,
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["APPROVE", "REJECT"]),
      comment: z.string().trim().min(5),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ reversalReference, ...body }) => writeApi("POST", ["payment-reversals", reversalReference, "decision"], body));

  server.registerTool("list_payment_instructions", {
    description: "List scheduled payments and standing orders, including their next execution date and recent execution history.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["payment-instructions"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_payment_instruction", {
    description: "Read a scheduled payment or standing order, its current version and execution history.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { instructionReference: paymentReferenceSchema },
  }, async ({ instructionReference }) => {
    const data = await readApi(["payment-instructions", instructionReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_payment_instruction_runs", {
    description: "List recent processing runs for scheduled payments and standing orders.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, async ({ limit }) => {
    const data = await readApi(["payment-instructions", "processing-runs"], new URLSearchParams({ limit: String(limit ?? 10) }));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("create_payment_instruction", {
    description: "Create a future-dated payment or standing order. Creation reserves no funds; due occurrences recheck payment controls and may book or require independent payment approval. Requires PAYMENT_INSTRUCTION_MAINTAIN.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({
      type: z.enum(["SCHEDULED", "STANDING_ORDER"]),
      paymentType: z.enum(["INTERNAL", "EXTERNAL"]),
      sourceAccountNumber: accountNumberSchema,
      destinationAccountNumber: accountNumberSchema.nullable().optional(),
      beneficiaryId: z.uuid().nullable().optional(),
      amount: moneySchema,
      description: z.string().trim().min(2).max(140),
      frequency: z.enum(["ONCE", "WEEKLY", "MONTHLY"]),
      startDate: z.string().date(),
      endDate: z.string().date().nullable().optional(),
    }).strict().superRefine((value, context) => {
      if (value.paymentType === "INTERNAL" && !value.destinationAccountNumber) context.addIssue({ code: "custom", path: ["destinationAccountNumber"], message: "Internal instructions require a destination account." });
      if (value.paymentType === "EXTERNAL" && !value.beneficiaryId) context.addIssue({ code: "custom", path: ["beneficiaryId"], message: "External instructions require a beneficiary." });
      if (value.type === "SCHEDULED" && value.frequency !== "ONCE") context.addIssue({ code: "custom", path: ["frequency"], message: "Scheduled payments must use ONCE frequency." });
      if (value.type === "STANDING_ORDER" && value.frequency === "ONCE") context.addIssue({ code: "custom", path: ["frequency"], message: "Standing orders must use WEEKLY or MONTHLY frequency." });
    }),
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["payment-instructions"], input));

  server.registerTool("cancel_payment_instruction", {
    description: "Cancel an active payment instruction using its current version and a reason. Requires PAYMENT_INSTRUCTION_MAINTAIN.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { instructionReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(300) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ instructionReference, ...body }) => writeApi("POST", ["payment-instructions", instructionReference, "cancellation"], body));

  server.registerTool("run_payment_instructions", {
    description: "Process all due scheduled payment instructions for a business date. This may book payments, create pending payments with holds, or record failures. Requires PAYMENT_SCHEDULE_EXECUTE.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { businessDate: z.string().date() },
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["payment-instructions", "processing-runs"], input));

  server.registerTool("list_direct_debit_mandates", {
    description: "List direct-debit mandates with their validity, status, version and collection history.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["direct-debits"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_direct_debit_mandate", {
    description: "Read a direct-debit mandate and its collection history.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { mandateReference: paymentReferenceSchema },
  }, async ({ mandateReference }) => {
    const data = await readApi(["direct-debits", mandateReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("create_direct_debit_mandate", {
    description: "Create a direct-debit mandate for an active customer-owned creditor beneficiary. It reserves no funds; later collections recheck mandate dates, limits, KYC and available balance. Requires DIRECT_DEBIT_MAINTAIN.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      sourceAccountNumber: accountNumberSchema,
      creditorBeneficiaryId: z.uuid(),
      creditorMandateReference: z.string().trim().min(3).max(80),
      maximumSingleAmount: moneySchema,
      validFrom: z.string().date(),
      validTo: z.string().date().nullable().optional(),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["direct-debits"], input));

  server.registerTool("cancel_direct_debit_mandate", {
    description: "Cancel an active or suspended direct-debit mandate using its current version and a reason. Cancellation is blocked while a collection is processing. Requires DIRECT_DEBIT_MAINTAIN.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { mandateReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(300) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ mandateReference, ...body }) => writeApi("POST", ["direct-debits", mandateReference, "cancellation"], body));

  server.registerTool("submit_direct_debit_collection", {
    description: "Submit an immediate collection against an active mandate. It may book immediately, create a pending payment with a hold, or be rejected. Requires a stable idempotencyKey; reuse it with the same payload for a retry.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
    inputSchema: { mandateReference: paymentReferenceSchema, amount: moneySchema, collectionDate: z.string().date(), idempotencyKey: idempotencyKeySchema },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ mandateReference, amount, collectionDate, idempotencyKey }) => writeApi("POST", ["direct-debits", mandateReference, "collections"], { amount, collectionDate }, { "Idempotency-Key": idempotencyKey }));

  server.registerTool("list_work_items", {
    description: "List approval work items with optional status, type, priority, assignee and overdue filters.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      status: workItemStatusSchema.optional(),
      type: workItemTypeSchema.optional(),
      priority: workItemPrioritySchema.optional(),
      assignedTo: z.string().optional(),
      overdueOnly: z.boolean().optional(),
    },
  }, async ({ status, type, priority, assignedTo, overdueOnly }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (priority) params.set("priority", priority);
    if (assignedTo) params.set("assignedTo", assignedTo);
    if (overdueOnly) params.set("overdueOnly", "true");
    const data = await readApi(["work-items"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_work_item", {
    description: "Read a work item, its current version, assignment, decision status and event history.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { workItemReference: z.string().trim().min(5).max(80) },
  }, async ({ workItemReference }) => {
    const data = await readApi(["work-items", workItemReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("claim_work_item", {
    description: "Claim an eligible open work item using its current version. A successful claim increments the version; reread before deciding.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { workItemReference: z.string().trim().min(5).max(80), expectedVersion: z.number().int().positive() },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ workItemReference, expectedVersion }) => writeApi("POST", ["work-items", workItemReference, "claim"], { expectedVersion }));

  server.registerTool("release_work_item", {
    description: "Release a work item assigned to the authenticated actor, using its current version.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { workItemReference: z.string().trim().min(5).max(80), expectedVersion: z.number().int().positive() },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ workItemReference, expectedVersion }) => writeApi("POST", ["work-items", workItemReference, "release"], { expectedVersion }));

  server.registerTool("list_kyc_cases", {
    description: "List fictional FutureBank KYC cases. Use this to discover a case reference before making a KYC change.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["kyc-cases"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_kyc_case", {
    description: "Read a fictional KYC case, including its version, CDD profile, evidence, screening checks and restrictions.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { caseReference: caseReferenceSchema },
  }, async ({ caseReference }) => {
    const data = await readApi(["kyc-cases", caseReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("open_kyc_case", {
    description: "Open a KYC case for a fictional customer. Requires the actor's KYC gathering permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      customerNumber: customerNumberSchema,
      type: z.enum(["ONBOARDING", "PERIODIC_REVIEW", "TRIGGER_EVENT", "REMEDIATION"]),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ customerNumber, type }) => writeApi("POST", ["kyc-cases"], { customerNumber, type }));

  server.registerTool("update_kyc_cdd", {
    description: "Create or replace the complete CDD profile for a fictional KYC case. expectedCountries is comma-separated ISO country codes. Requires KYC gathering permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      caseReference: caseReferenceSchema,
      accountPurpose: z.string().trim().min(3),
      occupationOrBusiness: z.string().trim().min(2),
      expectedMonthlyCredits: z.string().regex(/^\d+(\.\d{1,2})?$/),
      expectedMonthlyDebits: z.string().regex(/^\d+(\.\d{1,2})?$/),
      expectedCountries: z.string().trim().min(2),
      cashUsage: z.string().trim().min(2),
      sourceOfFunds: z.string().trim().min(3),
      sourceOfWealth: z.string().trim().min(3),
      incomeOrTurnoverBand: z.string().trim().min(2),
      netWorthBand: z.string().trim().min(2),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, ...profile }) => writeApi("PATCH", ["kyc-cases", caseReference, "cdd"], profile));

  server.registerTool("record_kyc_evidence", {
    description: "Record fictional KYC evidence metadata only; this does not upload a document. Returns an evidence reference. Requires KYC gathering permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ caseReference: caseReferenceSchema, ...evidenceFields }).strict().superRefine((value, context) => {
      if ((value.firstName == null) !== (value.lastName == null)) {
        context.addIssue({ code: "custom", path: [value.firstName == null ? "firstName" : "lastName"], message: "First name and last name must be supplied together." });
      }
      if (value.issuedAt && value.expiresAt && value.issuedAt > value.expiresAt) {
        context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry date must not be before issue date." });
      }
    }),
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, ...evidence }) => writeApi("POST", ["kyc-cases", caseReference, "evidence"], evidence));

  server.registerTool("delete_customer_document", {
    description: "Delete a non-seeded customer document by reference. Requires the actor's KYC gathering permission. Seeded baseline documents cannot be deleted.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      customerNumber: customerNumberSchema,
      documentReference: z.string().trim().min(3).max(120),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ customerNumber, documentReference }) => writeApi("DELETE", ["customers", customerNumber, "documents", documentReference]));

  server.registerTool("update_kyc_evidence", {
    description: "Update fictional KYC evidence metadata for an evidence reference in the specified case. Requires KYC gathering permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({ caseReference: caseReferenceSchema, evidenceReference: z.string().trim().min(5), ...evidenceFields }).strict().superRefine((value, context) => {
      if ((value.firstName == null) !== (value.lastName == null)) {
        context.addIssue({ code: "custom", path: [value.firstName == null ? "firstName" : "lastName"], message: "First name and last name must be supplied together." });
      }
      if (value.issuedAt && value.expiresAt && value.issuedAt > value.expiresAt) {
        context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry date must not be before issue date." });
      }
    }),
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, evidenceReference, ...evidence }) => writeApi("PATCH", ["kyc-cases", caseReference, "evidence", evidenceReference], evidence));

  server.registerTool("run_kyc_screening", {
    description: "Run FutureBank's fictional screening rules for a KYC case. This creates screening history and requires the actor's KYC screening permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { caseReference: caseReferenceSchema },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference }) => writeApi("POST", ["kyc-cases", caseReference, "screening"], {}));

  server.registerTool("set_kyc_case_lock", {
    description: "Lock or unlock a KYC case with a reason and expected case version. Requires KYC lock permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { caseReference: caseReferenceSchema, locked: z.boolean(), reason: z.string().trim().min(5), expectedVersion: z.number().int().positive() },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, ...body }) => writeApi("POST", ["kyc-cases", caseReference, "lock"], body));

  server.registerTool("verify_kyc_evidence", {
    description: "Mark recorded fictional KYC evidence as verified or rejected with reviewer notes. Requires KYC gathering permission.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { caseReference: caseReferenceSchema, evidenceReference: z.string().trim().min(5), outcome: z.enum(["VERIFIED", "REJECTED"]), reviewerNotes: z.string().trim().min(3) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, evidenceReference, outcome, reviewerNotes }) => writeApi("POST", ["kyc-cases", caseReference, "evidence-verification"], { evidenceReference, outcome, reviewerNotes }));

  server.registerTool("resolve_kyc_screening", {
    description: "Resolve a possible fictional screening match. This is a Compliance decision and requires a comment.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { caseReference: caseReferenceSchema, screeningReference: z.string().trim().min(5), outcome: z.enum(["FALSE_POSITIVE", "CONFIRMED_MATCH"]), comment: z.string().trim().min(5) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, screeningReference, outcome, comment }) => writeApi("POST", ["kyc-cases", caseReference, "screening-resolution"], { screeningReference, outcome, comment }));

  server.registerTool("submit_kyc_case", {
    description: "Submit a complete KYC case for independent Compliance approval. Existing evidence, CDD and screening gates are enforced.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { caseReference: caseReferenceSchema },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference }) => writeApi("POST", ["kyc-cases", caseReference, "submission"], {}));

  server.registerTool("decide_kyc_case", {
    description: "Approve or reject a submitted KYC case. Requires Compliance permission, an independent maker, the current work-item version and a decision comment.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      caseReference: caseReferenceSchema,
      workItemReference: z.string().trim().min(5),
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["APPROVE", "REJECT"]),
      comment: z.string().trim().min(5),
      finalRiskRating: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      overrideReason: z.string().nullable().optional(),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ caseReference, ...body }) => writeApi("POST", ["kyc-cases", caseReference, "decision"], body));

  server.registerTool("get_account", {
    description: "Read a FutureBank account, including its balance and account details.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { accountNumber: accountNumberSchema.describe("Ten digit account number.") },
  }, async ({ accountNumber }) => {
    const data = await readApi(["accounts", accountNumber]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_accounts", {
    description: "Search fictional FutureBank accounts by account number, customer name or customer number.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { query: z.string().trim().min(1).max(100).optional(), limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() },
  }, async ({ query, limit, offset }) => {
    const params = new URLSearchParams({ limit: String(limit ?? 20), offset: String(offset ?? 0) });
    if (query) params.set("query", query);
    const data = await readApi(["accounts"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_products", {
    description: "List account products, including active status, currency and minimum opening balance for account-opening decisions.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["products"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_overdraft_facilities", {
    description: "List arranged-overdraft facilities in every lifecycle state, including requested/approved limits, utilization and headroom.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["overdrafts"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_overdraft_facility", {
    description: "Read facility terms, utilization, active holds, version, alerts and limit history. Use its work item from list_work_items with type OVERDRAFT_APPROVAL or OVERDRAFT_CHANGE when a decision is pending.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { facilityReference: paymentReferenceSchema },
  }, async ({ facilityReference }) => {
    const data = await readApi(["overdrafts", facilityReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("apply_for_overdraft", {
    description: "Submit an arranged-overdraft application for an eligible active current account. A distinct Supervisor must decide it; approval rechecks KYC, debit restrictions, available balance and active holds. Requires OVERDRAFT_INITIATE.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      accountNumber: accountNumberSchema,
      requestedLimit: moneySchema,
      annualInterestRate: z.string().regex(/^\d+(\.\d{1,4})?$/),
      purpose: z.string().trim().min(5),
      monthlyIncomeOrTurnover: moneySchema,
      monthlyCommittedOutgoings: moneySchema,
      riskGrade: z.string().trim().min(1).max(3),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["overdrafts"], input));

  server.registerTool("request_overdraft_limit_change", {
    description: "Request a new limit on an active overdraft facility. Lowering a limit cannot put it below current utilization plus active holds. A distinct Supervisor must decide the request. Requires OVERDRAFT_INITIATE.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { facilityReference: paymentReferenceSchema, requestedLimit: moneySchema, reason: z.string().trim().min(5) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ facilityReference, ...body }) => writeApi("POST", ["overdrafts", facilityReference, "limit-changes"], body));

  server.registerTool("decide_overdraft", {
    description: "Approve or decline a pending overdraft application or limit change using its current work-item version and a decision comment. Approval rechecks KYC, debit blocks, account eligibility, utilization and holds. Requires OVERDRAFT_DECIDE and an independent checker.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      facilityReference: paymentReferenceSchema,
      workItemReference: paymentReferenceSchema,
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["APPROVE", "DECLINE"]),
      comment: z.string().trim().min(5),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ facilityReference, ...body }) => writeApi("POST", ["overdrafts", facilityReference, "decision"], body));

  server.registerTool("set_overdraft_status", {
    description: "Suspend an active overdraft or close a cleared facility. Closing requires utilization and active holds to be cleared. Requires OVERDRAFT_DECIDE.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { facilityReference: paymentReferenceSchema, action: z.enum(["SUSPEND", "CLOSE"]), reason: z.string().trim().min(5) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ facilityReference, ...body }) => writeApi("POST", ["overdrafts", facilityReference, "status"], body));

  server.registerTool("resolve_overdraft_alert", {
    description: "Record an intervention and resolve an open overdraft alert, completing its related work item when present. Requires OVERDRAFT_ALERT_RESOLVE.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      alertReference: paymentReferenceSchema,
      intervention: z.enum(["CONTACT_ATTEMPTED", "CUSTOMER_CONTACTED", "REPAYMENT_DISCUSSION", "LIMIT_REVIEW", "SUSPENSION", "NO_ACTION"]),
      comment: z.string().trim().min(5),
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ alertReference, ...body }) => writeApi("POST", ["overdraft-alerts", alertReference, "resolution"], body));

  server.registerTool("list_end_of_day_runs", {
    description: "List recent end-of-day runs and their posting outcomes.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, async ({ limit }) => {
    const data = await readApi(["end-of-day-runs"], new URLSearchParams({ limit: String(limit ?? 10) }));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_end_of_day_run", {
    description: "Read an end-of-day run and the charge/interest postings it attempted.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { runReference: paymentReferenceSchema },
  }, async ({ runReference }) => {
    const data = await readApi(["end-of-day-runs", runReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("run_end_of_day", {
    description: "Run configured daily overdraft charges and product-rate interest for a business date. The date can be claimed only once and posting dates must be open. This may post balanced ledger transactions; requires END_OF_DAY_EXECUTE.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
    inputSchema: { businessDate: z.string().date() },
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["end-of-day-runs"], input));

  server.registerTool("list_reconciliation_runs", {
    description: "List recent clearing reconciliation runs and exception counts.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, async ({ limit }) => {
    const data = await readApi(["reconciliation-runs"], new URLSearchParams({ limit: String(limit ?? 10) }));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_reconciliation_run", {
    description: "Read a reconciliation run and its matched, open and resolved items with versions.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { runReference: paymentReferenceSchema },
  }, async ({ runReference }) => {
    const data = await readApi(["reconciliation-runs", runReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("run_reconciliation", {
    description: "Reconcile existing settlement evidence for a business date. This creates matched/exception records but does not modify ledger postings; each date is reconciled at most once. Requires RECONCILIATION_EXECUTE.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    inputSchema: { businessDate: z.string().date() },
    outputSchema: mcpWriteOutputSchema,
  }, async (input) => writeApi("POST", ["reconciliation-runs"], input));

  server.registerTool("resolve_reconciliation_item", {
    description: "Resolve an open reconciliation exception with its current item version and a comment. This records an audit resolution and does not change settlement evidence or ledger transactions. Requires RECONCILIATION_RESOLVE.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { runReference: paymentReferenceSchema, itemReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), comment: z.string().trim().min(10).max(500) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ runReference, itemReference, expectedVersion, comment }) => writeApi("POST", ["reconciliation-runs", runReference, "items", itemReference, "resolution"], { expectedVersion, comment }));

  server.registerTool("list_accounting_periods", {
    description: "List accounting periods, their status and close-review evidence.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["accounting-periods"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_accounting_period", {
    description: "Read an accounting period's status, version, close evidence and latest approval work item.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { periodReference: paymentReferenceSchema },
  }, async ({ periodReference }) => {
    const data = await readApi(["accounting-periods", periodReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("request_accounting_period_close", {
    description: "Request close review for a period using its current version and a comment. Existing end-of-day, reconciliation, clearing, exception, process and trial-balance gates must pass; the period is frozen while closing. Requires ACCOUNTING_PERIOD_CLOSE_INITIATE.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { periodReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), comment: z.string().trim().min(10).max(500) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ periodReference, ...body }) => writeApi("POST", ["accounting-periods", periodReference, "close-requests"], body));

  server.registerTool("decide_accounting_period_close", {
    description: "Approve or reject a close request using the current work-item version and a comment. Approval rechecks close gates and blocks posting dates; requires a distinct Admin with ACCOUNTING_PERIOD_CLOSE_DECIDE.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { periodReference: paymentReferenceSchema, workItemReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().trim().min(10).max(500) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ periodReference, ...body }) => writeApi("POST", ["accounting-periods", periodReference, "close-decisions"], body));

  server.registerTool("list_general_ledger_accounts", {
    description: "List currency-specific general-ledger accounts and their posting controls. Use this to select manual-journal accounts.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}),
  }, async () => {
    const data = await readApi(["general-ledger", "accounts"]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_trial_balance", {
    description: "Read a posted general-ledger trial balance for an inclusive date range ending on toDate, optionally filtered by currency.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { toDate: z.string().date(), fromDate: z.string().date().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional() },
  }, async ({ toDate, fromDate, currency }) => {
    const params = new URLSearchParams({ toDate });
    if (fromDate) params.set("fromDate", fromDate);
    if (currency) params.set("currency", currency);
    const data = await readApi(["general-ledger", "trial-balance"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("list_general_ledger_journals", {
    description: "List posted and pending general-ledger journals, including their lines and approval state.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, async ({ limit }) => {
    const data = await readApi(["general-ledger", "journals"], new URLSearchParams({ limit: String(limit ?? 20) }));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_general_ledger_journal", {
    description: "Read a journal's immutable lines, submission/decision evidence and latest approval work item.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { journalReference: paymentReferenceSchema },
  }, async ({ journalReference }) => {
    const data = await readApi(["general-ledger", "journals", journalReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("submit_manual_journal", {
    description: "Submit an exact two-line, same-currency manual journal. It remains pending until an independent Admin approves; approval rechecks the open period and account controls before posting. Requires a stable idempotencyKey and GENERAL_LEDGER_JOURNAL_INITIATE.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    inputSchema: {
      valueDate: z.string().date(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      debitAccountCode: z.string().trim().min(4).max(30),
      creditAccountCode: z.string().trim().min(4).max(30),
      amount: moneySchema,
      description: z.string().trim().min(5).max(200),
      comment: z.string().trim().min(10).max(500),
      idempotencyKey: idempotencyKeySchema,
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ idempotencyKey, ...body }) => writeApi("POST", ["general-ledger", "journals"], body, { "Idempotency-Key": idempotencyKey }));

  server.registerTool("decide_manual_journal", {
    description: "Approve or reject a pending manual journal using its current work-item version and comment. Approval posts exactly once after rechecking balanced lines, currency, account controls and period status; requires a distinct Admin.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { journalReference: paymentReferenceSchema, workItemReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().trim().min(10).max(500) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ journalReference, ...body }) => writeApi("POST", ["general-ledger", "journals", journalReference, "decision"], body));

  server.registerTool("list_loan_applications", {
    description: "List fictional loan applications, optionally filtered by lifecycle status.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { status: z.enum(["PENDING_APPROVAL", "APPROVED", "REJECTED"]).optional() },
  }, async ({ status }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const data = await readApi(["loans"], params);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("get_loan_application", {
    description: "Read a loan application's exact terms, affordability, decision evidence and repayment schedule when approved.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { applicationReference: paymentReferenceSchema },
  }, async ({ applicationReference }) => {
    const data = await readApi(["loans", applicationReference]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.registerTool("submit_loan_application", {
    description: "Submit a fictional loan application with affordability inputs and an idempotency key. It creates a Supervisor work item without moving funds. Approval rechecks KYC, restrictions, product, destination and period before one atomic disbursement. Requires LOAN_ORIGINATION_INITIATE.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    inputSchema: {
      customerNumber: customerNumberSchema,
      productCode: z.string().trim().min(2).max(30),
      destinationAccountNumber: accountNumberSchema,
      principal: moneySchema,
      termMonths: z.number().int().min(6).max(60),
      firstPaymentDate: z.string().date(),
      monthlyIncome: moneySchema,
      monthlyCommitments: moneySchema,
      purpose: z.string().trim().min(10).max(500),
      riskGrade: z.enum(["A", "B", "C"]),
      idempotencyKey: idempotencyKeySchema,
    },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ idempotencyKey, ...body }) => writeApi("POST", ["loans"], body, { "Idempotency-Key": idempotencyKey }));

  server.registerTool("decide_loan_application", {
    description: "Approve or reject a pending loan application with its current work-item version and decision comment. Approval creates one loan account and atomically books its schedule, GL projection and destination credit. Requires LOAN_ORIGINATION_DECIDE and a distinct Supervisor or Admin checker.",
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: { applicationReference: paymentReferenceSchema, workItemReference: paymentReferenceSchema, expectedVersion: z.number().int().positive(), decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().trim().min(10).max(500) },
    outputSchema: mcpWriteOutputSchema,
  }, async ({ applicationReference, ...body }) => writeApi("POST", ["loans", applicationReference, "decision"], body));

  server.registerTool("get_account_statement", {
    description: "Read a FutureBank account statement as CSV. Dates are inclusive, must use YYYY-MM-DD, and may span at most 366 days. If omitted, the API returns its default recent period.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      accountNumber: accountNumberSchema.describe("Ten digit account number."),
      from: z.string().date().optional().describe("Inclusive start date in YYYY-MM-DD format."),
      to: z.string().date().optional().describe("Inclusive end date in YYYY-MM-DD format."),
    },
  }, async ({ accountNumber, from, to }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const response = await routeApiRequest(new Request(
      `http://futurebank.internal/api/v1/accounts/${encodeURIComponent(accountNumber)}/statement?${params}`,
      { method: "GET" },
    ), ["accounts", accountNumber, "statement"]);
    if (!response.ok) {
      const body = await response.json() as { error?: { message?: string } };
      throw new Error(body.error?.message ?? "The FutureBank statement request failed.");
    }
    return { content: [{ type: "text", text: await response.text() }] };
  });

  return server;
}

const handler = createMcpHandler(createFutureBankMcpServer, {
  responseMode: "json",
  maxRequestBodySize: 64 * 1024,
});

function allowedHostnames(): string[] {
  const configured = [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.MCP_ALLOWED_HOSTS,
    "future-bank-demo.vercel.app",
  ].flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...localhostAllowedHostnames(), ...configured])];
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  const hostnames = allowedHostnames();
  const rejected = hostHeaderValidationResponse(request, hostnames)
    ?? originValidationResponse(request, [...localhostAllowedOrigins(), ...hostnames]);
  if (rejected) return rejected;
  return withApiAuth(request, () => handler.fetch(request));
}
