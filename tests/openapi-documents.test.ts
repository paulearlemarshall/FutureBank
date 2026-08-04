import SwaggerParser from "@apidevtools/swagger-parser";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import futurebankSpec from "../openapi/futurebank.v1.json";

describe("OpenAPI customer document contract", () => {
  it("is valid, self-describing OpenAPI 3.0.3", async () => {
    const specification = await SwaggerParser.validate(fileURLToPath(new URL("../openapi/futurebank.v1.json", import.meta.url))) as {
      openapi: string;
      security: Array<Record<string, unknown>>;
      paths: Record<string, Record<string, { operationId?: string; description?: string; responses?: Record<string, unknown> }>>;
      components: { schemas: Record<string, { enum?: string[] }>; securitySchemes: Record<string, unknown> };
    };
    expect(specification.openapi).toBe("3.0.3");
    expect(specification.components.securitySchemes.ApiKeyAuth).toBeDefined();
    expect(specification.components.securitySchemes.BearerAuth).toBeDefined();
    expect(specification.security).toEqual([{ ApiKeyAuth: [] }, { BearerAuth: [] }]);

    const operationIds = new Set<string>();
    for (const pathItem of Object.values(specification.paths)) {
      for (const method of ["get", "post", "put", "patch", "delete"]) {
        const operation = pathItem[method];
        if (!operation) continue;
        expect(operation.operationId, `${method} operationId`).toBeTruthy();
        expect(operation.description, `${operation.operationId} description`).toBeTruthy();
        expect(operationIds.has(operation.operationId!), `duplicate ${operation.operationId}`).toBe(false);
        operationIds.add(operation.operationId!);
        expect(operation.responses?.["401"], `${operation.operationId} 401`).toBeDefined();
        expect(operation.responses?.["403"], `${operation.operationId} 403`).toBeDefined();
      }
    }

    expect(specification.paths["/customers/{customerNumber}/documents"].get).toBeDefined();
    expect(specification.paths["/customers/{customerNumber}/documents/{slot}"].put).toBeDefined();
    expect(specification.paths["/customers/{customerNumber}/documents/{slot}"].delete).toBeDefined();
    expect(specification.paths["/customers/{customerNumber}/documents/{slot}/content"].get).toBeDefined();
    expect(specification.components.schemas.DocumentMeta).toBeDefined();
    expect(specification.components.schemas.DocumentSlot.enum).toEqual(["PASSPORT", "NATIONAL_ID"]);
    expect(operationIds.size).toBe(88);
  });

  it("types every 200 JSON data payload concretely so Blue Prism can expose each operation", () => {
    const freeform: string[] = [];
    for (const [path, item] of Object.entries(futurebankSpec.paths)) {
      for (const operation of Object.values(item)) {
        const ok = operation.responses?.["200"];
        const schema = ok?.content?.["application/json"]?.schema;
        if (!schema) continue;
        const data = schema.properties?.data ?? schema;
        if (data.type === "object" && !data.properties && !data.$ref) {
          freeform.push(`${path}`);
        }
      }
    }
    expect(freeform, "operations whose data is an anonymous free-form object are dropped by the Blue Prism importer").toEqual([]);

    const dashboardGet = futurebankSpec.paths["/dashboard"].get;
    expect(dashboardGet.operationId).toBe("getDashboard");
    const dashboardData = dashboardGet.responses["200"].content["application/json"].schema.properties.data;
    expect(dashboardData).toEqual({ $ref: "#/components/schemas/DashboardSummary" });

    const summary = futurebankSpec.components.schemas.DashboardSummary;
    expect(summary.required).toEqual([
      "customers", "activeAccounts", "totalDeposits", "pendingKycReviews", "paymentsToday",
      "openWorkItems", "pendingPayments", "overdraftExposure", "repeatUseAlerts", "recentActivity",
    ]);
    expect(summary.properties.totalDeposits).toEqual({ $ref: "#/components/schemas/Money" });
    expect(summary.properties.overdraftExposure).toEqual({ $ref: "#/components/schemas/Money" });
    expect(summary.properties.recentActivity.items).toEqual({ $ref: "#/components/schemas/AuditEvent" });
  });
});
