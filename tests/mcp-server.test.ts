import { beforeEach, describe, expect, it, vi } from "vitest";

const { errorResponse, routeApiRequest, withApiAuth } = vi.hoisted(() => ({
  errorResponse: vi.fn<(error: unknown) => Response>(),
  routeApiRequest: vi.fn(),
  withApiAuth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/http", () => ({ errorResponse, withApiAuth }));
vi.mock("@/lib/api/router", () => ({ routeApiRequest }));

import { handleMcpRequest } from "@/lib/mcp/server";

const protocolVersion = "2025-11-25";

async function mcpRequest(body: Record<string, unknown>): Promise<Response> {
  return handleMcpRequest(new Request("https://future-bank-demo.vercel.app/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": protocolVersion,
      Host: "future-bank-demo.vercel.app",
    },
    body: JSON.stringify(body),
  }));
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) throw new Error(`MCP SSE response had no data event: ${text}`);
    return JSON.parse(data) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

describe("FutureBank MCP KYC slice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withApiAuth.mockImplementation(async (_request: Request, operation: () => Promise<Response>) => operation());
    routeApiRequest.mockImplementation(async (request: Request, segments: string[]) => {
      if (request.method === "GET" && segments.join("/") === "kyc-cases") {
        return Response.json({ data: [{ reference: "KYC-DEMO-1", status: "IN_PROGRESS" }] });
      }
      if (request.method === "POST" && segments.join("/") === "kyc-cases") {
        return Response.json({ data: {
          ok: true,
          code: "KYC_CASE_OPENED",
          message: "KYC case KYC-DEMO-2 was opened.",
          result: { caseReference: "KYC-DEMO-2" },
        } }, { status: 201 });
      }
      return Response.json({ error: { code: "NOT_FOUND", message: "The test route was not found." } }, { status: 404 });
    });
  });

  it("advertises the case reads and first-slice write tools", async () => {
    await mcpRequest({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion, capabilities: {}, clientInfo: { name: "mcp-server-test", version: "1" } },
    });
    const response = await mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const payload = await responsePayload(response) as { result?: { tools?: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> } };
    const tools = payload.result?.tools ?? [];
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(["list_kyc_cases", "get_kyc_case", "open_kyc_case", "update_kyc_cdd", "record_kyc_evidence", "update_kyc_evidence", "run_kyc_screening"]
      .every((name) => byName.has(name))).toBe(true);
    expect(byName.get("record_kyc_evidence")?.annotations?.readOnlyHint).toBe(false);
  });

  it("returns the structured API result from a registered write tool", async () => {
    await mcpRequest({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion, capabilities: {}, clientInfo: { name: "mcp-server-test", version: "1" } },
    });
    const response = await mcpRequest({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "open_kyc_case", arguments: { customerNumber: "C000001", type: "PERIODIC_REVIEW" } },
    });
    const payload = await responsePayload(response) as { result?: { isError?: boolean; structuredContent?: unknown } };

    expect(payload.result?.isError).toBeFalsy();
    expect(payload.result?.structuredContent).toEqual({
      ok: true,
      status: 201,
      data: {
        ok: true,
        code: "KYC_CASE_OPENED",
        message: "KYC case KYC-DEMO-2 was opened.",
        result: { caseReference: "KYC-DEMO-2" },
      },
    });
    expect(routeApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
      ["kyc-cases"],
    );
  });
});
