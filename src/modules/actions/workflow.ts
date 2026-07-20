"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { workItemEvents, workItems } from "@/db/schema";
import { requireAuthenticatedActionUser } from "@/lib/auth/session";
import type { ActionState } from "@/modules/contracts";
import { canCheckWorkItem } from "@/modules/domain/workflow-policy";
import { BankingError } from "@/modules/services/errors";
import { failedAction, formText, invalidAction } from "./action-utils";

const versionSchema = z.object({ reference: z.string().min(5), expectedVersion: z.coerce.number().int().positive() });

export async function claimWorkItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = versionSchema.safeParse({ reference: formText(formData, "workItemReference"), expectedVersion: formText(formData, "expectedVersion") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requireAuthenticatedActionUser();
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, type, status, assigned_to, version from work_items where reference = ${parsed.data.reference} for update`);
      const item = (result.rows as unknown as Array<{ id: string; type: Parameters<typeof canCheckWorkItem>[0]; status: string; assigned_to: string | null; version: number }>)[0];
      if (!item) throw new BankingError("WORK_ITEM_NOT_FOUND", "The work item was not found.");
      if (!canCheckWorkItem(item.type, actor.role)) throw new BankingError("FORBIDDEN", "Your role cannot claim this work item.");
      if (!['OPEN', 'ASSIGNED'].includes(item.status)) throw new BankingError("WORK_ITEM_NOT_ACTIVE", "This work item is no longer active.");
      if (item.version !== parsed.data.expectedVersion) throw new BankingError("STALE_WORK_ITEM", "Refresh the page before claiming this item.");
      if (item.assigned_to && item.assigned_to !== actor.id) throw new BankingError("WORK_ITEM_ASSIGNED", "This work item is assigned to another user.");
      await tx.update(workItems).set({ status: "ASSIGNED", assignedTo: actor.id, version: item.version + 1, updatedAt: new Date() }).where(eq(workItems.id, item.id));
      await tx.insert(workItemEvents).values({ workItemId: item.id, eventType: "ASSIGNED", fromStatus: item.status as "OPEN" | "ASSIGNED", toStatus: "ASSIGNED", actorUserId: actor.id, actorUsername: actor.username, comment: "Work item claimed." });
    });
    revalidatePath("/work-queue");
    return { ok: true, code: "WORK_ITEM_CLAIMED", message: `Work item ${parsed.data.reference} was assigned to you.` };
  } catch (error) { return failedAction(error); }
}

export async function releaseWorkItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = versionSchema.safeParse({ reference: formText(formData, "workItemReference"), expectedVersion: formText(formData, "expectedVersion") });
  if (!parsed.success) return invalidAction(parsed.error);
  try {
    const actor = await requireAuthenticatedActionUser();
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, status, assigned_to, version from work_items where reference = ${parsed.data.reference} for update`);
      const item = (result.rows as unknown as Array<{ id: string; status: string; assigned_to: string | null; version: number }>)[0];
      if (!item) throw new BankingError("WORK_ITEM_NOT_FOUND", "The work item was not found.");
      if (item.assigned_to !== actor.id && actor.role !== "ADMIN") throw new BankingError("FORBIDDEN", "Only the assignee can release this work item.");
      if (item.version !== parsed.data.expectedVersion) throw new BankingError("STALE_WORK_ITEM", "Refresh the page before releasing this item.");
      await tx.update(workItems).set({ status: "OPEN", assignedTo: null, version: item.version + 1, updatedAt: new Date() }).where(eq(workItems.id, item.id));
      await tx.insert(workItemEvents).values({ workItemId: item.id, eventType: "RELEASED", fromStatus: "ASSIGNED", toStatus: "OPEN", actorUserId: actor.id, actorUsername: actor.username, comment: "Work item released." });
    });
    revalidatePath("/work-queue");
    return { ok: true, code: "WORK_ITEM_RELEASED", message: `Work item ${parsed.data.reference} was released.` };
  } catch (error) { return failedAction(error); }
}
