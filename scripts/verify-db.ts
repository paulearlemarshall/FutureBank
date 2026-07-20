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
  expectEqual("customers", await scalar(sql`select count(*)::int as value from customers`), 5);
  expectEqual("retail customers", await scalar(sql`select count(*)::int as value from customers where party_type = 'RETAIL'`), 3);
  expectEqual("SME customers", await scalar(sql`select count(*)::int as value from customers where party_type = 'SME'`), 2);
  expectEqual("unique RIM identifiers", await scalar(sql`select count(distinct rim_number)::int as value from customers where rim_number like 'RIM%'`), 5);
  expectEqual("identity documents", await scalar(sql`select count(*)::int as value from identity_documents`), 7);
  expectEqual("accounts", await scalar(sql`select count(*)::int as value from bank_accounts`), 14);
  expectEqual("read-only loans", await scalar(sql`select count(*)::int as value from bank_accounts where read_only`), 2);
  expectEqual("beneficiaries", await scalar(sql`select count(*)::int as value from beneficiaries`), 12);
  expectEqual("KYC cases", await scalar(sql`select count(*)::int as value from kyc_cases`), 5);
  expectEqual("overdraft facilities", await scalar(sql`select count(*)::int as value from overdraft_facilities`), 5);
  expectEqual("active payment holds", await scalar(sql`select count(*)::int as value from account_holds where status = 'ACTIVE'`), 1);
  expectEqual("open or assigned work items", await scalar(sql`select count(*)::int as value from work_items where status in ('OPEN', 'ASSIGNED')`), 3);
  expectEqual("confirmed fictional sanctions restrictions", await scalar(sql`select count(*)::int as value from customer_restrictions where type = 'DEBIT_BLOCK' and active`), 1);
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
