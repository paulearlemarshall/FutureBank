"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import {
  cancelPaymentInstruction,
  createPaymentInstruction,
  runDuePaymentInstructions,
} from "@/modules/services/payment-instructions";
import { failedAction, formText, invalidAction, optionalFormText } from "./action-utils";

const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const createSchema = z.object({
  type: z.enum(["SCHEDULED", "STANDING_ORDER"]),
  paymentType: z.enum(["INTERNAL", "EXTERNAL"]),
  sourceAccountNumber: z.string().min(5),
  destinationAccountNumber: z.string().nullable(),
  beneficiaryId: z.string().nullable(),
  amount: money,
  description: z.string().min(2).max(140),
  frequency: z.enum(["ONCE", "WEEKLY", "MONTHLY"]),
  startDate: isoDate,
  endDate: z.union([isoDate, z.null()]),
}).superRefine((value, context) => {
  if (value.paymentType === "INTERNAL" && !value.destinationAccountNumber) context.addIssue({ code: "custom", path: ["destinationAccountNumber"], message: "Select a destination account" });
  if (value.paymentType === "EXTERNAL" && !value.beneficiaryId) context.addIssue({ code: "custom", path: ["beneficiaryId"], message: "Select a beneficiary" });
});

export async function createPaymentInstructionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    type: formText(formData, "type"),
    paymentType: formText(formData, "paymentType"),
    sourceAccountNumber: formText(formData, "sourceAccountNumber"),
    destinationAccountNumber: optionalFormText(formData, "destinationAccountNumber"),
    beneficiaryId: optionalFormText(formData, "beneficiaryId"),
    amount: formText(formData, "amount"),
    description: formText(formData, "description"),
    frequency: formText(formData, "frequency"),
    startDate: formText(formData, "startDate"),
    endDate: optionalFormText(formData, "endDate"),
  });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_INSTRUCTION_MAINTAIN");
    const reference = await createPaymentInstruction(parsed.data, actor);
    revalidatePath("/payments");
    revalidatePath(`/payment-instructions/${reference}`);
    return { ok: true, code: "PAYMENT_INSTRUCTION_CREATED", message: `Payment instruction ${reference} was created without reserving funds.` };
  } catch (error) { return failedAction(error); }
}

const cancellationSchema = z.object({
  reference: z.string().min(5),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().min(5).max(300),
});

export async function cancelPaymentInstructionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cancellationSchema.safeParse({
    reference: formText(formData, "reference"),
    expectedVersion: formText(formData, "expectedVersion"),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_INSTRUCTION_MAINTAIN");
    await cancelPaymentInstruction(parsed.data, actor);
    revalidatePath("/payments");
    revalidatePath(`/payment-instructions/${parsed.data.reference}`);
    return { ok: true, code: "PAYMENT_INSTRUCTION_CANCELLED", message: `Payment instruction ${parsed.data.reference} was cancelled.` };
  } catch (error) { return failedAction(error); }
}

const runSchema = z.object({ businessDate: isoDate });

export async function runPaymentInstructionsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = runSchema.safeParse({ businessDate: formText(formData, "businessDate") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("PAYMENT_SCHEDULE_EXECUTE");
    const result = await runDuePaymentInstructions(parsed.data, actor);
    revalidatePath("/payments");
    revalidatePath("/accounts");
    revalidatePath("/work-queue");
    return {
      ok: true,
      code: "PAYMENT_INSTRUCTIONS_PROCESSED",
      message: `${result.reference}: ${result.booked} booked, ${result.pending} pending approval, ${result.failed} failed.`,
    };
  } catch (error) { return failedAction(error); }
}
