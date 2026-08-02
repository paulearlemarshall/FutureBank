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
import { resolveReconciliationItem, runClearingReconciliation } from "../src/modules/services/reconciliation";
import { assertPostingDateOpen, decideAccountingPeriodClose, requestAccountingPeriodClose } from "../src/modules/services/accounting-periods";
import { decideManualGeneralLedgerJournal } from "../src/modules/services/general-ledger";
import { decideLoanApplication } from "../src/modules/services/loan-originations";
import { BankingError } from "../src/modules/services/errors";

async function main() {
  const admin = { id: stableUuid("auth-user-admin"), username: "bp.admin", name: "Blue Prism Admin", role: "ADMIN" as const };
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
    if (fulfilled !== 1 || rejected !== 1) {
      const outcomes = attempts.map((item) => item.status === "fulfilled" ? "fulfilled" : `rejected:${item.reason instanceof Error ? item.reason.message : String(item.reason)}`).join(", ");
      throw new Error(`Maker-checker race: expected one success and one rejection, received ${fulfilled}/${rejected} (${outcomes})`);
    }
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

    const journalAttempts = await Promise.allSettled([
      decideManualGeneralLedgerJournal({ journalReference: "GLJ-000001", workItemReference: "WRK-000011", expectedVersion: 1, decision: "APPROVE", comment: "Concurrent independent general-ledger approval A." }, admin),
      decideManualGeneralLedgerJournal({ journalReference: "GLJ-000001", workItemReference: "WRK-000011", expectedVersion: 1, decision: "APPROVE", comment: "Concurrent independent general-ledger approval B." }, admin),
    ]);
    if (journalAttempts.filter((item) => item.status === "fulfilled").length !== 1 || journalAttempts.filter((item) => item.status === "rejected").length !== 1) {
      throw new Error("General-ledger maker-checker race did not produce exactly one successful posting");
    }
    const journalResult = await db.execute(sql`
      select
        (select count(*)::int from general_ledger_journals where reference = 'GLJ-000001' and status = 'POSTED' and version = 2 and decided_by = ${admin.id}) as journals,
        (select count(*)::int from general_ledger_lines line join general_ledger_journals journal on journal.id = line.journal_id where journal.reference = 'GLJ-000001') as lines,
        (select count(*)::int from work_items where reference = 'WRK-000011' and status = 'APPROVED' and version = 2) as approved_work_items
    `);
    const journalRow = journalResult.rows[0] as unknown as Record<string, number>;
    if (Number(journalRow.journals) !== 1 || Number(journalRow.lines) !== 2 || Number(journalRow.approved_work_items) !== 1) throw new Error("Approved manual journal did not retain balanced maker-checker evidence");

    const loanAttempts = await Promise.allSettled([
      decideLoanApplication({ applicationReference: "LOA-000001", workItemReference: "WRK-000012", expectedVersion: 1, decision: "APPROVE", comment: "Concurrent independent loan-origination approval A." }, supervisor),
      decideLoanApplication({ applicationReference: "LOA-000001", workItemReference: "WRK-000012", expectedVersion: 1, decision: "APPROVE", comment: "Concurrent independent loan-origination approval B." }, supervisor),
    ]);
    if (loanAttempts.filter((item) => item.status === "fulfilled").length !== 1 || loanAttempts.filter((item) => item.status === "rejected").length !== 1) {
      const outcomes = loanAttempts.map((item) => item.status === "fulfilled" ? "fulfilled" : `rejected:${item.reason instanceof Error ? item.reason.message : String(item.reason)}`).join(", ");
      throw new Error(`Loan-origination race did not produce exactly one successful decision (${outcomes})`);
    }
    const loanResult = await db.execute(sql`
      select
        (select count(*)::int from loan_applications where reference = 'LOA-000001' and status = 'APPROVED' and version = 2 and approved_principal = 48000.00) as applications,
        (select count(*)::int from bank_accounts account join loan_applications application on application.loan_account_id = account.id where application.reference = 'LOA-000001' and account.read_only and account.balance = 48000.00) as accounts,
        (select count(*)::int from loan_details detail join loan_applications application on application.id = detail.origination_application_id where application.reference = 'LOA-000001' and detail.term_months = 24 and detail.outstanding_principal = 48000.00) as details,
        (select count(*)::int from loan_repayments repayment join loan_applications application on application.loan_account_id = repayment.account_id where application.reference = 'LOA-000001' and repayment.status = 'SCHEDULED') as schedule_lines,
        (select coalesce(sum(repayment.principal), 0)::text from loan_repayments repayment join loan_applications application on application.loan_account_id = repayment.account_id where application.reference = 'LOA-000001') as scheduled_principal,
        (select count(*)::int from ledger_entries entry join loan_applications application on application.origination_transaction_id = entry.transaction_id where application.reference = 'LOA-000001') as ledger_entries,
        (select count(*)::int from general_ledger_journals journal join loan_applications application on application.origination_transaction_id = journal.source_ledger_transaction_id where application.reference = 'LOA-000001' and journal.status = 'POSTED' and journal.total_debit = journal.total_credit) as journals,
        (select count(*)::int from general_ledger_lines line join general_ledger_journals journal on journal.id = line.journal_id join loan_applications application on application.origination_transaction_id = journal.source_ledger_transaction_id join general_ledger_accounts account on account.id = line.account_id where application.reference = 'LOA-000001' and account.code in ('1200-GBP', '2100-GBP')) as control_lines,
        (select count(*)::int from work_items where reference = 'WRK-000012' and status = 'APPROVED' and version = 2) as approved_work_items,
        (select count(*)::int from bank_accounts where account_number = '1000000009' and balance = 390190.44) as disbursements
    `);
    const loanRow = loanResult.rows[0] as unknown as Record<string, number | string>;
    const expectedLoan = { applications: 1, accounts: 1, details: 1, schedule_lines: 24, ledger_entries: 2, journals: 1, control_lines: 2, approved_work_items: 1, disbursements: 1 };
    for (const [label, expected] of Object.entries(expectedLoan)) if (Number(loanRow[label]) !== expected) throw new Error(`loan origination ${label}: expected ${expected}, received ${loanRow[label]}`);
    if (String(loanRow.scheduled_principal) !== "48000.00") throw new Error(`loan origination scheduled principal: expected 48000.00, received ${loanRow.scheduled_principal}`);

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
    const today = String((dateResult.rows[0] as { value: string }).value);
    const endOfDayDate = "2026-07-18";
    const endOfDayAttempts = await Promise.all([
      runEndOfDay({ businessDate: endOfDayDate, today }, supervisor),
      runEndOfDay({ businessDate: endOfDayDate, today }, supervisor),
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
    const reconciliationAttempts = await Promise.all([
      runClearingReconciliation({ businessDate: endOfDayDate, today }, supervisor),
      runClearingReconciliation({ businessDate: endOfDayDate, today }, supervisor),
    ]);
    if (new Set(reconciliationAttempts.map((attempt) => attempt.reference)).size !== 1 || reconciliationAttempts.filter((attempt) => attempt.duplicate).length !== 1) throw new Error("Reconciliation race did not return one original and one duplicate run");
    const reconciliationResult = await db.execute(sql`
      select
        (select count(*)::int from reconciliation_runs where business_date = '2026-07-18') as runs,
        (select count(*)::int from reconciliation_items where status = 'MATCHED') as matched,
        (select count(*)::int from reconciliation_items where status = 'OPEN') as open_exceptions,
        (select count(*)::int from reconciliation_items where type = 'AMOUNT_MISMATCH') as amount_mismatches,
        (select count(*)::int from reconciliation_items where type = 'MISSING_INTERNAL') as missing_internal,
        (select count(*)::int from reconciliation_items where type = 'MISSING_EXTERNAL') as missing_external,
        (select count(*)::int from processing_runs where type = 'CLEARING_RECONCILIATION' and business_date = '2026-07-18' and status = 'COMPLETED' and attempted = 28 and booked = 17 and failed = 11) as completed_runs
    `);
    const reconciliationRow = reconciliationResult.rows[0] as unknown as Record<string, number>;
    const expectedReconciliation = { runs: 1, matched: 17, open_exceptions: 11, amount_mismatches: 1, missing_internal: 1, missing_external: 9, completed_runs: 1 };
    for (const [label, expected] of Object.entries(expectedReconciliation)) if (Number(reconciliationRow[label]) !== expected) throw new Error(`reconciliation ${label}: expected ${expected}, received ${reconciliationRow[label]}`);
    const exceptionResult = await db.execute(sql`select reference, version from reconciliation_items where status = 'OPEN' order by reference`);
    await Promise.all((exceptionResult.rows as unknown as Array<{ reference: string; version: number }>).map((exception) =>
      resolveReconciliationItem({ itemReference: exception.reference, runReference: reconciliationAttempts[0].reference, expectedVersion: exception.version, comment: "Verified fictional settlement evidence and recorded the period-close control outcome." }, supervisor),
    ));
    const resolutionResult = await db.execute(sql`select count(*)::int as value from reconciliation_items where status = 'RESOLVED' and version = 2 and resolution_comment is not null`);
    if (Number((resolutionResult.rows[0] as { value: number }).value) !== 11) throw new Error("Reconciliation exceptions were not persisted with version evidence");

    const generalLedgerResult = await db.execute(sql`
      with journal_totals as (
        select journal.id, journal.total_debit, journal.total_credit,
          coalesce(sum(line.amount) filter (where line.direction = 'DEBIT'), 0) as line_debit,
          coalesce(sum(line.amount) filter (where line.direction = 'CREDIT'), 0) as line_credit
        from general_ledger_journals journal left join general_ledger_lines line on line.journal_id = journal.id
        where journal.status = 'POSTED' group by journal.id
      )
      select
        (select count(*)::int from ledger_transactions source left join general_ledger_journals journal on journal.source_ledger_transaction_id = source.id and journal.status = 'POSTED' where journal.id is null) as missing_projections,
        (select count(*)::int from journal_totals where total_debit <> total_credit or total_debit <> line_debit or total_credit <> line_credit) as unbalanced_journals
    `);
    const generalLedgerRow = generalLedgerResult.rows[0] as unknown as Record<string, number>;
    if (Number(generalLedgerRow.missing_projections) !== 0 || Number(generalLedgerRow.unbalanced_journals) !== 0) throw new Error("Runtime subledger activity did not remain completely and exactly balanced in the general ledger");

    const workItemReference = await requestAccountingPeriodClose({ periodReference: "ACP-000001", expectedVersion: 1, comment: "Period-end processing, reconciliation, and exception evidence are complete." }, supervisor);
    const workItemResult = await db.execute(sql`select version from work_items where reference = ${workItemReference}`);
    const workItemVersion = Number((workItemResult.rows[0] as { version: number }).version);
    await decideAccountingPeriodClose({ periodReference: "ACP-000001", workItemReference, expectedVersion: workItemVersion, decision: "APPROVE", comment: "Independent review confirms the period-end controls and balanced ledger." }, admin);
    const periodResult = await db.execute(sql`select count(*)::int as value from accounting_periods where reference = 'ACP-000001' and status = 'CLOSED' and version = 3 and closed_by = ${admin.id}`);
    if (Number((periodResult.rows[0] as { value: number }).value) !== 1) throw new Error("Accounting period did not retain approved close evidence");
    try {
      await assertPostingDateOpen(db, endOfDayDate);
      throw new Error("Closed accounting period accepted a posting date");
    } catch (error) {
      if (!(error instanceof BankingError) || error.code !== "ACCOUNTING_PERIOD_CLOSED") throw error;
    }
    console.info("Workflow integration verification passed: locking prevented duplicate payment, journal, loan, and reversal decisions; loan origination created one exact schedule and atomic disbursement; all runtime postings projected exactly once into balanced general-ledger journals; clearing evidence was fully resolved; and independent period close froze the value date.");
  } finally {
    await resetBaseline(db, admin);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Workflow verification failed");
  process.exitCode = 1;
}).finally(() => pool.end());
