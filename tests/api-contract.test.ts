import { describe, expect, it } from "vitest";
import specification from "../openapi/futurebank.v1.json";
import { apiKeyMatches } from "@/lib/api/api-key";

describe("FutureBank API contract", () => {
  it("uses constant-time compatible exact API-key comparison semantics", () => {
    expect(apiKeyMatches("demo-secret", "demo-secret")).toBe(true);
    expect(apiKeyMatches("demo-secrex", "demo-secret")).toBe(false);
    expect(apiKeyMatches("short", "demo-secret")).toBe(false);
    expect(apiKeyMatches(null, "demo-secret")).toBe(false);
    expect(apiKeyMatches("demo-secret", undefined)).toBe(false);
  });

  it("publishes an OpenAPI 3 document with API-key security and read/write operations", () => {
    expect(specification.openapi).toMatch(/^3\.0\./);
    expect(specification.components.securitySchemes.ApiKeyAuth).toEqual(expect.objectContaining({
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
    }));
    expect(specification.paths["/customers"].get).toBeDefined();
    expect(specification.paths["/customers"].post).toBeDefined();
    expect(specification.paths["/payments"].post).toBeDefined();
    expect(specification.paths["/kyc-cases/{caseReference}/decision"].post).toBeDefined();
    expect(specification.paths["/overdrafts/{facilityReference}/decision"].post).toBeDefined();
  });

  it("declares every implemented API router resource", () => {
    const paths = Object.keys(specification.paths);
    for (const prefix of ["/customers", "/accounts", "/beneficiaries", "/payments", "/kyc-cases", "/overdrafts", "/work-items", "/audit-events"]) {
      expect(paths.some((path) => path === prefix || path.startsWith(`${prefix}/`)), prefix).toBe(true);
    }
  });
});
