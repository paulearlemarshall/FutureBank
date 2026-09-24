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

const accountNumberSchema = z.string().trim().regex(/^\d{10}$/, "Account number must contain 10 digits.");
const customerNumberSchema = z.string().trim().regex(/^C\d{6}$/, "Customer number must use the C000000 format.");

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
  const server = new McpServer({ name: "futurebank-read", version: "1.0.0" });

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
