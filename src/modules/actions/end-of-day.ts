"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { runEndOfDay } from "@/modules/services/end-of-day";
import { failedAction, formText, invalidAction } from "./action-utils";

const schema = z.object({ businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid business date.") });

export async function runEndOfDayAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ businessDate: formText(formData, "businessDate") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requirePermission("END_OF_DAY_EXECUTE");
    const result = await runEndOfDay(parsed.data, actor);
    revalidatePath("/end-of-day");
    revalidatePath(`/end-of-day/${result.reference}`);
    revalidatePath("/accounts");
    return {
      ok: true,
      code: result.duplicate ? "END_OF_DAY_ALREADY_RUN" : result.failed ? "END_OF_DAY_COMPLETED_WITH_FAILURES" : "END_OF_DAY_COMPLETED",
      message: `${result.reference}: ${result.booked} booked (${result.charges} charges, ${result.interests} interest), ${result.failed} failed${result.duplicate ? "; existing run returned" : ""}.`,
    };
  } catch (error) { return failedAction(error); }
}
