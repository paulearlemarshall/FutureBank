INSERT INTO "general_ledger_accounts" ("id", "code", "name", "type", "currency", "system_controlled", "posting_allowed", "active", "version")
SELECT gen_random_uuid(), '1200-' || currency, currency || ' loan receivables', 'ASSET', currency, true, true, true, 1
FROM (VALUES ('GBP'), ('AED'), ('USD'), ('EUR')) currencies(currency)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
UPDATE "general_ledger_lines" line
SET "account_id" = loan_control.id
FROM "general_ledger_journals" journal,
     "ledger_entries" entry,
     "bank_accounts" account,
     "products" product,
     "general_ledger_accounts" deposit_control,
     "general_ledger_accounts" loan_control
WHERE line.journal_id = journal.id
  AND journal.source_ledger_transaction_id = entry.transaction_id
  AND entry.account_id = account.id
  AND account.product_id = product.id
  AND product.kind = 'LOAN'
  AND line.account_id = deposit_control.id
  AND deposit_control.code = '2100-' || journal.currency
  AND loan_control.code = '1200-' || journal.currency
  AND line.direction = entry.direction
  AND line.amount = entry.amount;
