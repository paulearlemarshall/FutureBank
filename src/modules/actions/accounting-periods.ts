"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { decideAccountingPeriodClose, requestAccountingPeriodClose } from "@/modules/services/accounting-periods";
import { failedAction, formText, invalidAction } from "./action-utils";

const requestSchema = z.object({ periodReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(), comment: z.string().min(10).max(500) });
const decisionSchema = requestSchema.extend({ workItemReference: z.string().min(5), decision: z.enum(["APPROVE", "REJECT"]) });

export async function requestAccountingPeriodCloseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(["periodReference", "expectedVersion", "comment"].map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("ACCOUNTING_PERIOD_CLOSE_INITIATE");
    const workItemReference = await requestAccountingPeriodClose(parsed.data, actor);
    revalidatePath("/accounting-periods"); revalidatePath(`/accounting-periods/${parsed.data.periodReference}`); revalidatePath("/work-queue");
    return { ok: true, code: "ACCOUNTING_PERIOD_CLOSE_REQUESTED", message: `${parsed.data.periodReference} entered close review as ${workItemReference}.` };
  } catch (error) { return failedAction(error); }
}

export async function decideAccountingPeriodCloseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse(Object.fromEntries(["periodReference", "workItemReference", "expectedVersion", "comment", "decision"].map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("ACCOUNTING_PERIOD_CLOSE_DECIDE");
    await decideAccountingPeriodClose(parsed.data, actor);
    revalidatePath("/accounting-periods"); revalidatePath(`/accounting-periods/${parsed.data.periodReference}`); revalidatePath("/work-queue");
    return { ok: true, code: parsed.data.decision === "APPROVE" ? "ACCOUNTING_PERIOD_CLOSED" : "ACCOUNTING_PERIOD_CLOSE_REJECTED", message: `${parsed.data.periodReference} was ${parsed.data.decision === "APPROVE" ? "closed; posting dates in the period are now blocked" : "returned to open"}.` };
  } catch (error) { return failedAction(error); }
}
