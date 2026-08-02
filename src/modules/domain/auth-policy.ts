import type { StaffRole } from "@/modules/contracts";

export type StaffPermission =
  | "CUSTOMER_MAINTAIN"
  | "KYC_GATHER"
  | "KYC_SCREEN"
  | "KYC_DECIDE"
  | "RESTRICTION_MAINTAIN"
  | "PAYMENT_INITIATE"
  | "PAYMENT_DECIDE"
  | "PAYMENT_INSTRUCTION_MAINTAIN"
  | "PAYMENT_SCHEDULE_EXECUTE"
  | "OVERDRAFT_INITIATE"
  | "OVERDRAFT_DECIDE"
  | "OVERDRAFT_ALERT_RESOLVE"
  | "DEMO_RESET";

const permissions: Record<StaffRole, readonly StaffPermission[]> = {
  OPERATOR: ["CUSTOMER_MAINTAIN", "KYC_GATHER", "KYC_SCREEN", "PAYMENT_INITIATE", "PAYMENT_INSTRUCTION_MAINTAIN", "OVERDRAFT_INITIATE"],
  SUPERVISOR: ["PAYMENT_DECIDE", "PAYMENT_SCHEDULE_EXECUTE", "OVERDRAFT_DECIDE", "OVERDRAFT_ALERT_RESOLVE"],
  COMPLIANCE: ["KYC_DECIDE", "RESTRICTION_MAINTAIN"],
  ADMIN: ["CUSTOMER_MAINTAIN", "KYC_GATHER", "KYC_SCREEN", "KYC_DECIDE", "RESTRICTION_MAINTAIN", "PAYMENT_INITIATE", "PAYMENT_DECIDE", "PAYMENT_INSTRUCTION_MAINTAIN", "PAYMENT_SCHEDULE_EXECUTE", "OVERDRAFT_INITIATE", "OVERDRAFT_DECIDE", "OVERDRAFT_ALERT_RESOLVE", "DEMO_RESET"],
};

export function hasRequiredRole(actual: StaffRole, required: StaffRole): boolean {
  return actual === "ADMIN" || actual === required;
}

export function hasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return permissions[role].includes(permission);
}
