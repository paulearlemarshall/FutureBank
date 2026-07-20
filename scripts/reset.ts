import { db, pool } from "../src/db";
import { resetBaseline } from "../src/db/seed";
import { seedDemoStaff } from "../src/db/seed-auth";
import { stableUuid } from "../src/db/seed-manifest";

async function main() {
  await seedDemoStaff(db);
  await resetBaseline(db, { id: stableUuid("auth-user-admin"), username: "bp.admin" });
  console.info("FutureBank demonstration data reset to its deterministic baseline.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Reset failed");
  process.exitCode = 1;
}).finally(() => pool.end());
