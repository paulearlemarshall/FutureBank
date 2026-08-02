"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { decidePaymentReversal, requestPaymentReversal } from "@/modules/services/payment-reversals";
import { failedAction, formText, invalidAction } from "./action-utils";

const requestSchema = z.object({ paymentReference: z.string().min(5), reason: z.string().min(10), idempotencyKey: z.string().min(8) });
const decisionSchema = z.object({ reversalReference: z.string().min(5), workItemReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(), comment: z.string().min(5), decision: z.enum(["APPROVE", "REJECT"]) });

export async function requestPaymentReversalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(["paymentReference", "reason", "idempotencyKey"].map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_REVERSAL_INITIATE");
    const result = await requestPaymentReversal(parsed.data, actor);
    return { ok: true, code: result.duplicate ? "REVERSAL_DUPLICATE" : "REVERSAL_REQUESTED", message: `Reversal ${result.reference} is pending independent approval.` };
  } catch (error) { return failedAction(error); }
}

export async function decidePaymentReversalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse(Object.fromEntries(["reversalReference", "workItemReference", "expectedVersion", "comment", "decision"].map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_REVERSAL_DECIDE");
    await decidePaymentReversal(parsed.data, actor);
    return { ok: true, code: parsed.data.decision === "APPROVE" ? "REVERSAL_BOOKED" : "REVERSAL_REJECTED", message: `Reversal ${parsed.data.reversalReference} was ${parsed.data.decision === "APPROVE" ? "booked exactly once" : "rejected"}.` };
  } catch (error) { return failedAction(error); }
}
