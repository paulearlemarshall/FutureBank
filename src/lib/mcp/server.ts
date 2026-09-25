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
  return { structuredContent: result, content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

async function writeApi(method: string, segments: string[], body?: Record<string, unknown>) {
  return mcpWriteResult(await invokeMcpApi(method, segments, body));
}

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

  server.registerTool("get_account", {
    description: "Read a FutureBank account, including its balance and account details.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { accountNumber: accountNumberSchema.describe("Ten digit account number.") },
  }, async ({ accountNumber }) => {
    const data = await readApi(["accounts", accountNumber]);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

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
