import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, customers, ledgerEntries, ledgerTransactions, products } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { AccountStatement, TransactionView } from "@/modules/contracts";
import { validateStatementPeriod } from "@/modules/domain/statement-policy";
import { minorUnitsToMoney, moneyToMinorUnits, signedMoneyToMinorUnits } from "@/modules/domain/transfer-policy";
import { BankingError } from "./errors";

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
const customerName = (customer: typeof customers.$inferSelect) => customer.legalName ?? ([customer.givenName, customer.familyName].filter(Boolean).join(" ") || customer.shortName);

function periodMessage(code: string): string {
  if (code === "INVALID_PERIOD") return "The statement start date must be on or before the end date.";
  if (code === "PERIOD_TOO_LONG") return "A statement period cannot exceed 366 days.";
  return "Enter valid statement dates in YYYY-MM-DD format.";
}

export async function getAccountStatement(input: { accountNumber: string; fromDate: string; toDate: string }): Promise<AccountStatement> {
  await requireUser();
  const period = validateStatementPeriod(input.fromDate, input.toDate);
  if (!period.ok) throw new BankingError(period.code, periodMessage(period.code));
  const [owner] = await db.select({ account: bankAccounts, customer: customers, product: products }).from(bankAccounts)
    .innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .innerJoin(products, eq(bankAccounts.productId, products.id))
    .where(eq(bankAccounts.accountNumber, input.accountNumber)).limit(1);
  if (!owner) throw new BankingError("ACCOUNT_NOT_FOUND", "The account could not be found.");

  const rows = await db.select({ entry: ledgerEntries, transaction: ledgerTransactions }).from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
    .where(and(
      eq(ledgerEntries.accountId, owner.account.id),
      lte(ledgerTransactions.valueDate, period.toDate),
    ))
    .orderBy(asc(ledgerTransactions.valueDate), asc(ledgerTransactions.bookedAt), asc(ledgerTransactions.reference));
  const selected = rows.filter(({ transaction }) => transaction.valueDate >= period.fromDate);
  const prior = rows.filter(({ transaction }) => transaction.valueDate < period.fromDate).at(-1);
  let openingBalance: string;
  if (prior) openingBalance = prior.entry.balanceAfter;
  else if (selected[0]) {
    const first = selected[0];
    const after = signedMoneyToMinorUnits(first.entry.balanceAfter);
    const amount = moneyToMinorUnits(first.entry.amount);
    openingBalance = minorUnitsToMoney(first.entry.direction === "CREDIT" ? after - amount : after + amount);
  } else openingBalance = owner.account.balance;

  const entries: TransactionView[] = selected.map(({ entry, transaction }) => ({
    reference: transaction.reference,
    bookedAt: iso(transaction.bookedAt),
    valueDate: transaction.valueDate,
    description: transaction.description,
    type: transaction.type,
    direction: entry.direction,
    amount: entry.amount,
    currency: transaction.currency,
    balanceAfter: entry.balanceAfter,
    counterparty: transaction.counterparty,
    status: transaction.status,
  }));
  return {
    accountNumber: owner.account.accountNumber,
    customerNumber: owner.customer.customerNumber,
    customerName: customerName(owner.customer),
    productName: owner.product.name,
    currency: owner.account.currency,
    fromDate: period.fromDate,
    toDate: period.toDate,
    openingBalance,
    closingBalance: entries.at(-1)?.balanceAfter ?? openingBalance,
    generatedAt: new Date().toISOString(),
    entries,
  };
}
