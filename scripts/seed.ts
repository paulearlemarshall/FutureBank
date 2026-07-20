import { db, pool } from "../src/db";
import { clearBankingData, seedBaseline } from "../src/db/seed";
import { seedDemoStaff } from "../src/db/seed-auth";

async function main() {
  await seedDemoStaff(db);
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as typeof db;
    await clearBankingData(tx);
    await seedBaseline(tx);
  });
  console.info("FutureBank baseline seeded: 9 customers, 19 accounts, 475 transactions, 16 beneficiaries, 4 staff users.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
}).finally(() => pool.end());
