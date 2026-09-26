import "server-only";

import { errorResponse } from "@/lib/api/http";
import { routeApiRequest } from "@/lib/api/router";

export type McpApiResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

type ApiRouter = typeof routeApiRequest;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function failureFromPayload(payload: unknown, status: number): McpApiResult {
  const envelope = asRecord(payload);
  const error = asRecord(envelope?.error);
  const fieldErrors = asRecord(error?.fieldErrors);
  return {
    ok: false,
    status,
    error: {
      code: typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      message: typeof error?.message === "string" ? error.message : "The FutureBank request could not be completed.",
      ...(fieldErrors ? { fieldErrors: fieldErrors as Record<string, string[]> } : {}),
    },
  };
}

/** Calls only a caller-selected internal API route; it never accepts a URL or forwards client headers. */
export async function invokeMcpApi(
  method: string,
  segments: string[],
  body?: Record<string, unknown>,
  router: ApiRouter = routeApiRequest,
  headers?: Record<string, string>,
): Promise<McpApiResult> {
  const path = `/api/v1/${segments.map(encodeURIComponent).join("/")}`;
  const url = new URL(path, "http://futurebank.internal");
  const init: RequestInit = { method };
  if (body !== undefined || headers !== undefined) {
    init.headers = { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers };
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await router(new Request(url, init), segments);
  } catch (error) {
    response = errorResponse(error);
  }

  const payload = await parseJson(response);
  if (!response.ok) return failureFromPayload(payload, response.status);

  const envelope = asRecord(payload);
  const data = asRecord(envelope?.data);
  if (data) return { ok: true, status: response.status, data };
  return {
    ok: false,
    status: 500,
    error: { code: "INVALID_API_RESPONSE", message: "FutureBank returned an unexpected response." },
  };
}
