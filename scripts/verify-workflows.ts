import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { resetBaseline } from "../src/db/seed";
import { seedDemoStaff } from "../src/db/seed-auth";
import { stableUuid } from "../src/db/seed-manifest";
import { approvePendingPayment } from "../src/modules/services/payments";

async function main() {
  const admin = { id: stableUuid("auth-user-admin"), username: "bp.admin" };
  const supervisor = { id: stableUuid("auth-user-supervisor"), username: "bp.supervisor", name: "Blue Prism Supervisor", role: "SUPERVISOR" as const };
  if (process.env.SKIP_DEMO_STAFF_SEED !== "true") await seedDemoStaff(db);
  await resetBaseline(db, admin);
  try {
    const attempts = await Promise.allSettled([
      approvePendingPayment({ paymentReference: "PAY-000001", workItemReference: "WRK-000001", expectedVersion: 1, comment: "Concurrent integration approval A" }, supervisor),
      approvePendingPayment({ paymentReference: "PAY-000001", workItemReference: "WRK-000001", expectedVersion: 1, comment: "Concurrent integration approval B" }, supervisor),
    ]);
    const fulfilled = attempts.filter((item) => item.status === "fulfilled").length;
    const rejected = attempts.filter((item) => item.status === "rejected").length;
    if (fulfilled !== 1 || rejected !== 1) throw new Error(`Maker-checker race: expected one success and one rejection, received ${fulfilled}/${rejected}`);
    const result = await db.execute(sql`
      select
        (select count(*)::int from payment_orders where reference = 'PAY-000001' and status = 'BOOKED') as booked,
        (select count(*)::int from account_holds h join payment_orders p on p.id = h.payment_order_id where p.reference = 'PAY-000001' and h.status = 'CONSUMED') as consumed_holds,
        (select count(*)::int from ledger_transactions l join payment_orders p on p.id = l.payment_order_id where p.reference = 'PAY-000001') as ledger_transactions,
        (select count(*)::int from ledger_entries e join ledger_transactions l on l.id = e.transaction_id join payment_orders p on p.id = l.payment_order_id where p.reference = 'PAY-000001') as ledger_entries,
        (select count(*)::int from work_items where reference = 'WRK-000001' and status = 'APPROVED' and version = 2) as approved_work_items
    `);
    const row = result.rows[0] as unknown as Record<string, number>;
    for (const [label, value] of Object.entries(row)) if (Number(value) !== 1) throw new Error(`${label}: expected 1, received ${value}`);
    console.info("Workflow integration verification passed: row locking prevented double approval and booked exactly one held payment.");
  } finally {
    await resetBaseline(db, admin);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Workflow verification failed");
  process.exitCode = 1;
}).finally(() => pool.end());
