import type { StaffRole, WorkItemStatus, WorkItemType } from "@/modules/contracts";

const checkerRoles: Record<WorkItemType, readonly StaffRole[]> = {
  KYC_APPROVAL: ["COMPLIANCE", "ADMIN"],
  PAYMENT_APPROVAL: ["SUPERVISOR", "ADMIN"],
  OVERDRAFT_APPROVAL: ["SUPERVISOR", "ADMIN"],
  OVERDRAFT_CHANGE: ["SUPERVISOR", "ADMIN"],
  OVERDRAFT_ALERT: ["SUPERVISOR", "ADMIN"],
};

export function canCheckWorkItem(type: WorkItemType, role: StaffRole): boolean {
  return checkerRoles[type].includes(role);
}

export function assertMakerChecker(input: { makerUserId: string; checkerUserId: string; expectedVersion: number; actualVersion: number; status: WorkItemStatus }) {
  if (input.makerUserId === input.checkerUserId) throw new Error("SELF_APPROVAL_FORBIDDEN");
  if (input.expectedVersion !== input.actualVersion) throw new Error("STALE_WORK_ITEM");
  if (!(["OPEN", "ASSIGNED"] as WorkItemStatus[]).includes(input.status)) throw new Error("WORK_ITEM_NOT_ACTIVE");
}

export function isActiveApprovalStatus(status: WorkItemStatus): boolean {
  return status === "OPEN" || status === "ASSIGNED";
}
