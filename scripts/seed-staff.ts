import { db, pool } from "../src/db";
import { seedDemoStaff } from "../src/db/seed-auth";

async function main() {
  await seedDemoStaff(db);
  console.info("FutureBank demo staff credentials updated.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Staff credential update failed");
  process.exitCode = 1;
}).finally(() => pool.end());
