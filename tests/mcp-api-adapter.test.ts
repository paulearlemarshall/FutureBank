import { beforeEach, describe, expect, it, vi } from "vitest";

const { errorResponse, routeApiRequest } = vi.hoisted(() => ({
  errorResponse: vi.fn<(error: unknown) => Response>(),
  routeApiRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/http", () => ({ errorResponse }));
vi.mock("@/lib/api/router", () => ({ routeApiRequest }));

import { invokeMcpApi } from "@/lib/mcp/api-adapter";

describe("invokeMcpApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the selected internal route and returns the API data envelope", async () => {
    routeApiRequest.mockResolvedValue(Response.json({
      data: { ok: true, code: "CDD_UPDATED", message: "CDD saved." },
    }, { status: 200 }));

    const result = await invokeMcpApi("PATCH", ["kyc-cases", "KYC/1", "cdd"], { sourceOfFunds: "Fictional salary" });

    expect(routeApiRequest).toHaveBeenCalledOnce();
    const [request, segments] = routeApiRequest.mock.calls[0] as [Request, string[]];
    expect(request.url).toBe("http://futurebank.internal/api/v1/kyc-cases/KYC%2F1/cdd");
    expect(request.method).toBe("PATCH");
    expect(request.headers.get("content-type")).toContain("application/json");
    await expect(request.json()).resolves.toEqual({ sourceOfFunds: "Fictional salary" });
    expect(segments).toEqual(["kyc-cases", "KYC/1", "cdd"]);
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { ok: true, code: "CDD_UPDATED", message: "CDD saved." },
    });
  });

  it("preserves safe API codes, messages and field errors", async () => {
    routeApiRequest.mockResolvedValue(Response.json({
      error: { code: "VALIDATION_ERROR", message: "The profile is invalid.", fieldErrors: { sourceOfFunds: ["Required."] } },
    }, { status: 400 }));

    await expect(invokeMcpApi("PATCH", ["kyc-cases", "KYC-12345", "cdd"], {})).resolves.toEqual({
      ok: false,
      status: 400,
      error: { code: "VALIDATION_ERROR", message: "The profile is invalid.", fieldErrors: { sourceOfFunds: ["Required."] } },
    });
  });

  it("uses the API safe error boundary for thrown failures", async () => {
    routeApiRequest.mockRejectedValue(new Error("private database details"));
    errorResponse.mockReturnValue(Response.json({
      error: { code: "INTERNAL_ERROR", message: "The API request could not be completed." },
    }, { status: 500 }));

    await expect(invokeMcpApi("POST", ["kyc-cases", "KYC-12345", "screening"], {})).resolves.toEqual({
      ok: false,
      status: 500,
      error: { code: "INTERNAL_ERROR", message: "The API request could not be completed." },
    });
    expect(errorResponse).toHaveBeenCalledWith(expect.objectContaining({ message: "private database details" }));
  });

  it("rejects an unexpected success payload instead of returning an invented result", async () => {
    routeApiRequest.mockResolvedValue(Response.json({ data: ["unexpected"] }));

    await expect(invokeMcpApi("GET", ["kyc-cases"])).resolves.toEqual({
      ok: false,
      status: 500,
      error: { code: "INVALID_API_RESPONSE", message: "FutureBank returned an unexpected response." },
    });
  });
});
