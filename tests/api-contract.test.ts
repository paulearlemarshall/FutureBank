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
    expect(specification.paths["/accounts/{accountNumber}/statement"].get.responses["200"].content["text/csv"]).toBeDefined();
    expect(specification.paths["/payments"].post).toBeDefined();
    expect(specification.paths["/payments/{paymentReference}/reversals"].post).toBeDefined();
    expect(specification.paths["/payment-reversals/{reversalReference}/decision"].post).toBeDefined();
    expect(specification.paths["/payment-instructions"].get).toBeDefined();
    expect(specification.paths["/payment-instructions"].post).toBeDefined();
    expect(specification.paths["/payment-instructions/{instructionReference}/cancellation"].post).toBeDefined();
    expect(specification.paths["/payment-instructions/processing-runs"].post).toBeDefined();
    expect(specification.paths["/direct-debits"].post).toBeDefined();
    expect(specification.paths["/direct-debits/{mandateReference}/collections"].post).toBeDefined();
    expect(specification.paths["/end-of-day-runs"].get).toBeDefined();
    expect(specification.paths["/end-of-day-runs"].post).toBeDefined();
    expect(specification.paths["/end-of-day-runs/{runReference}"].get).toBeDefined();
    expect(specification.paths["/kyc-cases/{caseReference}/decision"].post).toBeDefined();
    expect(specification.paths["/overdrafts/{facilityReference}/decision"].post).toBeDefined();
  });

  it("declares every implemented API router resource", () => {
    const paths = Object.keys(specification.paths);
    for (const prefix of ["/customers", "/accounts", "/beneficiaries", "/payments", "/payment-instructions", "/payment-reversals", "/direct-debits", "/end-of-day-runs", "/kyc-cases", "/overdrafts", "/work-items", "/audit-events"]) {
      expect(paths.some((path) => path === prefix || path.startsWith(`${prefix}/`)), prefix).toBe(true);
    }
  });

  it("documents customer party variants and every accepted address and identity field", () => {
    const schemas = specification.components.schemas;
    const customerWrite = schemas.CustomerWrite as {
      oneOf: Array<{ $ref: string }>;
      discriminator: { propertyName: string; mapping: Record<string, string> };
    };
    const base = schemas.CustomerWriteBase as {
      required: string[];
      properties: Record<string, unknown>;
      anyOf: Array<{ required?: string[]; properties?: Record<string, unknown> }>;
    };
    const retail = schemas.RetailCustomerWrite.allOf[1] as {
      required: string[];
      properties: Record<string, { enum?: string[] }>;
    };
    const sme = schemas.SmeCustomerWrite.allOf[1] as {
      required: string[];
      properties: Record<string, { enum?: string[] }>;
    };

    expect(customerWrite.oneOf.map((item) => item.$ref)).toEqual([
      "#/components/schemas/RetailCustomerWrite",
      "#/components/schemas/SmeCustomerWrite",
    ]);
    expect(customerWrite.discriminator).toEqual(expect.objectContaining({ propertyName: "partyType" }));
    expect(retail.required).toEqual(expect.arrayContaining(["partyType", "givenName", "familyName", "dateOfBirth"]));
    expect(retail.properties.partyType.enum).toEqual(["RETAIL"]);
    expect(sme.required).toEqual(expect.arrayContaining(["partyType", "legalName", "registrationNumber"]));
    expect(sme.properties.partyType.enum).toEqual(["SME"]);

    expect(base.required).not.toContain("country");
    expect(base.properties).toEqual(expect.objectContaining({
      country: expect.any(Object),
      identityDocumentType: expect.any(Object),
      identityDocumentNumber: expect.any(Object),
      identityIssuingCountry: expect.any(Object),
      identityIssuedAt: expect.any(Object),
      identityExpiresAt: expect.any(Object),
    }));
    expect(base.anyOf.some((variant) => variant.required?.includes("identityExpiresAt"))).toBe(true);
  });
});
