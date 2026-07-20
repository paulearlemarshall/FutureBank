import "server-only";

import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { workItemEvents, workItems } from "@/db/schema";
import type { SessionUser, StaffRole, WorkItemPriority, WorkItemType } from "@/modules/contracts";
import { assertMakerChecker, canCheckWorkItem } from "@/modules/domain/workflow-policy";
import { BankingError } from "./errors";

export type WorkflowTx = Pick<Database, "execute" | "insert" | "update" | "select">;

type LockedWorkItem = {
  id: string;
  reference: string;
  type: WorkItemType;
  status: "OPEN" | "ASSIGNED" | "APPROVED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  created_by: string;
  assigned_to: string | null;
  entity_type: string;
  entity_reference: string;
  version: number;
};

export async function createApprovalWorkItem(tx: WorkflowTx, input: {
  type: WorkItemType;
  priority?: WorkItemPriority;
  entityType: string;
  entityReference: string;
  title: string;
  description: string;
  requiredRole: StaffRole;
  dueAt: Date;
}, actor: SessionUser) {
  await tx.execute(sql`select pg_advisory_xact_lock(738_204_030)`);
  const active = await tx.execute(sql`
    select reference from work_items
    where type = ${input.type} and entity_type = ${input.entityType} and entity_reference = ${input.entityReference}
      and status in ('OPEN', 'ASSIGNED')
    for update
  `);
  if (active.rows.length) throw new BankingError("ACTIVE_APPROVAL_EXISTS", "An active approval item already exists for this record.");
  const sequence = await tx.execute(sql`select coalesce(max(substring(reference from 5)::int), 0)::int + 1 as next from work_items where reference ~ '^WRK-[0-9]+$'`);
  const next = Number((sequence.rows as Array<{ next: number }>)[0]?.next ?? 1);
  const reference = `WRK-${next.toString().padStart(6, "0")}`;
  const [item] = await tx.insert(workItems).values({
    reference, type: input.type, priority: input.priority ?? "NORMAL", entityType: input.entityType, entityReference: input.entityReference,
    title: input.title, description: input.description, requiredRole: input.requiredRole, createdBy: actor.id, dueAt: input.dueAt,
  }).returning();
  await tx.insert(workItemEvents).values({
    workItemId: item.id, eventType: "CREATED", fromStatus: null, toStatus: "OPEN", actorUserId: actor.id,
    actorUsername: actor.username, comment: input.description,
  });
  return item;
}

export async function lockApprovalWorkItem(tx: WorkflowTx, input: {
  reference: string;
  entityType: string;
  entityReference: string;
  expectedVersion: number;
}, actor: SessionUser): Promise<LockedWorkItem> {
  const result = await tx.execute(sql`
    select id, reference, type, status, created_by, assigned_to, entity_type, entity_reference, version
    from work_items where reference = ${input.reference} for update
  `);
  const item = (result.rows as unknown as LockedWorkItem[])[0];
  if (!item) throw new BankingError("WORK_ITEM_NOT_FOUND", "The approval work item was not found.");
  if (item.entity_type !== input.entityType || item.entity_reference !== input.entityReference) throw new BankingError("WORK_ITEM_MISMATCH", "The work item does not belong to this record.");
  try {
    assertMakerChecker({ makerUserId: item.created_by, checkerUserId: actor.id, expectedVersion: input.expectedVersion, actualVersion: item.version, status: item.status });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WORKFLOW_ERROR";
    const messages: Record<string, string> = {
      SELF_APPROVAL_FORBIDDEN: "The maker cannot approve or reject their own submission.",
      STALE_WORK_ITEM: "This work item changed after the page was loaded. Refresh and try again.",
      WORK_ITEM_NOT_ACTIVE: "This work item is no longer active.",
    };
    throw new BankingError(code, messages[code] ?? "The workflow decision could not be applied.");
  }
  if (!canCheckWorkItem(item.type, actor.role)) throw new BankingError("FORBIDDEN", "Your role cannot decide this work item.");
  if (item.assigned_to && item.assigned_to !== actor.id) throw new BankingError("WORK_ITEM_ASSIGNED", "This work item is assigned to another user.");
  return item;
}

export async function decideWorkItem(tx: WorkflowTx, item: LockedWorkItem, decision: "APPROVED" | "REJECTED", comment: string, actor: SessionUser) {
  await tx.update(workItems).set({
    status: decision, decidedBy: actor.id, decisionComment: comment, decidedAt: new Date(), completedAt: new Date(),
    version: item.version + 1, updatedAt: new Date(),
  }).where(eq(workItems.id, item.id));
  await tx.insert(workItemEvents).values({
    workItemId: item.id, eventType: decision, fromStatus: item.status, toStatus: decision,
    actorUserId: actor.id, actorUsername: actor.username, comment,
  });
}
