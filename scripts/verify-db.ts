import { verifyPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";

type Metric = { value: number };
type PasswordRow = { username: string; password: string };

function expectEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

async function scalar(statement: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(statement);
  return Number((result.rows as unknown as Metric[])[0]?.value ?? 0);
}

async function main() {
  expectEqual("customers", await scalar(sql`select count(*)::int as value from customers`), 9);
  expectEqual("retail customers", await scalar(sql`select count(*)::int as value from customers where party_type = 'RETAIL'`), 6);
  expectEqual("SME customers", await scalar(sql`select count(*)::int as value from customers where party_type = 'SME'`), 3);
  expectEqual("unique RIM identifiers", await scalar(sql`select count(distinct rim_number)::int as value from customers where rim_number like 'RIM%'`), 9);
  expectEqual("UTF-8 database encoding", await scalar(sql`select case when current_setting('server_encoding') = 'UTF8' then 1 else 0 end::int as value`), 1);
  expectEqual("Arabic-language customers", await scalar(sql`select count(*)::int as value from customers where language = 'Arabic'`), 2);
  expectEqual("Arabic seeded names", await scalar(sql`
    select count(*)::int as value from customers where
      (customer_number = 'C000002' and given_name = 'عمر' and family_name = 'المنصوري' and short_name like '%Omar Al Mansoori%') or
      (customer_number = 'C000005' and legal_name = 'شركة الهلال للتجارة الرقمية ش.م.ح-ذ.م.م' and short_name like '%Crescent Digital%')
  `), 2);
  expectEqual("Arabic seeded addresses", await scalar(sql`
    select count(*)::int as value from addresses a join customers c on c.id = a.customer_id where
      (c.customer_number = 'C000002' and a.line1 = '١١ شارع المثال' and a.city = 'دبي') or
      (c.customer_number = 'C000005' and a.line1 = '٤٧ مجمع الأعمال الافتراضي' and a.city = 'دبي')
  `), 2);
  expectEqual("Arabic-script customer search", await scalar(sql`
    select count(*)::int as value from customers where family_name ilike '%المنصوري%' or legal_name ilike '%الهلال%'
  `), 2);
  expectEqual("Latin transliteration customer search", await scalar(sql`
    select count(*)::int as value from customers where short_name ilike '%Omar Al Mansoori%' or short_name ilike '%Crescent Digital%'
  `), 2);
  expectEqual("identity documents", await scalar(sql`select count(*)::int as value from identity_documents`), 13);
  expectEqual("customer document files", await scalar(sql`select count(*)::int as value from customer_document_files`), 2);
  expectEqual("seeded Amelia document slots", await scalar(sql`
    select count(*)::int as value from customer_document_files d join customers c on c.id = d.customer_id
    where c.customer_number = 'C000001' and d.is_seeded and (
      (d.slot = 'PASSPORT' and d.size_bytes = 58533 and d.sha256 = 'a808dc0678910d0eaab8d14e69674965760e976b49d1ef7199c74048233bc1b1') or
      (d.slot = 'NATIONAL_ID' and d.size_bytes = 85430 and d.sha256 = 'a42d421f5a1133e95497081f51144fc8a6f7589a2b111a2577f2250c15151be3')
    )
  `), 2);
  expectEqual("accounts", await scalar(sql`select count(*)::int as value from bank_accounts`), 19);
  expectEqual("read-only loans", await scalar(sql`select count(*)::int as value from bank_accounts where read_only`), 2);
  expectEqual("beneficiaries", await scalar(sql`select count(*)::int as value from beneficiaries`), 16);
  expectEqual("payment instructions", await scalar(sql`select count(*)::int as value from payment_instructions`), 3);
  expectEqual("direct debit mandates", await scalar(sql`select count(*)::int as value from direct_debit_mandates`), 3);
  expectEqual("direct debit mandate status coverage", await scalar(sql`select count(distinct status)::int as value from direct_debit_mandates`), 3);
  expectEqual("direct debit collection scenarios", await scalar(sql`select count(*)::int as value from direct_debit_collections`), 1);
  expectEqual("payment reversal scenarios", await scalar(sql`select count(*)::int as value from payment_reversals`), 1);
  expectEqual("pending payment reversals", await scalar(sql`select count(*)::int as value from payment_reversals where status = 'PENDING_APPROVAL' and reversal_transaction_id is null`), 1);
  expectEqual("invalid direct debit ownership", await scalar(sql`
    select count(*)::int as value from direct_debit_mandates m
    join bank_accounts a on a.id = m.source_account_id join beneficiaries b on b.id = m.creditor_beneficiary_id
    where a.customer_id <> b.customer_id or a.currency <> m.currency or b.currency <> m.currency
  `), 0);
  expectEqual("active payment instructions", await scalar(sql`select count(*)::int as value from payment_instructions where status = 'ACTIVE'`), 2);
  expectEqual("cancelled payment instruction scenarios", await scalar(sql`select count(*)::int as value from payment_instructions where status = 'CANCELLED' and cancellation_reason is not null and version = 2`), 1);
  expectEqual("invalid payment instruction targets", await scalar(sql`
    select count(*)::int as value from payment_instructions where
      (payment_type = 'INTERNAL' and (destination_account_id is null or beneficiary_id is not null)) or
      (payment_type = 'EXTERNAL' and (beneficiary_id is null or destination_account_id is not null))
  `), 0);
  expectEqual("past-due active payment instructions", await scalar(sql`select count(*)::int as value from payment_instructions where status = 'ACTIVE' and next_execution_date < current_date`), 0);
  expectEqual("KYC cases", await scalar(sql`select count(*)::int as value from kyc_cases`), 8);
  expectEqual("overdraft facilities", await scalar(sql`select count(*)::int as value from overdraft_facilities`), 9);
  expectEqual("active payment holds", await scalar(sql`select count(*)::int as value from account_holds where status = 'ACTIVE'`), 1);
  expectEqual("open or assigned work items", await scalar(sql`select count(*)::int as value from work_items where status in ('OPEN', 'ASSIGNED')`), 6);
  expectEqual("expired active payment scenarios", await scalar(sql`
    select count(*)::int as value from payment_orders where status = 'PENDING' and expires_at <= now()
  `), 0);
  expectEqual("expired active holds", await scalar(sql`
    select count(*)::int as value from account_holds where status = 'ACTIVE' and expires_at <= now()
  `), 0);
  expectEqual("overdue non-terminal KYC cases", await scalar(sql`
    select count(*)::int as value from kyc_cases where status in ('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'PENDING_APPROVAL') and due_at <= now()
  `), 0);
  expectEqual("overdue open work items", await scalar(sql`
    select count(*)::int as value from work_items where status in ('OPEN', 'ASSIGNED') and due_at <= now()
  `), 0);
  expectEqual("expired live facilities", await scalar(sql`
    select count(*)::int as value from overdraft_facilities
    where status in ('ACTIVE', 'PENDING_APPROVAL', 'PENDING_CHANGE', 'SUSPENDED') and expiry_date is not null and expiry_date <= current_date
  `), 0);
  expectEqual("expired evidence in active KYC scenarios", await scalar(sql`
    select count(*)::int as value from kyc_evidence e join kyc_cases k on k.id = e.kyc_case_id
    where k.status in ('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'PENDING_APPROVAL')
      and e.verification_status = 'VERIFIED' and e.expires_at is not null and e.expires_at < current_date
  `), 0);
  expectEqual("active debit restrictions", await scalar(sql`select count(*)::int as value from customer_restrictions where type = 'DEBIT_BLOCK' and active`), 2);
  expectEqual("account status coverage", await scalar(sql`select count(distinct status)::int as value from bank_accounts`), 3);
  expectEqual("payment status coverage", await scalar(sql`select count(distinct status)::int as value from payment_orders`), 4);
  expectEqual("hold status coverage", await scalar(sql`select count(distinct status)::int as value from account_holds`), 4);
  expectEqual("work-item status coverage", await scalar(sql`select count(distinct status)::int as value from work_items`), 6);
  expectEqual("reachable overdraft status coverage", await scalar(sql`select count(distinct status)::int as value from overdraft_facilities where status <> 'DRAFT'`), 7);
  expectEqual("active KYC case uniqueness violations", await scalar(sql`
    select count(*)::int as value from (
      select customer_id from kyc_cases where status in ('OPEN', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'PENDING_APPROVAL')
      group by customer_id having count(*) > 1
    ) duplicates
  `), 0);
  expectEqual("accounts below transaction minimum", await scalar(sql`
    select count(*)::int as value from (
      select a.id from bank_accounts a left join ledger_entries e on e.account_id = a.id
      group by a.id having count(e.id) < 25
    ) deficient
  `), 0);
  expectEqual("unbalanced transactions", await scalar(sql`
    with legs as (
      select transaction_id, case when direction = 'CREDIT' then amount else -amount end as signed from ledger_entries
      union all
      select transaction_id, case when direction = 'CREDIT' then amount else -amount end as signed from clearing_entries
    )
    select count(*)::int as value from (select transaction_id from legs group by transaction_id having sum(signed) <> 0) unbalanced
  `), 0);
  expectEqual("staff users", await scalar(sql`select count(*)::int as value from staff_profiles where active`), 4);

  const credentials = await db.execute(sql`
    select u.username, a.password from "user" u join account a on a.user_id = u.id and a.provider_id = 'credential'
    where u.username in ('bp.operator', 'bp.supervisor', 'bp.compliance', 'bp.admin') order by u.username
  `);
  const rows = credentials.rows as unknown as PasswordRow[];
  const passwordByUsername: Record<string, string | undefined> = {
    "bp.operator": process.env.DEMO_OPERATOR_PASSWORD,
    "bp.supervisor": process.env.DEMO_SUPERVISOR_PASSWORD,
    "bp.compliance": process.env.DEMO_COMPLIANCE_PASSWORD,
    "bp.admin": process.env.DEMO_ADMIN_PASSWORD,
  };
  for (const credential of rows) {
    const password = passwordByUsername[credential.username];
    if (!password || !(await verifyPassword({ hash: credential.password, password }))) throw new Error(`Credential verification failed for ${credential.username}`);
  }
  expectEqual("verified staff credentials", rows.length, 4);
  console.info("Live Neon verification passed: schema, baseline counts, transaction coverage, balanced ledger, and staff credentials.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database verification failed");
  process.exitCode = 1;
}).finally(() => pool.end());
