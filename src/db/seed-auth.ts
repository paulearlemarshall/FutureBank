import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { Database } from "./index";
import { account, staffProfiles, user } from "./schema";
import { stableUuid } from "./seed-manifest";

const demoStaff = [
  { key: "operator", username: "bp.operator", name: "Blue Prism Operator", email: "bp.operator@futurebank.example", employeeNumber: "FB-OP-001", role: "OPERATOR" as const, env: "DEMO_OPERATOR_PASSWORD" },
  { key: "admin", username: "bp.admin", name: "Blue Prism Administrator", email: "bp.admin@futurebank.example", employeeNumber: "FB-AD-001", role: "ADMIN" as const, env: "DEMO_ADMIN_PASSWORD" },
];

export async function seedDemoStaff(database: Database): Promise<void> {
  for (const staff of demoStaff) {
    const password = process.env[staff.env];
    if (!password || password.length < 10) throw new Error(`${staff.env} must contain at least 10 characters`);
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
  }
}
