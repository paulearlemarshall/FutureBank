"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { resolveReconciliationItem, runClearingReconciliation } from "@/modules/services/reconciliation";
import { failedAction, formText, invalidAction } from "./action-utils";

const runSchema = z.object({ businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const resolveSchema = z.object({ itemReference: z.string().min(5), runReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(), comment: z.string().min(10).max(500) });

export async function runReconciliationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = runSchema.safeParse({ businessDate: formText(formData, "businessDate") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("RECONCILIATION_EXECUTE");
    const result = await runClearingReconciliation(parsed.data, actor);
    revalidatePath("/reconciliation"); revalidatePath(`/reconciliation/${result.reference}`);
    return { ok: true, code: result.duplicate ? "RECONCILIATION_ALREADY_RUN" : "RECONCILIATION_COMPLETED", message: `${result.reference}: ${result.matched} matched, ${result.exceptions} exceptions${result.duplicate ? "; existing run returned" : ""}.` };
  } catch (error) { return failedAction(error); }
}

export async function resolveReconciliationItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resolveSchema.safeParse({ itemReference: formText(formData, "itemReference"), runReference: formText(formData, "runReference"), expectedVersion: formText(formData, "expectedVersion"), comment: formText(formData, "comment") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("RECONCILIATION_RESOLVE");
    await resolveReconciliationItem(parsed.data, actor);
    revalidatePath("/reconciliation"); revalidatePath(`/reconciliation/${parsed.data.runReference}`);
    return { ok: true, code: "RECONCILIATION_EXCEPTION_RESOLVED", message: `Exception ${parsed.data.itemReference} was resolved without changing the ledger.` };
  } catch (error) { return failedAction(error); }
}
