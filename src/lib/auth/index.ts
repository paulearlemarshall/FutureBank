import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

const secret = process.env.BETTER_AUTH_SECRET ?? (!process.env.VERCEL ? "futurebank-local-development-secret-change-me" : undefined);
if (!secret) throw new Error("BETTER_AUTH_SECRET is required on Vercel");
const baseURL = process.env.BETTER_AUTH_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const trustedOrigins = [
  baseURL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
  "http://localhost:3000",
].filter((value): value is string => Boolean(value));

export const auth = betterAuth({
  appName: "FutureBank Core",
  baseURL,
  trustedOrigins,
  secret,
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
  },
  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    nextCookies(),
  ],
});
