"use server";

import { and, count, eq, gt, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { ActionState } from "@/modules/contracts";

const INVALID_LOGIN: ActionState = { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid username or password." };

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { ...INVALID_LOGIN, fieldErrors: { username: username ? [] : ["Username is required"], password: password ? [] : ["Password is required"] } };

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(Date.now() - 24 * 60 * 60_000)));
  const since = new Date(Date.now() - 15 * 60_000);
  const [failures] = await db.select({ value: count() }).from(loginAttempts).where(and(
    eq(loginAttempts.username, username), eq(loginAttempts.ipAddress, ipAddress), eq(loginAttempts.succeeded, false), gt(loginAttempts.attemptedAt, since),
  ));
  if (Number(failures.value) >= 5) return { ok: false, code: "RATE_LIMITED", message: "Too many unsuccessful attempts. Try again in 15 minutes." };

  try {
    await auth.api.signInUsername({ body: { username, password, rememberMe: false }, headers: requestHeaders });
    await db.insert(loginAttempts).values({ username, ipAddress, succeeded: true });
    return { ok: true, code: "SIGNED_IN", message: "Sign in successful." };
  } catch {
    await db.insert(loginAttempts).values({ username, ipAddress, succeeded: false });
    return INVALID_LOGIN;
  }
}

export async function logoutAction(): Promise<never> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
