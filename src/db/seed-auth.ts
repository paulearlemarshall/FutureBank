import { defaultKeyHasher } from "@better-auth/api-key";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { Database } from "./index";
import { account, apikey, staffProfiles, user } from "./schema";
import { stableUuid } from "./seed-manifest";

const demoStaff = [
  { key: "operator", username: "bp.operator", name: "Blue Prism Operator", email: "bp.operator@futurebank.example", employeeNumber: "FB-OP-001", role: "OPERATOR" as const, passwordEnv: "DEMO_OPERATOR_PASSWORD", apiKeyEnv: "FUTUREBANK_API_OPERATOR_KEY" },
  { key: "supervisor", username: "bp.supervisor", name: "Blue Prism Supervisor", email: "bp.supervisor@futurebank.example", employeeNumber: "FB-SU-001", role: "SUPERVISOR" as const, passwordEnv: "DEMO_SUPERVISOR_PASSWORD", apiKeyEnv: "FUTUREBANK_API_SUPERVISOR_KEY" },
  { key: "compliance", username: "bp.compliance", name: "Blue Prism Compliance", email: "bp.compliance@futurebank.example", employeeNumber: "FB-CO-001", role: "COMPLIANCE" as const, passwordEnv: "DEMO_COMPLIANCE_PASSWORD", apiKeyEnv: "FUTUREBANK_API_COMPLIANCE_KEY" },
  { key: "admin", username: "bp.admin", name: "Blue Prism Administrator", email: "bp.admin@futurebank.example", employeeNumber: "FB-AD-001", role: "ADMIN" as const, passwordEnv: "DEMO_ADMIN_PASSWORD", apiKeyEnv: "FUTUREBANK_API_ADMIN_KEY" },
];

export async function seedDemoStaff(database: Database): Promise<void> {
  const suppliedKeys = new Set<string>();
  for (const staff of demoStaff) {
    const password = process.env[staff.passwordEnv];
    if (!password || password.length < 10) throw new Error(`${staff.passwordEnv} must contain at least 10 characters`);
    const userId = stableUuid(`auth-user-${staff.key}`);
    const accountId = stableUuid(`auth-account-${staff.key}`);
    const passwordHash = await hashPassword(password);
    await database.insert(user).values({
      id: userId, name: staff.name, email: staff.email, emailVerified: true, username: staff.username, displayUsername: staff.username,
    }).onConflictDoUpdate({ target: user.id, set: { name: staff.name, email: staff.email, emailVerified: true, username: staff.username, displayUsername: staff.username, updatedAt: new Date() } });
    await database.insert(account).values({
      id: accountId, accountId: userId, providerId: "credential", userId, password: passwordHash,
    }).onConflictDoUpdate({ target: account.id, set: { password: passwordHash, updatedAt: new Date() } });
    await database.insert(staffProfiles).values({ userId, role: staff.role, employeeNumber: staff.employeeNumber, active: true })
      .onConflictDoUpdate({ target: staffProfiles.userId, set: { role: staff.role, employeeNumber: staff.employeeNumber, active: true, updatedAt: new Date() } });
    await database.update(user).set({ updatedAt: new Date() }).where(eq(user.id, userId));

    const plaintextApiKey = process.env[staff.apiKeyEnv]
      ?? (staff.key === "operator" ? process.env.FUTUREBANK_API_KEY : undefined);
    if (!plaintextApiKey) continue;
    if (plaintextApiKey.length < 20) throw new Error(`${staff.apiKeyEnv} must contain at least 20 characters`);
    if (suppliedKeys.has(plaintextApiKey)) throw new Error("Each FutureBank API key must belong to exactly one staff actor");
    suppliedKeys.add(plaintextApiKey);
    const keyId = stableUuid(`auth-api-key-${staff.key}`);
    await database.insert(apikey).values({
      id: keyId,
      configId: "default",
      name: `${staff.username} integration key`,
      referenceId: userId,
      key: await defaultKeyHasher(plaintextApiKey),
      enabled: true,
      rateLimitEnabled: true,
      rateLimitTimeWindow: 60_000,
      rateLimitMax: 600,
      requestCount: 0,
    }).onConflictDoUpdate({
      target: apikey.id,
      set: {
        name: `${staff.username} integration key`,
        referenceId: userId,
        key: await defaultKeyHasher(plaintextApiKey),
        enabled: true,
        rateLimitEnabled: true,
        rateLimitTimeWindow: 60_000,
        rateLimitMax: 600,
        requestCount: 0,
        lastRequest: null,
        updatedAt: new Date(),
      },
    });
  }
}
