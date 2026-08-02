import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staffProfiles, user as authUsers } from "@/db/schema";
import { auth } from "@/lib/auth";
import { runWithApiUser } from "@/lib/auth/api-context";
import type { ActionState, SessionUser } from "@/modules/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

function suppliedApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return request.headers.get("x-api-key")?.trim() || null;
}

async function authenticateApiRequest(request: Request): Promise<SessionUser> {
  if (request.headers.has("x-staff-username")) {
    throw new ApiError(400, "ACTOR_HEADER_NOT_SUPPORTED", "API keys are bound to one staff actor; X-Staff-Username is not supported.");
  }
  const key = suppliedApiKey(request);
  if (!key) throw new ApiError(401, "INVALID_API_KEY", "A valid FutureBank actor API key is required.");
  const verified = await auth.api.verifyApiKey({ body: { key } });
  if (!verified.valid || !verified.key) {
    throw new ApiError(401, "INVALID_API_KEY", "A valid FutureBank actor API key is required.");
  }

  const [row] = await db.select({
    id: authUsers.id,
    username: authUsers.username,
    email: authUsers.email,
    name: authUsers.name,
    role: staffProfiles.role,
  }).from(authUsers)
    .innerJoin(staffProfiles, and(eq(staffProfiles.userId, authUsers.id), eq(staffProfiles.active, true)))
    .where(eq(authUsers.id, verified.key.referenceId))
    .limit(1);
  if (!row) throw new ApiError(403, "INACTIVE_API_ACTOR", "The API key owner is not an active staff actor.");
  return { id: row.id, username: row.username ?? row.email, name: row.name, role: row.role };
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json({ data }, { ...init, headers });
}

export function safeContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll("\\", "_").replaceAll('"', "'");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function binaryStreamResponse(
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  filename: string,
  metadata: { sizeBytes?: number; etag?: string } = {},
): Response {
  const headers = new Headers({
    "Content-Type": mimeType,
    "Content-Disposition": safeContentDisposition(filename),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (metadata.sizeBytes !== undefined) headers.set("Content-Length", String(metadata.sizeBytes));
  if (metadata.etag) headers.set("ETag", metadata.etag);
  return new Response(stream, { headers });
}

export function errorResponse(error: unknown): Response {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "INTERNAL_ERROR", "The API request could not be completed.");
  return Response.json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.fieldErrors ? { fieldErrors: apiError.fieldErrors } : {}),
    },
  }, {
    status: apiError.status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function withApiAuth(
  request: Request,
  operation: (actor: SessionUser) => Promise<Response>,
): Promise<Response> {
  try {
    const actor = await authenticateApiRequest(request);
    return await runWithApiUser(actor, () => operation(actor));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ApiError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function formDataFromObject(value: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (item === null) formData.set(key, "");
    else if (Array.isArray(item)) formData.set(key, item.join(","));
    else if (typeof item === "object") formData.set(key, JSON.stringify(item));
    else formData.set(key, String(item));
  }
  return formData;
}

export function responseForAction(state: ActionState, successStatus = 200): Response {
  if (state.ok) return jsonResponse(state, { status: successStatus });
  const status = state.code === "VALIDATION_ERROR" || state.code === "CONFIRMATION_REQUIRED" ? 400
    : state.code === "UNAUTHENTICATED" ? 401
      : state.code === "FORBIDDEN" ? 403
        : state.code.endsWith("_NOT_FOUND") || state.code === "EVIDENCE_NOT_FOUND" ? 404
          : 409;
  return errorResponse(new ApiError(status, state.code, state.message, state.fieldErrors));
}

export function integerQuery(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new ApiError(400, "INVALID_QUERY", `${name} must be a non-negative integer.`);
  return value;
}
