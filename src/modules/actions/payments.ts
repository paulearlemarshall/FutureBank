"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { approvePendingPayment, expirePendingPayments, rejectPendingPayment } from "@/modules/services/payments";
import { failedAction, formText, invalidAction } from "./action-utils";

const decisionSchema = z.object({
  paymentReference: z.string().min(5), workItemReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(), comment: z.string().min(5),
});

export async function approvePendingPaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse({ paymentReference: formText(formData, "paymentReference"), workItemReference: formText(formData, "workItemReference"), expectedVersion: formText(formData, "expectedVersion"), comment: formText(formData, "comment") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_DECIDE");
    await approvePendingPayment(parsed.data, actor);
    revalidatePath("/payments"); revalidatePath(`/payments/${parsed.data.paymentReference}`); revalidatePath("/accounts"); revalidatePath("/work-queue");
    return { ok: true, code: "PAYMENT_APPROVED", message: `Payment ${parsed.data.paymentReference} was approved and booked exactly once.` };
  } catch (error) { return failedAction(error); }
}

export async function rejectPendingPaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse({ paymentReference: formText(formData, "paymentReference"), workItemReference: formText(formData, "workItemReference"), expectedVersion: formText(formData, "expectedVersion"), comment: formText(formData, "comment") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_DECIDE");
    await rejectPendingPayment(parsed.data, actor);
    revalidatePath("/payments"); revalidatePath(`/payments/${parsed.data.paymentReference}`); revalidatePath("/accounts"); revalidatePath("/work-queue");
    return { ok: true, code: "PAYMENT_REJECTED", message: `Payment ${parsed.data.paymentReference} was rejected and its hold released.` };
  } catch (error) { return failedAction(error); }
}

export async function expirePendingPaymentsAction(): Promise<ActionState> {
  try {
    await requirePermission("PAYMENT_DECIDE");
    const count = await expirePendingPayments();
    revalidatePath("/payments"); revalidatePath("/accounts"); revalidatePath("/work-queue");
    return { ok: true, code: "PAYMENTS_EXPIRED", message: `${count} stale pending payment(s) expired and released.` };
  } catch (error) { return failedAction(error); }
}
