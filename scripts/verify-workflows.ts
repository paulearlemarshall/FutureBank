import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { resetBaseline } from "../src/db/seed";
import { seedDemoStaff } from "../src/db/seed-auth";
import { stableUuid } from "../src/db/seed-manifest";
import { runDuePaymentInstructions } from "../src/modules/services/payment-instructions";
import { submitDirectDebitCollection } from "../src/modules/services/direct-debits";
import { approvePendingPayment } from "../src/modules/services/payments";
import { decidePaymentReversal } from "../src/modules/services/payment-reversals";
import { runEndOfDay } from "../src/modules/services/end-of-day";

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
    const reversalAttempts = await Promise.allSettled([
      decidePaymentReversal({ reversalReference: "REV-000001", workItemReference: "WRK-000010", expectedVersion: 1, comment: "Concurrent reversal approval A", decision: "APPROVE" }, supervisor),
      decidePaymentReversal({ reversalReference: "REV-000001", workItemReference: "WRK-000010", expectedVersion: 1, comment: "Concurrent reversal approval B", decision: "APPROVE" }, supervisor),
    ]);
    if (reversalAttempts.filter((item) => item.status === "fulfilled").length !== 1 || reversalAttempts.filter((item) => item.status === "rejected").length !== 1) {
      const outcomes = reversalAttempts.map((item) => item.status === "fulfilled" ? "fulfilled" : `rejected:${item.reason instanceof Error ? item.reason.message : String(item.reason)}`).join(", ");
      throw new Error(`Reversal race did not produce exactly one successful decision (${outcomes})`);
    }
    const reversalResult = await db.execute(sql`
      select
        (select count(*)::int from payment_reversals where reference = 'REV-000001' and status = 'BOOKED' and version = 2) as reversals,
        (select count(*)::int from ledger_transactions l join payment_reversals r on r.reversal_transaction_id = l.id where r.reference = 'REV-000001' and l.type = 'PAYMENT_REVERSAL') as ledger_transactions,
        (select count(*)::int from ledger_entries e join payment_reversals r on r.reversal_transaction_id = e.transaction_id where r.reference = 'REV-000001') as account_entries,
        (select count(*)::int from clearing_entries e join payment_reversals r on r.reversal_transaction_id = e.transaction_id where r.reference = 'REV-000001') as clearing_entries,
        (select count(*)::int from work_items where reference = 'WRK-000010' and status = 'APPROVED' and version = 2) as approved_work_items
    `);
    for (const [label, value] of Object.entries(reversalResult.rows[0] as unknown as Record<string, number>)) if (Number(value) !== 1) throw new Error(`payment reversal ${label}: expected 1, received ${value}`);

    const dateResult = await db.execute(sql`select current_date::text as value`);
    const endOfDayDate = String((dateResult.rows[0] as { value: string }).value);
    const endOfDayAttempts = await Promise.all([
      runEndOfDay({ businessDate: endOfDayDate }, supervisor),
      runEndOfDay({ businessDate: endOfDayDate }, supervisor),
    ]);
    if (new Set(endOfDayAttempts.map((attempt) => attempt.reference)).size !== 1 || endOfDayAttempts.filter((attempt) => attempt.duplicate).length !== 1) {
      throw new Error("End-of-day race did not return one original and one duplicate run");
    }
    const endOfDayResult = await db.execute(sql`
      with eod_transactions as (
        select p.ledger_transaction_id as id from end_of_day_postings p join end_of_day_runs r on r.id = p.end_of_day_run_id where r.business_date = ${endOfDayDate}
      ), legs as (
        select e.transaction_id, case when e.direction = 'CREDIT' then e.amount else -e.amount end as signed from ledger_entries e join eod_transactions t on t.id = e.transaction_id
        union all
        select e.transaction_id, case when e.direction = 'CREDIT' then e.amount else -e.amount end as signed from clearing_entries e join eod_transactions t on t.id = e.transaction_id
      )
      select
        (select count(*)::int from end_of_day_runs where business_date = ${endOfDayDate}) as runs,
        (select count(*)::int from processing_runs where type = 'END_OF_DAY' and business_date = ${endOfDayDate} and status = 'COMPLETED' and attempted = 9 and booked = 9 and failed = 0) as completed_runs,
        (select count(*)::int from end_of_day_postings where business_date = ${endOfDayDate} and type = 'CHARGE' and status = 'BOOKED') as charges,
        (select count(*)::int from end_of_day_postings where business_date = ${endOfDayDate} and type = 'INTEREST' and status = 'BOOKED') as interests,
        (select count(*)::int from eod_transactions where id is not null) as ledger_transactions,
        (select count(*)::int from (select transaction_id from legs group by transaction_id having sum(signed) <> 0) unbalanced) as unbalanced
    `);
    const endOfDayRow = endOfDayResult.rows[0] as unknown as Record<string, number>;
    const expectedEndOfDay = { runs: 1, completed_runs: 1, charges: 2, interests: 7, ledger_transactions: 9, unbalanced: 0 };
    for (const [label, expected] of Object.entries(expectedEndOfDay)) if (Number(endOfDayRow[label]) !== expected) throw new Error(`end of day ${label}: expected ${expected}, received ${endOfDayRow[label]}`);
    console.info("Workflow integration verification passed: locking prevented double approval, and scheduled, direct-debit, reversal, charge, and interest postings booked exactly once through balanced ledger paths.");
  } finally {
    await resetBaseline(db, admin);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Workflow verification failed");
  process.exitCode = 1;
}).finally(() => pool.end());
