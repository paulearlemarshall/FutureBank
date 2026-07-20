import "server-only";

import { desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  addresses, auditEvents, bankAccounts, beneficiaries, branches, contactPoints, customerRelationships,
  customerDocumentFiles, customers, identityDocuments, ledgerEntries, ledgerTransactions, loanDetails, loanRepayments, overdraftAlerts,
  overdraftFacilities, paymentOrders, products, workItems,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import type {
  AccountDetail, AccountListItem, AuditListItem, BeneficiaryView, CustomerDetail, CustomerListItem,
  DashboardSummary, ListOptions, ProductView, RelationshipView, TransactionView,
} from "./contracts";
import { getOverdraftFacility } from "./operations-queries";

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
const boundedLimit = (value?: number) => Math.min(Math.max(value ?? 50, 1), 200);
export const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");

function mapCustomer(row: typeof customers.$inferSelect): CustomerListItem {
  return {
    customerNumber: row.customerNumber,
    rimNumber: row.rimNumber,
    partyType: row.partyType,
    displayName: row.legalName ?? ([row.givenName, row.familyName].filter(Boolean).join(" ") || row.shortName),
    status: row.status,
    kycStatus: row.kycStatus,
    riskRating: row.riskRating,
    nationality: row.nationality,
    updatedAt: iso(row.updatedAt),
  };
}

type AccountJoined = {
  account: typeof bankAccounts.$inferSelect;
  customer: typeof customers.$inferSelect;
  product: typeof products.$inferSelect;
  branch: typeof branches.$inferSelect;
};

function mapAccount(row: AccountJoined): AccountListItem {
  return {
    accountNumber: row.account.accountNumber,
    customerNumber: row.customer.customerNumber,
    customerName: row.customer.legalName ?? ([row.customer.givenName, row.customer.familyName].filter(Boolean).join(" ") || row.customer.shortName),
    productCode: row.product.code,
    productName: row.product.name,
    kind: row.product.kind,
    currency: row.account.currency,
    balance: row.account.balance,
    availableBalance: row.account.availableBalance,
    status: row.account.status,
    readOnly: row.account.readOnly,
    openedAt: row.account.openedAt,
  };
}

export async function listCustomers(options: ListOptions = {}): Promise<CustomerListItem[]> {
  await requireUser();
  const query = options.query?.trim();
  const pattern = query ? `%${escapeLikePattern(query)}%` : "";
  const condition = query ? or(
    ilike(customers.customerNumber, pattern), ilike(customers.rimNumber, pattern), ilike(customers.shortName, pattern),
    ilike(customers.givenName, pattern), ilike(customers.familyName, pattern), ilike(customers.legalName, pattern),
    sql`exists (
      select 1 from identity_documents identity_search
      where identity_search.customer_id = ${customers.id}
        and identity_search.document_number ilike ${pattern} escape '\\'
    )`,
  ) : undefined;
  const rows = await db.select().from(customers).where(condition).orderBy(customers.customerNumber).limit(boundedLimit(options.limit)).offset(Math.max(options.offset ?? 0, 0));
  return rows.map(mapCustomer);
}

export async function getCustomer(customerNumber: string): Promise<CustomerDetail | null> {
  await requireUser();
  const [customer] = await db.select().from(customers).where(eq(customers.customerNumber, customerNumber)).limit(1);
  if (!customer) return null;
  const [addressRows, contactRows, identityRows, documentRows, relationshipRows, accountRows] = await Promise.all([
    db.select().from(addresses).where(eq(addresses.customerId, customer.id)).orderBy(addresses.type),
    db.select().from(contactPoints).where(eq(contactPoints.customerId, customer.id)).orderBy(desc(contactPoints.preferred), contactPoints.type),
    db.select().from(identityDocuments).where(eq(identityDocuments.customerId, customer.id)).orderBy(identityDocuments.type),
    db.select().from(customerDocumentFiles).where(eq(customerDocumentFiles.customerId, customer.id)).orderBy(customerDocumentFiles.slot),
    db.select().from(customerRelationships).where(eq(customerRelationships.customerId, customer.id)),
    queryAccounts(eq(bankAccounts.customerId, customer.id)),
  ]);
  const documentBySlot = new Map(documentRows.map((item) => [item.slot, item]));
  const relatedIds = relationshipRows.map((item) => item.relatedCustomerId);
  const relatedRows = relatedIds.length ? await db.select().from(customers).where(inArray(customers.id, relatedIds)) : [];
  const relatedMap = new Map(relatedRows.map((item) => [item.id, item]));
  const relationships: RelationshipView[] = relationshipRows.map((item) => {
    const related = relatedMap.get(item.relatedCustomerId)!;
    return {
      id: item.id,
      relatedCustomerNumber: related.customerNumber,
      relatedDisplayName: related.legalName ?? ([related.givenName, related.familyName].filter(Boolean).join(" ") || related.shortName),
      relationshipType: item.relationshipType,
      ownershipPercent: item.ownershipPercent,
      controlType: item.controlType,
      beneficialOwner: item.beneficialOwner,
      verificationStatus: item.verificationStatus,
    };
  });
  return {
    ...mapCustomer(customer),
    title: customer.title,
    givenName: customer.givenName,
    familyName: customer.familyName,
    legalName: customer.legalName,
    shortName: customer.shortName,
    dateOfBirth: customer.dateOfBirth,
    registrationNumber: customer.registrationNumber,
    gender: customer.gender,
    maritalStatus: customer.maritalStatus,
    residenceCountry: customer.residenceCountry,
    language: customer.language,
    sector: customer.sector,
    industry: customer.industry,
    taxId: customer.taxId,
    branchCode: customer.branchCode,
    relationshipManager: customer.relationshipManager,
    kycReviewDate: customer.kycReviewDate,
    addresses: addressRows.map((item) => ({ id: item.id, type: item.type, line1: item.line1, line2: item.line2, city: item.city, region: item.region, postalCode: item.postalCode, country: item.country })),
    contacts: contactRows.map((item) => ({ id: item.id, type: item.type, value: item.value, preferred: item.preferred })),
    identityDocuments: identityRows.map((item) => ({ id: item.id, type: item.type, documentNumber: item.documentNumber, issuingCountry: item.issuingCountry, issuedAt: item.issuedAt, expiresAt: item.expiresAt, verificationStatus: item.verificationStatus, verificationMethod: item.verificationMethod, expiryAlertAt: item.expiryAlertAt })),
    documents: (["PASSPORT", "NATIONAL_ID"] as const).map((slot) => {
      const item = documentBySlot.get(slot);
      return item ? { slot, filename: item.filename, mimeType: item.mimeType, sizeBytes: item.sizeBytes, uploadedBy: item.uploadedBy, uploadedAt: iso(item.uploadedAt) } : { slot, empty: true as const };
    }),
    relationships,
    accounts: accountRows.map(mapAccount),
  };
}

async function queryAccounts(condition?: ReturnType<typeof eq>): Promise<AccountJoined[]> {
  return db.select({ account: bankAccounts, customer: customers, product: products, branch: branches })
    .from(bankAccounts)
    .innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .innerJoin(products, eq(bankAccounts.productId, products.id))
    .innerJoin(branches, eq(bankAccounts.branchId, branches.id))
    .where(condition)
    .orderBy(bankAccounts.accountNumber);
}

export async function listAccounts(options: ListOptions = {}): Promise<AccountListItem[]> {
  await requireUser();
  const query = options.query?.trim();
  const pattern = query ? `%${escapeLikePattern(query)}%` : "";
  const condition = query ? or(
    ilike(bankAccounts.accountNumber, pattern), ilike(customers.customerNumber, pattern),
    ilike(customers.shortName, pattern), ilike(customers.legalName, pattern),
  ) : undefined;
  const rows = await db.select({ account: bankAccounts, customer: customers, product: products, branch: branches })
    .from(bankAccounts)
    .innerJoin(customers, eq(bankAccounts.customerId, customers.id))
    .innerJoin(products, eq(bankAccounts.productId, products.id))
    .innerJoin(branches, eq(bankAccounts.branchId, branches.id))
    .where(condition)
    .orderBy(bankAccounts.accountNumber)
    .limit(boundedLimit(options.limit))
    .offset(Math.max(options.offset ?? 0, 0));
  return rows.map(mapAccount);
}

export async function getAccount(accountNumber: string): Promise<AccountDetail | null> {
  await requireUser();
  const rows = await queryAccounts(eq(bankAccounts.accountNumber, accountNumber));
  const row = rows[0];
  if (!row) return null;
  const transactionRows = await db.select({ entry: ledgerEntries, transaction: ledgerTransactions })
    .from(ledgerEntries).innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
    .where(eq(ledgerEntries.accountId, row.account.id)).orderBy(desc(ledgerTransactions.bookedAt)).limit(200);
  const transactions: TransactionView[] = transactionRows.map(({ entry, transaction }) => ({
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
  const [loan] = await db.select().from(loanDetails).where(eq(loanDetails.accountId, row.account.id)).limit(1);
  const repayments = loan ? await db.select().from(loanRepayments).where(eq(loanRepayments.accountId, row.account.id)).orderBy(desc(loanRepayments.dueDate)) : [];
  const [facility] = await db.select({ reference: overdraftFacilities.reference }).from(overdraftFacilities)
    .where(sql`${overdraftFacilities.accountId} = ${row.account.id} and ${overdraftFacilities.status} in ('ACTIVE', 'PENDING_APPROVAL', 'PENDING_CHANGE', 'SUSPENDED')`)
    .orderBy(desc(overdraftFacilities.updatedAt)).limit(1);
  return {
    ...mapAccount(row),
    branchCode: row.branch.code,
    nickname: row.account.nickname,
    overdraft: facility ? await getOverdraftFacility(facility.reference) : null,
    maturityDate: row.account.maturityDate,
    transactions,
    loan: loan ? {
      originalPrincipal: loan.originalPrincipal,
      outstandingPrincipal: loan.outstandingPrincipal,
      interestRate: loan.interestRate,
      installmentAmount: loan.installmentAmount,
      nextPaymentDate: loan.nextPaymentDate,
      repayments: repayments.map((item) => ({ dueDate: item.dueDate, paidAt: item.paidAt, principal: item.principal, interest: item.interest, status: item.status })),
    } : null,
  };
}

export async function listBeneficiaries(options: { customerNumber?: string; limit?: number } = {}): Promise<BeneficiaryView[]> {
  await requireUser();
  const condition = options.customerNumber ? eq(customers.customerNumber, options.customerNumber) : undefined;
  const rows = await db.select({ beneficiary: beneficiaries, customerNumber: customers.customerNumber })
    .from(beneficiaries).innerJoin(customers, eq(beneficiaries.customerId, customers.id))
    .where(condition).orderBy(beneficiaries.name).limit(boundedLimit(options.limit));
  return rows.map(({ beneficiary, customerNumber }) => ({
    id: beneficiary.id, customerNumber, name: beneficiary.name, bankName: beneficiary.bankName,
    accountNumber: beneficiary.accountNumber, iban: beneficiary.iban, swiftBic: beneficiary.swiftBic,
    currency: beneficiary.currency, status: beneficiary.status, createdAt: iso(beneficiary.createdAt),
  }));
}

export async function listProducts(): Promise<ProductView[]> {
  await requireUser();
  const rows = await db.select().from(products).orderBy(products.code);
  return rows.map((item) => ({ code: item.code, name: item.name, kind: item.kind, currency: item.currency, interestRate: item.interestRate, minimumOpeningBalance: item.minimumOpeningBalance, active: item.active }));
}

export async function listAuditEvents(options: ListOptions = {}): Promise<AuditListItem[]> {
  await requireUser();
  const query = options.query?.trim();
  const pattern = query ? `%${escapeLikePattern(query)}%` : "";
  const condition = query ? or(
    ilike(auditEvents.actorUsername, pattern), ilike(auditEvents.action, pattern),
    ilike(auditEvents.entityReference, pattern), ilike(auditEvents.correlationId, pattern),
  ) : undefined;
  const rows = await db.select().from(auditEvents).where(condition).orderBy(desc(auditEvents.occurredAt)).limit(boundedLimit(options.limit)).offset(Math.max(options.offset ?? 0, 0));
  return rows.map((item) => ({ id: item.id, occurredAt: iso(item.occurredAt), actorUsername: item.actorUsername, action: item.action, entityType: item.entityType, entityReference: item.entityReference, correlationId: item.correlationId }));
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await requireUser();
  const [[customerCount], [accountStats], [kycCount], [paymentCount], [workCount], [pendingPaymentCount], [overdraftStats], [repeatUseCount], recentActivity] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(customers),
    db.select({ active: sql<number>`count(*) filter (where ${bankAccounts.status} = 'ACTIVE')::int`, deposits: sql<string>`coalesce(sum(${bankAccounts.balance}) filter (where ${products.kind} <> 'LOAN' and ${bankAccounts.status} <> 'CLOSED'), 0)::text` }).from(bankAccounts).innerJoin(products, eq(bankAccounts.productId, products.id)),
    db.select({ value: sql<number>`count(*)::int` }).from(customers).where(ne(customers.kycStatus, "APPROVED")),
    db.select({ value: sql<number>`count(*)::int` }).from(ledgerTransactions).where(sql`${ledgerTransactions.bookedAt}::date = current_date`),
    db.select({ value: sql<number>`count(*)::int` }).from(workItems).where(sql`${workItems.status} in ('OPEN', 'ASSIGNED')`),
    db.select({ value: sql<number>`count(*)::int` }).from(paymentOrders).where(eq(paymentOrders.status, "PENDING")),
    db.select({ value: sql<string>`coalesce(sum(${overdraftFacilities.approvedLimit}), 0)::text` }).from(overdraftFacilities).where(sql`${overdraftFacilities.status} in ('ACTIVE', 'SUSPENDED', 'PENDING_CHANGE')`),
    db.select({ value: sql<number>`count(*)::int` }).from(overdraftAlerts).where(sql`${overdraftAlerts.type} = 'REPEAT_USE' and ${overdraftAlerts.status} <> 'RESOLVED'`),
    listAuditEvents({ limit: 8 }),
  ]);
  return { customers: customerCount.value, activeAccounts: accountStats.active, totalDeposits: accountStats.deposits, pendingKycReviews: kycCount.value, paymentsToday: paymentCount.value, openWorkItems: workCount.value, pendingPayments: pendingPaymentCount.value, overdraftExposure: overdraftStats.value, repeatUseAlerts: repeatUseCount.value, recentActivity };
}
