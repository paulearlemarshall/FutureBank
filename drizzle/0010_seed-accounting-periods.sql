insert into "accounting_periods" (
  "reference", "code", "start_date", "end_date", "status", "version",
  "closed_by", "close_decision_comment", "closed_at"
)
values
  ('ACP-000001', '2026-07-CONTROL', date '2026-07-01', date '2026-07-18', 'OPEN', 1, null, null, null),
  (
    'ACP-000002',
    'CURRENT-OPERATING-PERIOD',
    greatest(date '2026-07-19', date_trunc('month', current_date)::date),
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    'OPEN', 1, null, null, null
  ),
  (
    'ACP-000003', '2026-06', date '2026-06-01', date '2026-06-30', 'CLOSED', 3,
    (select "id" from "user" where "username" = 'bp.admin' limit 1),
    'Historical fictional period closed before the active demonstration window.',
    timestamptz '2026-07-01 08:00:00+00'
  )
on conflict ("reference") do nothing;
