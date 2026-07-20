import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { staffProfiles } from "@/db/schema";
import type { SessionUser, StaffRole } from "@/modules/contracts";
import { hasRequiredRole } from "@/modules/domain/auth-policy";
import { hasPermission, type StaffPermission } from "@/modules/domain/auth-policy";
import { auth } from "./index";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const current = await auth.api.getSession({ headers: await headers() });
  if (!current?.user) return null;
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, current.user.id)).limit(1);
  if (!profile?.active) return null;
  return {
    id: current.user.id,
    username: current.user.username ?? current.user.email,
    name: current.user.name,
    role: profile.role,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}

export async function requireRole(required: StaffRole): Promise<SessionUser> {
  const current = await requireUser();
  if (!hasRequiredRole(current.role, required)) redirect("/dashboard?error=forbidden");
  return current;
}

export async function requireActionUser(required: StaffRole = "OPERATOR"): Promise<SessionUser> {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  if (!hasRequiredRole(current.role, required)) throw new Error("FORBIDDEN");
  return current;
}

export async function requireAuthenticatedActionUser(): Promise<SessionUser> {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  return current;
}

export async function requirePermission(permission: StaffPermission): Promise<SessionUser> {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  if (!hasPermission(current.role, permission)) throw new Error("FORBIDDEN");
  return current;
}
