"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { cancelDirectDebitMandate, createDirectDebitMandate, submitDirectDebitCollection } from "@/modules/services/direct-debits";
import { failedAction, formText, invalidAction, optionalFormText } from "./action-utils";

const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const mandateSchema = z.object({ sourceAccountNumber: z.string().min(5), creditorBeneficiaryId: z.string().uuid(), creditorMandateReference: z.string().min(3).max(80), maximumSingleAmount: money, validFrom: date, validTo: z.union([date, z.null()]) });
export async function createDirectDebitMandateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = mandateSchema.safeParse({ sourceAccountNumber: formText(formData, "sourceAccountNumber"), creditorBeneficiaryId: formText(formData, "creditorBeneficiaryId"), creditorMandateReference: formText(formData, "creditorMandateReference"), maximumSingleAmount: formText(formData, "maximumSingleAmount"), validFrom: formText(formData, "validFrom"), validTo: optionalFormText(formData, "validTo") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("DIRECT_DEBIT_MAINTAIN");
    const reference = await createDirectDebitMandate(parsed.data, actor);
    revalidatePath("/direct-debits");
    return { ok: true, code: "DIRECT_DEBIT_MANDATE_CREATED", message: `Direct debit mandate ${reference} was created.` };
  } catch (error) { return failedAction(error); }
}

const cancelSchema = z.object({ reference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(), reason: z.string().min(5).max(300) });
export async function cancelDirectDebitMandateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({ reference: formText(formData, "reference"), expectedVersion: formText(formData, "expectedVersion"), reason: formText(formData, "reason") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("DIRECT_DEBIT_MAINTAIN");
    await cancelDirectDebitMandate(parsed.data, actor);
    revalidatePath("/direct-debits"); revalidatePath(`/direct-debits/${parsed.data.reference}`);
    return { ok: true, code: "DIRECT_DEBIT_MANDATE_CANCELLED", message: `Direct debit mandate ${parsed.data.reference} was cancelled.` };
  } catch (error) { return failedAction(error); }
}

const collectionSchema = z.object({ mandateReference: z.string().min(5), amount: money, collectionDate: date, idempotencyKey: z.string().min(8).max(100) });
export async function submitDirectDebitCollectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = collectionSchema.safeParse({ mandateReference: formText(formData, "mandateReference"), amount: formText(formData, "amount"), collectionDate: formText(formData, "collectionDate"), idempotencyKey: formText(formData, "idempotencyKey") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("DIRECT_DEBIT_COLLECT");
    const result = await submitDirectDebitCollection(parsed.data, actor);
    revalidatePath("/direct-debits"); revalidatePath(`/direct-debits/${parsed.data.mandateReference}`); revalidatePath("/accounts"); revalidatePath("/payments"); revalidatePath("/work-queue");
    return { ok: true, code: `DIRECT_DEBIT_COLLECTION_${result.status}`, message: result.status === "REJECTED" ? `Collection ${result.reference} was rejected: ${result.message ?? result.code}.` : `Collection ${result.reference} is ${result.status.toLowerCase()}${result.duplicate ? " (existing idempotent result)" : ""}.` };
  } catch (error) { return failedAction(error); }
}
