import "server-only";

import type { PaymentApprovalDetail, WorkItemPriority, WorkItemStatus, WorkItemType } from "@/modules/contracts";
import { initialActionState } from "@/modules/contracts";
import { requirePermission } from "@/lib/auth/session";
import { isDocumentSlot } from "@/modules/domain/document-policy";
import { BankingError } from "@/modules/services/errors";
import { deleteCustomerDocument, getCustomerDocumentContent, uploadCustomerDocument } from "@/modules/services/documents";
import {
  createBeneficiaryAction, createCustomerAction, openAccountAction, submitPaymentAction,
  updateAccountStatusAction, updateBeneficiaryAction, updateCustomerAction,
} from "@/modules/actions/banking";
import {
  applyRestrictionAction, decideKycCaseAction, liftRestrictionAction, openKycCaseAction,
  recordKycEvidenceAction, resolveScreeningAction, runScreeningAction, submitKycCaseAction,
  updateCddProfileAction, verifyKycEvidenceAction,
} from "@/modules/actions/kyc";
import {
  applyForOverdraftAction, decideOverdraftAction, requestOverdraftLimitChangeAction,
  resolveOverdraftAlertAction, setOverdraftStatusAction,
} from "@/modules/actions/overdrafts";
import { approvePendingPaymentAction, expirePendingPaymentsAction, rejectPendingPaymentAction } from "@/modules/actions/payments";
import { claimWorkItemAction, releaseWorkItemAction } from "@/modules/actions/workflow";
import {
  getAccount, getCustomer, getDashboardSummary, listAccounts, listAuditEvents, listBeneficiaries,
  listCustomers, listProducts,
} from "@/modules/queries";
import {
  getKycCase, getOverdraftFacility, getPaymentApproval, getWorkItem, listKycCases,
  listOverdraftFacilities, listPayments, listWorkQueue,
} from "@/modules/operations-queries";
import {
  ApiError, binaryStreamResponse, formDataFromObject, integerQuery, jsonResponse, readJsonObject, responseForAction,
} from "./http";

const paymentStatuses = new Set<PaymentApprovalDetail["status"]>(["BOOKED", "PENDING", "REJECTED", "EXPIRED"]);
const workStatuses = new Set<WorkItemStatus>(["OPEN", "ASSIGNED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"]);
const workTypes = new Set<WorkItemType>(["KYC_APPROVAL", "PAYMENT_APPROVAL", "OVERDRAFT_APPROVAL", "OVERDRAFT_CHANGE", "OVERDRAFT_ALERT"]);
const priorities = new Set<WorkItemPriority>(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

function notFound(resource = "API route"): never {
  throw new ApiError(404, "NOT_FOUND", `${resource} was not found.`);
}

async function documentWriteActor() {
  try { return await requirePermission("KYC_GATHER"); }
  catch { throw new ApiError(403, "FORBIDDEN", "The selected staff actor cannot maintain customer documents."); }
}

function documentFailure(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof BankingError) {
    const status = error.code === "CUSTOMER_NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
    throw new ApiError(status, error.code, error.message);
  }
  throw error;
}

function enumQuery<T extends string>(url: URL, name: string, values: Set<T>): T | undefined {
  const raw = url.searchParams.get(name);
  if (!raw) return undefined;
  if (!values.has(raw as T)) throw new ApiError(400, "INVALID_QUERY", `${name} has an unsupported value.`);
  return raw as T;
}

async function bodyForm(request: Request, additions: Record<string, unknown> = {}): Promise<FormData> {
  return formDataFromObject({ ...await readJsonObject(request), ...additions });
}

