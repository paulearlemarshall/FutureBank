import { eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import * as tables from "./schema";
import {
  baselineAccounts,
  baselineBeneficiaries,
  baselineBranches,
  baselineCustomers,
  baselineProducts,
  baselineTransactions,
  stableUuid,
  validateBaselineSeed,
} from "./seed-manifest";
import { minorUnitsToMoney, moneyToMinorUnits } from "@/modules/domain/transfer-policy";

type SeedDb = Database;

function customerId(customerNumber: string) { return stableUuid(`customer-${customerNumber}`); }
function bankAccountId(accountNumber: string) { return stableUuid(`account-${accountNumber}`); }
function productId(code: string) { return stableUuid(`product-${code}`); }
function branchId(code: string) { return stableUuid(`branch-${code}`); }

export async function clearBankingData(tx: SeedDb): Promise<void> {
  await tx.delete(tables.clearingEntries);
  await tx.delete(tables.ledgerEntries);
  await tx.delete(tables.ledgerTransactions);
  await tx.delete(tables.paymentOrders);
  await tx.delete(tables.loanRepayments);
  await tx.delete(tables.loanDetails);
  await tx.delete(tables.accountStatusHistory);
  await tx.delete(tables.beneficiaries);
  await tx.delete(tables.bankAccounts);
  await tx.delete(tables.clearingAccounts);
  await tx.delete(tables.customerRelationships);
  await tx.delete(tables.identityDocuments);
  await tx.delete(tables.contactPoints);
  await tx.delete(tables.addresses);
  await tx.delete(tables.auditEvents);
  await tx.delete(tables.customers);
  await tx.delete(tables.products);
  await tx.delete(tables.branches);
}

export async function seedBaseline(tx: SeedDb): Promise<void> {
  const errors = validateBaselineSeed();
  if (errors.length) throw new Error(`Invalid baseline seed: ${errors.join("; ")}`);

  await tx.insert(tables.branches).values(baselineBranches.map((item) => ({ id: branchId(item.code), ...item })));
  await tx.insert(tables.products).values(baselineProducts.map((item) => ({ id: productId(item.code), ...item })));
  await tx.insert(tables.customers).values(baselineCustomers.map((item) => ({ id: customerId(item.customerNumber), language: "English", ...item })));

  const addressRows = baselineCustomers.map((customer, index) => ({
    id: stableUuid(`address-${customer.customerNumber}`), customerId: customerId(customer.customerNumber), type: "PRIMARY",
    line1: index < 3 ? `${18 + index * 11} Example Avenue` : `${42 + index} Fictional Business Park`, line2: index % 2 ? "Suite 410" : null,
    city: customer.residenceCountry === "AE" ? "Dubai" : "London", region: customer.residenceCountry === "AE" ? "Dubai" : "Greater London",
    postalCode: customer.residenceCountry === "AE" ? `0000${index + 1}` : `EC${index + 1}A 1AA`, country: customer.residenceCountry,
  }));
  await tx.insert(tables.addresses).values(addressRows);
  await tx.insert(tables.contactPoints).values(baselineCustomers.flatMap((customer, index) => [
    { id: stableUuid(`contact-email-${customer.customerNumber}`), customerId: customerId(customer.customerNumber), type: "EMAIL", value: `demo.${index + 1}@futurebank.example`, preferred: true },
    { id: stableUuid(`contact-phone-${customer.customerNumber}`), customerId: customerId(customer.customerNumber), type: "MOBILE", value: customer.residenceCountry === "AE" ? `+9715000000${index}` : `+4477009000${index}`, preferred: false },
  ]));
  await tx.insert(tables.identityDocuments).values(baselineCustomers.map((customer, index) => ({
    id: stableUuid(`identity-${customer.customerNumber}`), customerId: customerId(customer.customerNumber),
    type: customer.partyType === "SME" ? "COMPANY_REGISTRATION" : "PASSPORT", documentNumber: customer.registrationNumber ?? `FICTP000${index + 1}`,
    issuingCountry: customer.nationality, issuedAt: `2021-0${index + 1}-15`, expiresAt: `2031-0${index + 1}-14`,
  })));
  await tx.insert(tables.customerRelationships).values([
    { id: stableUuid("rel-c4-c1"), customerId: customerId("C000004"), relatedCustomerId: customerId("C000001"), relationshipType: "BENEFICIAL_OWNER", ownershipPercent: "65.00" },
    { id: stableUuid("rel-c4-c3"), customerId: customerId("C000004"), relatedCustomerId: customerId("C000003"), relationshipType: "DIRECTOR", ownershipPercent: "35.00" },
    { id: stableUuid("rel-c5-c2"), customerId: customerId("C000005"), relatedCustomerId: customerId("C000002"), relationshipType: "BENEFICIAL_OWNER", ownershipPercent: "70.00" },
    { id: stableUuid("rel-c5-c3"), customerId: customerId("C000005"), relatedCustomerId: customerId("C000003"), relationshipType: "DIRECTOR", ownershipPercent: "30.00" },
  ]);

  await tx.insert(tables.bankAccounts).values(baselineAccounts.map((item) => {
    const product = baselineProducts.find((candidate) => candidate.code === item.productCode)!;
    return {
      id: bankAccountId(item.accountNumber), accountNumber: item.accountNumber, customerId: customerId(item.customerNumber),
      productId: productId(item.productCode), branchId: branchId(item.branchCode), nickname: item.nickname, currency: product.currency,
      balance: item.balance, availableBalance: item.balance, overdraftLimit: item.overdraftLimit, status: "ACTIVE" as const,
      readOnly: "readOnly" in item ? item.readOnly : false, openedAt: item.openedAt, maturityDate: "maturityDate" in item ? item.maturityDate : null,
    };
  }));
  await tx.insert(tables.accountStatusHistory).values(baselineAccounts.map((item) => ({
    id: stableUuid(`status-${item.accountNumber}`), accountId: bankAccountId(item.accountNumber), previousStatus: null,
    newStatus: "ACTIVE" as const, reason: "Baseline account opened", changedBy: "system.seed", changedAt: new Date(`${item.openedAt}T09:00:00.000Z`),
  })));

  await tx.insert(tables.beneficiaries).values(baselineBeneficiaries.map((item) => ({
    ...item, customerId: customerId(item.customerNumber), status: "ACTIVE" as const,
  })));

  const currencies = ["GBP", "AED", "USD", "EUR"];
  await tx.insert(tables.clearingAccounts).values(currencies.map((currency) => ({
    id: stableUuid(`clearing-${currency}`), code: `HIST-${currency}`, name: `Historical ${currency} Clearing`, currency, balance: "0.00",
  })));

  for (let offset = 0; offset < baselineTransactions.length; offset += 100) {
    await tx.insert(tables.ledgerTransactions).values(baselineTransactions.slice(offset, offset + 100).map((item) => ({
      id: item.id, reference: item.reference, bookedAt: new Date(item.bookedAt), valueDate: item.valueDate, description: item.description,
      type: item.type, status: "BOOKED" as const, currency: item.currency, amount: item.amount, counterparty: item.counterparty,
    })));
  }
  for (let offset = 0; offset < baselineTransactions.length; offset += 100) {
    const slice = baselineTransactions.slice(offset, offset + 100);
    await tx.insert(tables.ledgerEntries).values(slice.map((item) => ({
      id: stableUuid(`entry-${item.reference}`), transactionId: item.id, accountId: bankAccountId(item.accountNumber),
      direction: item.direction, amount: item.amount, balanceAfter: item.balanceAfter,
    })));
  }
  const clearingBalances = new Map(currencies.map((currency) => [currency, 0n]));
  const clearingRows = baselineTransactions.map((item) => {
    const prior = clearingBalances.get(item.currency) ?? 0n;
    const amount = moneyToMinorUnits(item.amount);
    const next = prior + (item.direction === "DEBIT" ? amount : -amount);
    clearingBalances.set(item.currency, next);
    return {
      id: stableUuid(`clearing-entry-${item.reference}`), transactionId: item.id, clearingAccountId: stableUuid(`clearing-${item.currency}`),
      direction: item.direction === "DEBIT" ? "CREDIT" as const : "DEBIT" as const, amount: item.amount, balanceAfter: minorUnitsToMoney(next),
    };
  });
  for (let offset = 0; offset < clearingRows.length; offset += 100) {
    await tx.insert(tables.clearingEntries).values(clearingRows.slice(offset, offset + 100));
  }
  for (const [currency, balance] of clearingBalances) {
    await tx.update(tables.clearingAccounts).set({ balance: minorUnitsToMoney(balance) }).where(eq(tables.clearingAccounts.id, stableUuid(`clearing-${currency}`)));
  }

  await tx.insert(tables.loanDetails).values([
    { accountId: bankAccountId("1000000011"), originalPrincipal: "90000.00", outstandingPrincipal: "58500.00", interestRate: "6.2500", installmentAmount: "1850.00", nextPaymentDate: "2026-08-15" },
    { accountId: bankAccountId("1000000014"), originalPrincipal: "180000.00", outstandingPrincipal: "115000.00", interestRate: "5.9000", installmentAmount: "4100.00", nextPaymentDate: "2026-08-10" },
  ]);
  await tx.insert(tables.loanRepayments).values(["1000000011", "1000000014"].flatMap((number, loanIndex) => Array.from({ length: 12 }, (_, index) => ({
    id: stableUuid(`repayment-${number}-${index}`), accountId: bankAccountId(number), dueDate: `2025-${((index + 7) % 12 + 1).toString().padStart(2, "0")}-15`,
    paidAt: `2025-${((index + 7) % 12 + 1).toString().padStart(2, "0")}-14`, principal: loanIndex ? "3550.00" : "1600.00", interest: loanIndex ? "550.00" : "250.00", status: "PAID",
  }))));

  await tx.insert(tables.auditEvents).values(baselineCustomers.map((customer, index) => ({
    id: stableUuid(`audit-customer-${customer.customerNumber}`), occurredAt: new Date(Date.UTC(2026, 6, 10 + index, 8, 30)), actorUsername: "system.seed",
    action: "CUSTOMER_BASELINE_CREATED", entityType: "CUSTOMER", entityReference: customer.customerNumber, correlationId: `SEED-${customer.customerNumber}`,
    before: null, after: { status: customer.status, kycStatus: customer.kycStatus },
  })));
}

export async function resetBaseline(database: Database, actor: { id: string; username: string }): Promise<void> {
  await database.transaction(async (transaction) => {
    const tx = transaction as unknown as SeedDb;
    await tx.execute(sql`select pg_advisory_xact_lock(738_204_019)`);
    await clearBankingData(tx);
    await seedBaseline(tx);
    await tx.insert(tables.auditEvents).values({
      actorUserId: actor.id,
      actorUsername: actor.username,
      action: "DEMO_RESET",
      entityType: "SYSTEM",
      entityReference: "FUTUREBANK",
      correlationId: crypto.randomUUID(),
      before: null,
      after: { baselineCustomers: 5, baselineAccounts: 14 },
    });
  });
}
