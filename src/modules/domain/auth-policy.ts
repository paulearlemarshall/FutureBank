import type { StaffRole } from "@/modules/contracts";

export type StaffPermission =
  | "CUSTOMER_MAINTAIN"
  | "KYC_GATHER"
  | "KYC_SCREEN"
  | "KYC_DECIDE"
  | "RESTRICTION_MAINTAIN"
  | "PAYMENT_INITIATE"
  | "PAYMENT_DECIDE"
  | "OVERDRAFT_INITIATE"
  | "OVERDRAFT_DECIDE"
  | "OVERDRAFT_ALERT_RESOLVE"
  | "DEMO_RESET";

const permissions: Record<StaffRole, readonly StaffPermission[]> = {
  OPERATOR: ["CUSTOMER_MAINTAIN", "KYC_GATHER", "KYC_SCREEN", "PAYMENT_INITIATE", "OVERDRAFT_INITIATE"],
  SUPERVISOR: ["PAYMENT_DECIDE", "OVERDRAFT_DECIDE", "OVERDRAFT_ALERT_RESOLVE"],
  COMPLIANCE: ["KYC_DECIDE", "RESTRICTION_MAINTAIN"],
  ADMIN: ["CUSTOMER_MAINTAIN", "KYC_GATHER", "KYC_SCREEN", "KYC_DECIDE", "RESTRICTION_MAINTAIN", "PAYMENT_INITIATE", "PAYMENT_DECIDE", "OVERDRAFT_INITIATE", "OVERDRAFT_DECIDE", "OVERDRAFT_ALERT_RESOLVE", "DEMO_RESET"],
};

export function hasRequiredRole(actual: StaffRole, required: StaffRole): boolean {
  return actual === "ADMIN" || actual === required;
}

export function hasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return permissions[role].includes(permission);
}
