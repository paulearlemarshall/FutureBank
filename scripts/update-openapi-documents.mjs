import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../openapi/futurebank.v1.json", import.meta.url);
const document = JSON.parse(await readFile(file, "utf8"));
if (!document.tags.some((tag) => tag.name === "Documents")) document.tags.splice(2, 0, { name: "Documents", description: "Private Passport and National ID files attached to customer records." });

const customer = { $ref: "#/components/parameters/CustomerNumber" };
const slot = { $ref: "#/components/parameters/DocumentSlot" };
const errors = { "400": { $ref: "#/components/responses/Error" }, "401": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" }, "404": { $ref: "#/components/responses/Error" } };
document.paths["/customers/{customerNumber}/documents"] = { get: { tags: ["Documents"], summary: "List both customer document slots", parameters: [customer], responses: { "200": { $ref: "#/components/responses/Success" }, ...errors } } };
document.paths["/customers/{customerNumber}/documents/{slot}"] = {
  get: { tags: ["Documents"], summary: "Get document-slot metadata", parameters: [customer, slot], responses: { "200": { $ref: "#/components/responses/Success" }, ...errors } },
  put: { tags: ["Documents"], summary: "Upload or replace a customer document", description: "Requires a staff actor with KYC_GATHER. Maximum file size is 4 MB.", parameters: [customer, slot, { $ref: "#/components/parameters/StaffActor" }], requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } }, responses: { "200": { description: "Existing slot replaced", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/DocumentMeta" } } } } } }, "201": { description: "New slot created", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/DocumentMeta" } } } } } }, ...errors } },
  delete: { tags: ["Documents"], summary: "Delete a customer document", description: "Requires a staff actor with KYC_GATHER.", parameters: [customer, slot, { $ref: "#/components/parameters/StaffActor" }], responses: { "200": { $ref: "#/components/responses/Success" }, ...errors } },
};
document.paths["/customers/{customerNumber}/documents/{slot}/content"] = { get: { tags: ["Documents"], summary: "Stream private document content", description: "Returns raw authenticated file bytes rather than the standard JSON envelope.", parameters: [customer, slot], responses: { "200": { description: "Document content", headers: { "Content-Disposition": { schema: { type: "string" } } }, content: { "image/jpeg": { schema: { type: "string", format: "binary" } }, "image/png": { schema: { type: "string", format: "binary" } }, "application/pdf": { schema: { type: "string", format: "binary" } } } }, ...errors } } };

document.components.parameters.DocumentSlot = { name: "slot", in: "path", required: true, schema: { $ref: "#/components/schemas/DocumentSlot" } };
document.components.schemas.DocumentSlot = { type: "string", enum: ["PASSPORT", "NATIONAL_ID"] };
document.components.schemas.DocumentMeta = { type: "object", required: ["slot", "filename", "mimeType", "sizeBytes", "uploadedBy", "uploadedAt"], additionalProperties: false, properties: { slot: { $ref: "#/components/schemas/DocumentSlot" }, filename: { type: "string" }, mimeType: { type: "string", enum: ["image/jpeg", "image/png", "application/pdf"] }, sizeBytes: { type: "integer", minimum: 1, maximum: 4194304 }, uploadedBy: { type: "string" }, uploadedAt: { type: "string", format: "date-time" } } };
document.components.schemas.EmptyDocumentSlot = { type: "object", required: ["slot", "empty"], additionalProperties: false, properties: { slot: { $ref: "#/components/schemas/DocumentSlot" }, empty: { type: "boolean", enum: [true] } } };
document.components.schemas.CustomerDocumentSlot = { oneOf: [{ $ref: "#/components/schemas/DocumentMeta" }, { $ref: "#/components/schemas/EmptyDocumentSlot" }] };

await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
