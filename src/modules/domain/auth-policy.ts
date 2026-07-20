import type { StaffRole } from "@/modules/contracts";

export function hasRequiredRole(actual: StaffRole, required: StaffRole): boolean {
  return actual === "ADMIN" || actual === required;
}
