import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { resetBaseline } from "../src/db/seed";
import { seedDemoStaff } from "../src/db/seed-auth";
import { stableUuid } from "../src/db/seed-manifest";
import { runDuePaymentInstructions } from "../src/modules/services/payment-instructions";
import { submitDirectDebitCollection } from "../src/modules/services/direct-debits";
import { approvePendingPayment } from "../src/modules/services/payments";

async function main() {
  const admin = { id: stableUuid("auth-user-admin"), username: "bp.admin" };
  const supervisor = { id: stableUuid("auth-user-supervisor"), username: "bp.supervisor", name: "Blue Prism Supervisor", role: "SUPERVISOR" as const };
  const operator = { id: stableUuid("auth-user-operator"), username: "bp.operator", name: "Blue Prism Operator", role: "OPERATOR" as const };
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

    const scheduleDateResult = await db.execute(sql`select next_execution_date::text as value from payment_instructions where reference = 'PIN-000001'`);
    const businessDate = String((scheduleDateResult.rows[0] as { value: string }).value);
    const firstRun = await runDuePaymentInstructions({ businessDate }, supervisor);
    const secondRun = await runDuePaymentInstructions({ businessDate }, supervisor);
    if (firstRun.booked !== 1 || firstRun.failed !== 0) throw new Error(`Instruction run: expected one booking, received ${firstRun.booked} booked and ${firstRun.failed} failed`);
    if (secondRun.attempted !== 0) throw new Error(`Instruction rerun: expected zero attempts, received ${secondRun.attempted}`);
    const instructionResult = await db.execute(sql`
      select
        (select count(*)::int from payment_instruction_executions e join payment_instructions i on i.id = e.instruction_id where i.reference = 'PIN-000001' and e.status = 'BOOKED') as executions,
        (select count(*)::int from payment_orders where idempotency_key like 'payment-instruction:%' and status = 'BOOKED') as payment_orders,
        (select count(*)::int from ledger_transactions l join payment_orders p on p.id = l.payment_order_id where p.idempotency_key like 'payment-instruction:%') as ledger_transactions,
        (select count(*)::int from ledger_entries e join ledger_transactions l on l.id = e.transaction_id join payment_orders p on p.id = l.payment_order_id where p.idempotency_key like 'payment-instruction:%') as ledger_entries,
        (select count(*)::int from payment_instructions where reference = 'PIN-000001' and status = 'COMPLETED' and version = 2) as completed_instructions
    `);
    const instructionRow = instructionResult.rows[0] as unknown as Record<string, number>;
    for (const label of ["executions", "payment_orders", "ledger_transactions", "completed_instructions"]) {
      if (Number(instructionRow[label]) !== 1) throw new Error(`${label}: expected 1, received ${instructionRow[label]}`);
    }
    if (Number(instructionRow.ledger_entries) !== 2) throw new Error(`ledger_entries: expected 2, received ${instructionRow.ledger_entries}`);
    const mandateDateResult = await db.execute(sql`select valid_from::text as value from direct_debit_mandates where reference = 'DDM-000001'`);
    const collectionDate = String((mandateDateResult.rows[0] as { value: string }).value);
    const collectionKey = "VERIFY-DIRECT-DEBIT-EXACTLY-ONCE";
    const firstCollection = await submitDirectDebitCollection({ mandateReference: "DDM-000001", amount: "3.21", collectionDate, idempotencyKey: collectionKey, today: collectionDate }, operator);
    const duplicateCollection = await submitDirectDebitCollection({ mandateReference: "DDM-000001", amount: "3.21", collectionDate, idempotencyKey: collectionKey, today: collectionDate }, operator);
    if (firstCollection.status !== "BOOKED" || duplicateCollection.reference !== firstCollection.reference || !duplicateCollection.duplicate) throw new Error("Direct debit idempotency did not return the original booked collection");
    const collectionResult = await db.execute(sql`
      select
        (select count(*)::int from direct_debit_collections where idempotency_key = ${collectionKey} and status = 'BOOKED') as collections,
        (select count(*)::int from payment_orders where idempotency_key like 'direct-debit:%' and status = 'BOOKED') as payments,
        (select count(*)::int from ledger_transactions l join payment_orders p on p.id = l.payment_order_id where p.idempotency_key like 'direct-debit:%') as ledger_transactions
    `);
    for (const [label, value] of Object.entries(collectionResult.rows[0] as unknown as Record<string, number>)) if (Number(value) !== 1) throw new Error(`direct debit ${label}: expected 1, received ${value}`);
    console.info("Workflow integration verification passed: locking prevented double approval, and scheduled and direct-debit payments booked exactly once through the balanced ledger path.");
  } finally {
    await resetBaseline(db, admin);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Workflow verification failed");
  process.exitCode = 1;
}).finally(() => pool.end());
