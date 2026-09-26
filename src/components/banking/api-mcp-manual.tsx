import openApi from "../../../openapi/futurebank.v1.json";
import { ApiMcpManualClient, type ApiOperation } from "@/components/banking/api-mcp-manual-client";

type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
};

const apiOperations: ApiOperation[] = Object.entries(openApi.paths).flatMap(([path, pathItem]) =>
  Object.entries(pathItem as Record<string, unknown>)
    .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method.toLowerCase()))
    .map(([method, value]) => {
      const operation = value as OpenApiOperation;
      return {
        method: method.toUpperCase(),
        path,
        group: operation.tags?.[0] ?? "Other",
        summary: operation.summary ?? `${method.toUpperCase()} ${path}`,
        description: operation.description ?? operation.summary ?? "See the OpenAPI schema for request and response details.",
        parameters: (operation.parameters ?? []).map((parameter) => `${parameter.name}${parameter.required ? " (required)" : ""}`),
      };
    }),
);

export function ApiMcpManual() {
  return <ApiMcpManualClient apiOperations={apiOperations} />;
}