export async function routeApiRequest(request: Request, segments: string[]): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "GET") {
    if (!segments.length) return jsonResponse({
      name: "FutureBank API", version: "1.0.0", openapi: "/api/openapi.json",
      resources: ["customers", "customer-documents", "accounts", "beneficiaries", "payments", "kyc-cases", "overdrafts", "work-items", "products", "audit-events"],
    });
    if (segments[0] === "dashboard" && segments.length === 1) return jsonResponse(await getDashboardSummary());
    if (segments[0] === "customers" && segments.length === 1) return jsonResponse(await listCustomers({
      query: url.searchParams.get("query") ?? undefined,
      limit: integerQuery(url, "limit", 50), offset: integerQuery(url, "offset", 0),
    }));
    if (segments[0] === "customers" && segments.length === 2) {
      const item = await getCustomer(segments[1]);
      if (!item) notFound("Customer");
      return jsonResponse(item);
    }
    if (segments[0] === "customers" && segments.length === 3 && segments[2] === "documents") {
      const item = await getCustomer(segments[1]);
      if (!item) notFound("Customer");
      return jsonResponse(item.documents);
    }
    if (segments[0] === "customers" && segments.length === 4 && segments[2] === "documents") {
      if (!isDocumentSlot(segments[3])) throw new ApiError(400, "INVALID_SLOT", "Document slot must be PASSPORT or NATIONAL_ID.");
      const item = await getCustomer(segments[1]);
      if (!item) notFound("Customer");
      const document = item.documents.find((candidate) => candidate.slot === segments[3]);
      if (!document || "empty" in document) notFound("Customer document");
      return jsonResponse(document);
    }
    if (segments[0] === "customers" && segments.length === 5 && segments[2] === "documents" && segments[4] === "content") {
      if (!isDocumentSlot(segments[3])) throw new ApiError(400, "INVALID_SLOT", "Document slot must be PASSPORT or NATIONAL_ID.");
      const content = await getCustomerDocumentContent(segments[1], segments[3]);
      if (!content) notFound("Customer document");
      return binaryStreamResponse(content.stream, content.document.mimeType, content.document.filename);
    }
    if (segments[0] === "accounts" && segments.length === 1) return jsonResponse(await listAccounts({
      query: url.searchParams.get("query") ?? undefined,
      limit: integerQuery(url, "limit", 50), offset: integerQuery(url, "offset", 0),
    }));
    if (segments[0] === "accounts" && segments.length === 2) {
      const item = await getAccount(segments[1]);
      if (!item) notFound("Account");
      return jsonResponse(item);
    }
    if (segments[0] === "accounts" && segments.length === 3 && segments[2] === "transactions") {
      const item = await getAccount(segments[1]);
      if (!item) notFound("Account");
      return jsonResponse(item.transactions);
    }
    if (segments[0] === "products" && segments.length === 1) return jsonResponse(await listProducts());
    if (segments[0] === "beneficiaries" && segments.length === 1) return jsonResponse(await listBeneficiaries({
      customerNumber: url.searchParams.get("customerNumber") ?? undefined,
      limit: integerQuery(url, "limit", 50),
    }));
    if (segments[0] === "payments" && segments.length === 1) return jsonResponse(await listPayments({
      status: enumQuery(url, "status", paymentStatuses),
    }));
    if (segments[0] === "payments" && segments.length === 2) {
      const item = await getPaymentApproval(segments[1]);
      if (!item) notFound("Payment");
      return jsonResponse(item);
    }
    if (segments[0] === "kyc-cases" && segments.length === 1) return jsonResponse(await listKycCases());
    if (segments[0] === "kyc-cases" && segments.length === 2) {
      const item = await getKycCase(segments[1]);
      if (!item) notFound("KYC case");
      return jsonResponse(item);
    }
    if (segments[0] === "overdrafts" && segments.length === 1) return jsonResponse(await listOverdraftFacilities());
    if (segments[0] === "overdrafts" && segments.length === 2) {
      const item = await getOverdraftFacility(segments[1]);
      if (!item) notFound("Overdraft facility");
      return jsonResponse(item);
    }
    if (segments[0] === "work-items" && segments.length === 1) return jsonResponse(await listWorkQueue({
      status: enumQuery(url, "status", workStatuses), type: enumQuery(url, "type", workTypes),
      priority: enumQuery(url, "priority", priorities), assignedTo: url.searchParams.get("assignedTo") ?? undefined,
      overdueOnly: url.searchParams.get("overdueOnly") === "true",
    }));
    if (segments[0] === "work-items" && segments.length === 2) {
      const item = await getWorkItem(segments[1]);
      if (!item) notFound("Work item");
      return jsonResponse(item);
    }
    if (segments[0] === "audit-events" && segments.length === 1) return jsonResponse(await listAuditEvents({
      query: url.searchParams.get("query") ?? undefined,
      limit: integerQuery(url, "limit", 50), offset: integerQuery(url, "offset", 0),
    }));
    notFound();
  }

  if (method === "POST") {
    if (segments[0] === "customers" && segments.length === 1) return responseForAction(await createCustomerAction(initialActionState, await bodyForm(request)), 201);
    if (segments[0] === "accounts" && segments.length === 1) return responseForAction(await openAccountAction(initialActionState, await bodyForm(request)), 201);
    if (segments[0] === "beneficiaries" && segments.length === 1) return responseForAction(await createBeneficiaryAction(initialActionState, await bodyForm(request)), 201);
    if (segments[0] === "payments" && segments.length === 1) {
      const body = await readJsonObject(request);
      const idempotencyKey = request.headers.get("idempotency-key")?.trim() || body.idempotencyKey;
      return responseForAction(await submitPaymentAction(initialActionState, formDataFromObject({ ...body, idempotencyKey })));
    }
    if (segments[0] === "payments" && segments.length === 2 && segments[1] === "expiry-run") {
      return responseForAction(await expirePendingPaymentsAction());
    }
    if (segments[0] === "payments" && segments.length === 3 && segments[2] === "decision") {
      const body = await readJsonObject(request);
      if (body.decision !== "APPROVE" && body.decision !== "REJECT") {
        throw new ApiError(400, "VALIDATION_ERROR", "Payment decision must be APPROVE or REJECT.");
      }
      const form = formDataFromObject({ ...body, paymentReference: segments[1] });
      return responseForAction(body.decision === "REJECT"
        ? await rejectPendingPaymentAction(initialActionState, form)
        : await approvePendingPaymentAction(initialActionState, form));
    }
    if (segments[0] === "kyc-cases" && segments.length === 1) {
      const body = await readJsonObject(request);
      return responseForAction(await openKycCaseAction(initialActionState, formDataFromObject({ ...body, caseType: body.caseType ?? body.type })), 201);
    }
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "evidence") return responseForAction(await recordKycEvidenceAction(segments[1], initialActionState, await bodyForm(request)), 201);
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "evidence-verification") return responseForAction(await verifyKycEvidenceAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "screening") return responseForAction(await runScreeningAction(segments[1], initialActionState, new FormData()));
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "screening-resolution") return responseForAction(await resolveScreeningAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "submission") return responseForAction(await submitKycCaseAction(segments[1], initialActionState, new FormData()));
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "decision") return responseForAction(await decideKycCaseAction(initialActionState, await bodyForm(request, { entityReference: segments[1] })));
    if (segments[0] === "customers" && segments.length === 3 && segments[2] === "restrictions") {
      const body = await readJsonObject(request);
      return responseForAction(await applyRestrictionAction(segments[1], initialActionState, formDataFromObject({ ...body, restrictionType: body.restrictionType ?? body.type })), 201);
    }
    if (segments[0] === "customers" && segments.length === 5 && segments[2] === "restrictions" && segments[4] === "lift") return responseForAction(await liftRestrictionAction(segments[1], initialActionState, await bodyForm(request, { restrictionReference: segments[3] })));
    if (segments[0] === "overdrafts" && segments.length === 1) return responseForAction(await applyForOverdraftAction(initialActionState, await bodyForm(request)), 201);
    if (segments[0] === "overdrafts" && segments.length === 3 && segments[2] === "limit-changes") return responseForAction(await requestOverdraftLimitChangeAction(segments[1], initialActionState, await bodyForm(request)), 202);
    if (segments[0] === "overdrafts" && segments.length === 3 && segments[2] === "decision") return responseForAction(await decideOverdraftAction(initialActionState, await bodyForm(request, { entityReference: segments[1] })));
    if (segments[0] === "overdrafts" && segments.length === 3 && segments[2] === "status") return responseForAction(await setOverdraftStatusAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "overdraft-alerts" && segments.length === 3 && segments[2] === "resolution") return responseForAction(await resolveOverdraftAlertAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "work-items" && segments.length === 3 && segments[2] === "claim") return responseForAction(await claimWorkItemAction(initialActionState, await bodyForm(request, { workItemReference: segments[1] })));
    if (segments[0] === "work-items" && segments.length === 3 && segments[2] === "release") return responseForAction(await releaseWorkItemAction(initialActionState, await bodyForm(request, { workItemReference: segments[1] })));
    notFound();
  }

  if (method === "PATCH") {
    if (segments[0] === "customers" && segments.length === 2) return responseForAction(await updateCustomerAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "accounts" && segments.length === 3 && segments[2] === "status") return responseForAction(await updateAccountStatusAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "beneficiaries" && segments.length === 2) return responseForAction(await updateBeneficiaryAction(segments[1], initialActionState, await bodyForm(request)));
    if (segments[0] === "kyc-cases" && segments.length === 3 && segments[2] === "cdd") return responseForAction(await updateCddProfileAction(segments[1], initialActionState, await bodyForm(request)));
    notFound();
  }

  if (method === "PUT" && segments[0] === "customers" && segments.length === 4 && segments[2] === "documents") {
    if (!isDocumentSlot(segments[3])) throw new ApiError(400, "INVALID_SLOT", "Document slot must be PASSPORT or NATIONAL_ID.");
    try {
      const actor = await documentWriteActor();
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError(400, "VALIDATION_ERROR", "A multipart file field named file is required.", { file: ["Choose a document file"] });
      const result = await uploadCustomerDocument({ customerNumber: segments[1], slot: segments[3], file }, actor);
      return jsonResponse(result.document, { status: result.created ? 201 : 200 });
    } catch (error) { documentFailure(error); }
  }

  if (method === "DELETE" && segments[0] === "customers" && segments.length === 4 && segments[2] === "documents") {
    if (!isDocumentSlot(segments[3])) throw new ApiError(400, "INVALID_SLOT", "Document slot must be PASSPORT or NATIONAL_ID.");
    try {
      const actor = await documentWriteActor();
      return jsonResponse({ deleted: await deleteCustomerDocument({ customerNumber: segments[1], slot: segments[3] }, actor) });
    } catch (error) { documentFailure(error); }
  }

  throw new ApiError(405, "METHOD_NOT_ALLOWED", "This API method is not supported.");
}
