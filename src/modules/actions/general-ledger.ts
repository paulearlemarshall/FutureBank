"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { createManualGeneralLedgerJournal, decideManualGeneralLedgerJournal } from "@/modules/services/general-ledger";
import { failedAction, formText, invalidAction } from "./action-utils";

const createSchema = z.object({
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: z.string().regex(/^[A-Z]{3}$/),
  debitAccountCode: z.string().min(4).max(30), creditAccountCode: z.string().min(4).max(30),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), description: z.string().min(5).max(200),
  comment: z.string().min(10).max(500), idempotencyKey: z.string().min(8).max(100),
});
const decisionSchema = z.object({
  journalReference: z.string().min(5), workItemReference: z.string().min(5), expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]), comment: z.string().min(10).max(500),
});

export async function createManualGeneralLedgerJournalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(["valueDate", "currency", "debitAccountCode", "creditAccountCode", "amount", "description", "comment", "idempotencyKey"].map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("GENERAL_LEDGER_JOURNAL_INITIATE");
    const result = await createManualGeneralLedgerJournal(parsed.data, actor);
    revalidatePath("/general-ledger"); revalidatePath(`/general-ledger/journals/${result.reference}`); revalidatePath("/work-queue");
    return { ok: true, code: result.duplicate ? "GENERAL_LEDGER_JOURNAL_DUPLICATE" : "GENERAL_LEDGER_JOURNAL_SUBMITTED", message: result.duplicate ? `${result.reference} already owns this idempotency key.` : `${result.reference} entered independent Admin review as ${result.workItemReference}.` };
  } catch (error) { return failedAction(error); }
}

export async function decideManualGeneralLedgerJournalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse(Object.fromEntries(["journalReference", "workItemReference", "expectedVersion", "decision", "comment"].map((key) => [key, formText(formData, key)])));
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("GENERAL_LEDGER_JOURNAL_DECIDE");
    await decideManualGeneralLedgerJournal(parsed.data, actor);
    revalidatePath("/general-ledger"); revalidatePath(`/general-ledger/journals/${parsed.data.journalReference}`); revalidatePath("/work-queue");
    return { ok: true, code: parsed.data.decision === "APPROVE" ? "GENERAL_LEDGER_JOURNAL_POSTED" : "GENERAL_LEDGER_JOURNAL_REJECTED", message: `${parsed.data.journalReference} was ${parsed.data.decision === "APPROVE" ? "posted to the general ledger" : "rejected without posting"}.` };
  } catch (error) { return failedAction(error); }
}
