INSERT INTO "general_ledger_accounts" ("code", "name", "type", "currency", "system_controlled", "posting_allowed", "active") VALUES
  ('1100-GBP', 'GBP settlement clearing', 'ASSET', 'GBP', true, true, true),
  ('2100-GBP', 'GBP customer deposits control', 'LIABILITY', 'GBP', true, true, true),
  ('4100-GBP', 'GBP fee income', 'INCOME', 'GBP', false, true, true),
  ('5100-GBP', 'GBP deposit interest expense', 'EXPENSE', 'GBP', false, true, true),
  ('1100-AED', 'AED settlement clearing', 'ASSET', 'AED', true, true, true),
  ('2100-AED', 'AED customer deposits control', 'LIABILITY', 'AED', true, true, true),
  ('4100-AED', 'AED fee income', 'INCOME', 'AED', false, true, true),
  ('5100-AED', 'AED deposit interest expense', 'EXPENSE', 'AED', false, true, true),
  ('1100-USD', 'USD settlement clearing', 'ASSET', 'USD', true, true, true),
  ('2100-USD', 'USD customer deposits control', 'LIABILITY', 'USD', true, true, true),
  ('4100-USD', 'USD fee income', 'INCOME', 'USD', false, true, true),
  ('5100-USD', 'USD deposit interest expense', 'EXPENSE', 'USD', false, true, true),
  ('1100-EUR', 'EUR settlement clearing', 'ASSET', 'EUR', true, true, true),
  ('2100-EUR', 'EUR customer deposits control', 'LIABILITY', 'EUR', true, true, true),
  ('4100-EUR', 'EUR fee income', 'INCOME', 'EUR', false, true, true),
  ('5100-EUR', 'EUR deposit interest expense', 'EXPENSE', 'EUR', false, true, true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
WITH source_legs AS (
  SELECT "transaction_id", "direction", "amount" FROM "ledger_entries"
  UNION ALL
  SELECT "transaction_id", "direction", "amount" FROM "clearing_entries"
), source_totals AS (
  SELECT "transaction_id",
    SUM(CASE WHEN "direction" = 'DEBIT' THEN "amount" ELSE 0 END) AS "total_debit",
    SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE 0 END) AS "total_credit"
  FROM source_legs
  GROUP BY "transaction_id"
)
INSERT INTO "general_ledger_journals" (
  "reference", "source", "source_ledger_transaction_id", "value_date", "status", "currency", "description",
  "total_debit", "total_credit", "posted_at", "created_at", "updated_at"
)
SELECT 'GL-' || source."reference", 'SUBLEDGER', source."id", source."value_date", 'POSTED', source."currency", source."description",
  totals."total_debit", totals."total_credit", source."booked_at", source."booked_at", source."booked_at"
FROM "ledger_transactions" source
JOIN source_totals totals ON totals."transaction_id" = source."id"
WHERE totals."total_debit" > 0 AND totals."total_debit" = totals."total_credit"
ON CONFLICT ("source_ledger_transaction_id") DO NOTHING;
--> statement-breakpoint
WITH source_legs AS (
  SELECT "id"::text AS "leg_id", "transaction_id", 'ACCOUNT'::text AS "leg_type", "direction", "amount" FROM "ledger_entries"
  UNION ALL
  SELECT "id"::text AS "leg_id", "transaction_id", 'CLEARING'::text AS "leg_type", "direction", "amount" FROM "clearing_entries"
), numbered_legs AS (
  SELECT source_legs.*,
    ROW_NUMBER() OVER (PARTITION BY "transaction_id" ORDER BY "leg_type", "leg_id")::integer AS "line_number"
  FROM source_legs
), mapped_legs AS (
  SELECT numbered_legs.*,
    CASE
      WHEN numbered_legs."leg_type" = 'ACCOUNT' THEN '2100-' || source."currency"
      WHEN source."type" = 'ACCOUNT_CHARGE' THEN '4100-' || source."currency"
      WHEN source."type" = 'DEPOSIT_INTEREST' THEN '5100-' || source."currency"
      ELSE '1100-' || source."currency"
    END AS "account_code",
    source."reference" AS "transaction_reference",
    source."description"
  FROM numbered_legs
  JOIN "ledger_transactions" source ON source."id" = numbered_legs."transaction_id"
)
INSERT INTO "general_ledger_lines" ("journal_id", "account_id", "line_number", "direction", "amount", "narrative")
SELECT journal."id", account."id", leg."line_number", leg."direction", leg."amount",
  leg."transaction_reference" || ' · ' || leg."description"
FROM mapped_legs leg
JOIN "general_ledger_journals" journal ON journal."source_ledger_transaction_id" = leg."transaction_id"
JOIN "general_ledger_accounts" account ON account."code" = leg."account_code"
ON CONFLICT ("journal_id", "line_number") DO NOTHING;
