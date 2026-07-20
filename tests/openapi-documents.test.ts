import SwaggerParser from "@apidevtools/swagger-parser";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("OpenAPI customer document contract", () => {
  it("is valid OpenAPI 3.0.3 with read/write document paths", async () => {
    const specification = await SwaggerParser.validate(fileURLToPath(new URL("../openapi/futurebank.v1.json", import.meta.url))) as { openapi: string; paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, unknown> } };
    expect(specification.openapi).toBe("3.0.3");
    expect(specification.paths["/customers/{customerNumber}/documents"].get).toBeDefined();
    expect(specification.paths["/customers/{customerNumber}/documents/{slot}"].put).toBeDefined();
    expect(specification.paths["/customers/{customerNumber}/documents/{slot}"].delete).toBeDefined();
    expect(specification.paths["/customers/{customerNumber}/documents/{slot}/content"].get).toBeDefined();
    expect(specification.components.schemas.DocumentMeta).toBeDefined();
  });
});
