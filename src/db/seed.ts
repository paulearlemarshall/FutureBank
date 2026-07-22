import { eq, lt, sql } from "drizzle-orm";
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
import { removeUnreferencedNamespaceBlobs } from "@/lib/document-storage";
import { prepareSeedDocumentBlobs, type PreparedSeedDocument } from "./seed-documents";
import { createSeedTimeline } from "./seed-timeline";

type SeedDb = Database;

function customerId(customerNumber: string) { return stableUuid(`customer-${customerNumber}`); }
function bankAccountId(accountNumber: string) { return stableUuid(`account-${accountNumber}`); }
function productId(code: string) { return stableUuid(`product-${code}`); }
function branchId(code: string) { return stableUuid(`branch-${code}`); }
function staffId(key: "operator" | "supervisor" | "compliance" | "admin") { return stableUuid(`auth-user-${key}`); }
function kycCaseId(customerNumber: string) { return stableUuid(`kyc-case-${customerNumber}`); }
function facilityId(reference: string) { return stableUuid(`overdraft-${reference}`); }

export async function clearBankingData(tx: SeedDb): Promise<void> {
  await tx.delete(tables.workItemEvents);
  await tx.delete(tables.workItems);
  await tx.delete(tables.accountHolds);
  await tx.delete(tables.clearingEntries);
  await tx.delete(tables.ledgerEntries);
  await tx.delete(tables.ledgerTransactions);
  await tx.delete(tables.paymentOrders);
  await tx.delete(tables.overdraftAlerts);
  await tx.delete(tables.overdraftUsageSnapshots);
  await tx.delete(tables.overdraftLimitHistory);
  await tx.delete(tables.overdraftFacilities);
  await tx.delete(tables.loanRepayments);
  await tx.delete(tables.loanDetails);
  await tx.delete(tables.accountStatusHistory);
  await tx.delete(tables.beneficiaries);
  await tx.delete(tables.bankAccounts);
  await tx.delete(tables.clearingAccounts);
  await tx.delete(tables.customerRelationships);
  await tx.delete(tables.customerRestrictions);
  await tx.delete(tables.screeningChecks);
  await tx.delete(tables.kycEvidence);
  await tx.delete(tables.kycRiskFactors);
  await tx.delete(tables.customerDueDiligenceProfiles);
  await tx.delete(tables.kycCases);
  await tx.delete(tables.screeningWatchlistEntries);
  await tx.delete(tables.customerDocumentFiles);
  await tx.delete(tables.identityDocuments);
  await tx.delete(tables.contactPoints);
  await tx.delete(tables.addresses);
  await tx.delete(tables.auditEvents);
  await tx.delete(tables.customers);
  await tx.delete(tables.products);
  await tx.delete(tables.branches);
}

export async function seedBaseline(tx: SeedDb, preparedDocuments: PreparedSeedDocument[] = [], now = new Date()): Promise<void> {
  const errors = validateBaselineSeed();
  if (errors.length) throw new Error(`Invalid baseline seed: ${errors.join("; ")}`);
  const timeline = createSeedTimeline(now);
  const reviewOffsets: Record<string, number> = { C000001: 1095, C000002: 365, C000003: 24, C000004: 365, C000005: -1, C000006: 30, C000007: 30, C000008: 31, C000009: -30 };

  await tx.insert(tables.branches).values(baselineBranches.map((item) => ({ id: branchId(item.code), ...item })));
  await tx.insert(tables.products).values(baselineProducts.map((item) => ({ id: productId(item.code), ...item })));
  await tx.insert(tables.customers).values(baselineCustomers.map((item) => ({ id: customerId(item.customerNumber), rimNumber: `RIM${item.customerNumber.slice(1)}`, language: "English", ...item, kycReviewDate: timeline.date(reviewOffsets[item.customerNumber]) })));

  if (preparedDocuments.length) {
    await tx.insert(tables.customerDocumentFiles).values(preparedDocuments.map((document) => ({
      id: stableUuid(`customer-document-C000001-${document.slot}`), customerId: customerId("C000001"), slot: document.slot,
      filename: document.filename, mimeType: document.mimeType, sizeBytes: document.sizeBytes, blobUrl: document.blobUrl,
      blobPathname: document.blobPathname, blobEtag: document.blobEtag, sha256: document.sha256,
      uploadedBy: "system.seed", uploadedAt: new Date("2026-07-20T08:00:00.000Z"), isSeeded: true,
      createdAt: new Date("2026-07-20T08:00:00.000Z"), updatedAt: new Date("2026-07-20T08:00:00.000Z"),
    })));
  }

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
  await tx.insert(tables.identityDocuments).values(baselineCustomers.flatMap((customer, index) => {
    const documents = customer.partyType === "SME"
      ? [{ type: customer.residenceCountry === "AE" ? "TRADE_LICENSE" : "COMPANY_REGISTRATION", number: customer.registrationNumber!, country: customer.residenceCountry }]
      : [
          { type: "PASSPORT", number: `FICT-P-${customer.customerNumber.slice(1)}`, country: customer.nationality },
          ...(customer.residenceCountry === "AE" ? [{ type: "EMIRATES_ID", number: `784-FICT-${customer.customerNumber.slice(-4)}`, country: "AE" }] : []),
        ];
    return documents.map((document, documentIndex) => ({
      id: stableUuid(`identity-${customer.customerNumber}-${document.type}`), customerId: customerId(customer.customerNumber),
      type: document.type, documentNumber: document.number, issuingCountry: document.country, issuedAt: `2021-0${index + 1}-15`,
      expiresAt: customer.customerNumber === "C000009" ? timeline.date(-30) : customer.customerNumber === "C000003" && document.type === "EMIRATES_ID" ? timeline.date(20) : timeline.date(1825 + index),
      verificationStatus: customer.customerNumber === "C000006" ? "NOT_VERIFIED" as const : customer.customerNumber === "C000007" && document.type === "EMIRATES_ID" ? "PENDING" as const : customer.customerNumber === "C000009" ? "EXPIRED" as const : "VERIFIED" as const,
      verificationMethod: customer.customerNumber === "C000006" ? null : "Fictional document inspection",
      verifiedBy: ["C000006", "C000007"].includes(customer.customerNumber) && document.type === "EMIRATES_ID" ? null : customer.customerNumber === "C000006" ? null : staffId("operator"),
      verifiedAt: ["C000006", "C000007"].includes(customer.customerNumber) && document.type === "EMIRATES_ID" ? null : customer.customerNumber === "C000006" ? null : new Date("2026-07-10T09:00:00.000Z"),
      expiryAlertAt: customer.customerNumber === "C000009" ? timeline.date(-60) : customer.customerNumber === "C000003" && document.type === "EMIRATES_ID" ? timeline.date(0) : timeline.date(1460 + index + documentIndex),
    }));
  }));
  await tx.insert(tables.customerRelationships).values([
    { id: stableUuid("rel-c4-c1"), customerId: customerId("C000004"), relatedCustomerId: customerId("C000001"), relationshipType: "BENEFICIAL_OWNER", ownershipPercent: "65.00", controlType: "OWNERSHIP", beneficialOwner: true, verificationStatus: "VERIFIED" as const },
    { id: stableUuid("rel-c4-c3"), customerId: customerId("C000004"), relatedCustomerId: customerId("C000003"), relationshipType: "DIRECTOR", ownershipPercent: "35.00", controlType: "BOARD_CONTROL", beneficialOwner: true, verificationStatus: "VERIFIED" as const },
    { id: stableUuid("rel-c5-c2"), customerId: customerId("C000005"), relatedCustomerId: customerId("C000002"), relationshipType: "BENEFICIAL_OWNER", ownershipPercent: "70.00", controlType: "OWNERSHIP", beneficialOwner: true, verificationStatus: "VERIFIED" as const },
    { id: stableUuid("rel-c5-c3"), customerId: customerId("C000005"), relatedCustomerId: customerId("C000003"), relationshipType: "DIRECTOR", ownershipPercent: "30.00", controlType: "BOARD_CONTROL", beneficialOwner: false, verificationStatus: "VERIFIED" as const },
  ]);

  const caseRows = [
    { customerNumber: "C000001", reference: "KYC-000001", type: "PERIODIC_REVIEW" as const, jurisdiction: "GB", status: "APPROVED" as const, score: 0, calculated: "LOW" as const, final: "LOW" as const, edd: false, dueAt: "2026-07-15T17:00:00.000Z", submittedAt: "2026-07-11T10:00:00.000Z", decidedAt: "2026-07-12T12:00:00.000Z", decidedBy: staffId("compliance"), comment: "Standard due diligence complete." },
    { customerNumber: "C000002", reference: "KYC-000002", type: "TRIGGER_EVENT" as const, jurisdiction: "AE", status: "APPROVED" as const, score: 40, calculated: "MEDIUM" as const, final: "MEDIUM" as const, edd: true, dueAt: "2026-07-16T17:00:00.000Z", submittedAt: "2026-07-12T10:00:00.000Z", decidedAt: "2026-07-13T12:00:00.000Z", decidedBy: staffId("compliance"), comment: "PEP relationship approved after EDD and source-of-wealth review." },
    { customerNumber: "C000003", reference: "KYC-000003", type: "PERIODIC_REVIEW" as const, jurisdiction: "AE", status: "AWAITING_INFORMATION" as const, score: 0, calculated: "LOW" as const, final: null, edd: false, dueAt: timeline.instant(25, 17).toISOString(), submittedAt: null, decidedAt: null, decidedBy: null, comment: null },
    { customerNumber: "C000004", reference: "KYC-000004", type: "PERIODIC_REVIEW" as const, jurisdiction: "GB", status: "APPROVED" as const, score: 15, calculated: "LOW" as const, final: "MEDIUM" as const, edd: false, dueAt: "2026-07-17T17:00:00.000Z", submittedAt: "2026-07-13T10:00:00.000Z", decidedAt: "2026-07-14T12:00:00.000Z", decidedBy: staffId("compliance"), comment: "Ownership verified; sanctions candidate resolved as a false positive." },
    { customerNumber: "C000005", reference: "KYC-000005", type: "TRIGGER_EVENT" as const, jurisdiction: "AE", status: "REJECTED" as const, score: 85, calculated: "HIGH" as const, final: "HIGH" as const, edd: true, dueAt: "2026-07-18T17:00:00.000Z", submittedAt: "2026-07-14T10:00:00.000Z", decidedAt: "2026-07-15T12:00:00.000Z", decidedBy: staffId("compliance"), comment: "Rejected following a confirmed fictional sanctions result." },
    { customerNumber: "C000007", reference: "KYC-000007", type: "PERIODIC_REVIEW" as const, jurisdiction: "AE", status: "IN_PROGRESS" as const, score: 20, calculated: "LOW" as const, final: null, edd: false, dueAt: timeline.instant(30, 17).toISOString(), submittedAt: null, decidedAt: null, decidedBy: null, comment: null },
    { customerNumber: "C000008", reference: "KYC-000008", type: "ONBOARDING" as const, jurisdiction: "GB", status: "PENDING_APPROVAL" as const, score: 15, calculated: "LOW" as const, final: null, edd: false, dueAt: timeline.instant(2, 17).toISOString(), submittedAt: timeline.instant(0, 11).toISOString(), decidedAt: null, decidedBy: null, comment: null },
    { customerNumber: "C000009", reference: "KYC-000009", type: "PERIODIC_REVIEW" as const, jurisdiction: "AE", status: "APPROVED" as const, score: 50, calculated: "HIGH" as const, final: "HIGH" as const, edd: true, dueAt: "2025-06-30T17:00:00.000Z", submittedAt: "2025-06-20T10:00:00.000Z", decidedAt: "2025-06-25T12:00:00.000Z", decidedBy: staffId("compliance"), comment: "Previously approved; mandatory evidence has since expired." },
  ];
  await tx.insert(tables.kycCases).values(caseRows.map((item) => ({
    id: kycCaseId(item.customerNumber), reference: item.reference, customerId: customerId(item.customerNumber), type: item.type,
    jurisdiction: item.jurisdiction, status: item.status, calculatedRiskScore: item.score, calculatedRiskRating: item.calculated,
    finalRiskRating: item.final, enhancedDueDiligence: item.edd,
    requirements: ["C000003", "C000007", "C000009"].includes(item.customerNumber)
      ? [{ code: "EMIRATES_ID", label: "Emirates ID", mandatory: true }, { code: "PASSPORT", label: "Passport", mandatory: true }, { code: "RESIDENCY", label: "Residency evidence", mandatory: true }]
      : baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME"
        ? [{ code: "INCORPORATION", label: "Trade licence or incorporation evidence", mandatory: true }, { code: "OWNERSHIP", label: "Ownership and control structure", mandatory: true }, { code: "CONTROLLERS", label: "Directors and authorised signatories", mandatory: true }, { code: "BENEFICIAL_OWNERS", label: "Verified beneficial owners", mandatory: true }]
        : [{ code: "IDENTITY", label: "Identity evidence", mandatory: true }, { code: "ADDRESS", label: "Address evidence", mandatory: true }],
    dueAt: new Date(item.dueAt), submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
    decidedAt: item.decidedAt ? new Date(item.decidedAt) : null, createdBy: staffId("operator"), decidedBy: item.decidedBy, decisionComment: item.comment,
  })));
  await tx.insert(tables.customerDueDiligenceProfiles).values(caseRows.map((item) => ({
    id: stableUuid(`cdd-${item.customerNumber}`), kycCaseId: kycCaseId(item.customerNumber),
    accountPurpose: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "Business operations and supplier payments" : "Daily banking, savings and household payments",
    occupationOrBusiness: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)!.industry,
    expectedMonthlyCredits: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "250000.00" : "25000.00",
    expectedMonthlyDebits: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "220000.00" : "18000.00", expectedCountries: item.jurisdiction === "AE" ? ["AE", "GB", "IN"] : ["GB", "IE", "FR"],
    cashUsage: item.customerNumber === "C000005" ? "HIGH" : "LOW", sourceOfFunds: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "Trading receipts" : "Salary and investments",
    sourceOfWealth: item.customerNumber === "C000002" ? "Family business interests and investments (fictional)" : baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "Retained business earnings" : "Employment income and savings",
    incomeOrTurnoverBand: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "1M-5M" : "100K-250K", netWorthBand: baselineCustomers.find((customer) => customer.customerNumber === item.customerNumber)?.partyType === "SME" ? "1M-5M" : "250K-1M",
  })));
  await tx.insert(tables.kycRiskFactors).values([
    { id: stableUuid("risk-c2-pep"), kycCaseId: kycCaseId("C000002"), category: "CUSTOMER", rule: "PEP", score: 40, explanation: "Fictional domestic PEP relationship." },
    { id: stableUuid("risk-c4-ownership"), kycCaseId: kycCaseId("C000004"), category: "OWNERSHIP", rule: "COMPLEX_OWNERSHIP", score: 15, explanation: "Multiple controllers require enhanced ownership verification." },
    { id: stableUuid("risk-c5-sanctions"), kycCaseId: kycCaseId("C000005"), category: "SCREENING", rule: "HIGH_RISK_GEOGRAPHY", score: 20, explanation: "Fictional high-risk geography exposure." },
    { id: stableUuid("risk-c5-pep"), kycCaseId: kycCaseId("C000005"), category: "SCREENING", rule: "PEP", score: 40, explanation: "Fictional connected PEP factor." },
    { id: stableUuid("risk-c5-media"), kycCaseId: kycCaseId("C000005"), category: "SCREENING", rule: "CONFIRMED_ADVERSE_MEDIA", score: 25, explanation: "Confirmed fictional adverse-media result." },
    { id: stableUuid("risk-c7-geography"), kycCaseId: kycCaseId("C000007"), category: "GEOGRAPHY", rule: "HIGH_RISK_GEOGRAPHY", score: 20, explanation: "Fictional geography factor pending Compliance review." },
    { id: stableUuid("risk-c8-ownership"), kycCaseId: kycCaseId("C000008"), category: "OWNERSHIP", rule: "COMPLEX_OWNERSHIP", score: 15, explanation: "Layered fictional ownership structure." },
    { id: stableUuid("risk-c9-geography"), kycCaseId: kycCaseId("C000009"), category: "GEOGRAPHY", rule: "HIGH_RISK_GEOGRAPHY", score: 20, explanation: "Fictional high-risk geography exposure." },
    { id: stableUuid("risk-c9-cash"), kycCaseId: kycCaseId("C000009"), category: "ACTIVITY", rule: "CASH_INTENSIVE", score: 10, explanation: "Cash-intensive hospitality activity." },
    { id: stableUuid("risk-c9-media"), kycCaseId: kycCaseId("C000009"), category: "SCREENING", rule: "CONFIRMED_ADVERSE_MEDIA", score: 25, explanation: "Fictional adverse-media history." },
  ]);
  const evidenceRows = caseRows.flatMap((item) => {
    const customer = baselineCustomers.find((candidate) => candidate.customerNumber === item.customerNumber)!;
    const types = ["C000003", "C000007", "C000009"].includes(item.customerNumber) ? ["EMIRATES_ID", "PASSPORT", "RESIDENCY"] : customer.partyType === "SME" ? ["INCORPORATION", "OWNERSHIP", "CONTROLLERS", "BENEFICIAL_OWNERS"] : ["IDENTITY", "ADDRESS"];
    return types.map((evidenceType, index) => ({
      id: stableUuid(`evidence-${item.customerNumber}-${evidenceType}`), reference: `EVD-${item.customerNumber.slice(-3)}-${index + 1}`,
      kycCaseId: kycCaseId(item.customerNumber), evidenceType, documentReference: `FICT-${item.customerNumber}-${evidenceType}`,
      source: "Customer supplied fictional metadata", receivedAt: item.customerNumber === "C000009" ? "2024-06-10" : timeline.date(-10),
      verificationStatus: item.customerNumber === "C000009" ? "EXPIRED" as const : ["C000003", "C000007"].includes(item.customerNumber) && evidenceType === "RESIDENCY" ? "PENDING" as const : "VERIFIED" as const,
      verifiedBy: ["C000003", "C000007"].includes(item.customerNumber) && evidenceType === "RESIDENCY" ? null : staffId("operator"),
      verifiedAt: ["C000003", "C000007"].includes(item.customerNumber) && evidenceType === "RESIDENCY" ? null : item.customerNumber === "C000009" ? new Date("2024-06-11T10:00:00.000Z") : timeline.instant(-9, 10),
      expiresAt: item.customerNumber === "C000009" ? timeline.date(-30) : item.customerNumber === "C000003" && evidenceType === "EMIRATES_ID" ? timeline.date(20) : timeline.date(730),
      reviewerNotes: item.customerNumber === "C000009" ? "Evidence expired; relationship inactive and debits blocked." : ["C000003", "C000007"].includes(item.customerNumber) && evidenceType === "RESIDENCY" ? "Updated residency evidence requested." : "Fictional evidence verified for demonstration.",
    }));
  });
  await tx.insert(tables.kycEvidence).values(evidenceRows);
  await tx.insert(tables.screeningWatchlistEntries).values([
    { id: stableUuid("watch-pep-omar"), reference: "FWL-PEP-001", screeningType: "PEP", subjectName: "Omar Al Mansoori", aliases: ["Omar Mansoori"], country: "AE", dateOfBirth: "1979-11-03", details: "Fictional PEP entry for demonstration." },
    { id: stableUuid("watch-false-northstar"), reference: "FWL-SAN-002", screeningType: "SANCTIONS", subjectName: "North Star Logistic Holdings", aliases: ["Northstar Logistics"], country: "US", details: "Fictional near-name entry used for false-positive resolution." },
    { id: stableUuid("watch-crescent-sanctions"), reference: "FWL-SAN-003", screeningType: "SANCTIONS", subjectName: "Crescent Digital Trading FZ-LLC", aliases: ["Crescent Digital"], country: "AE", details: "Fictional sanctions entry for a blocked demo scenario." },
    { id: stableUuid("watch-crescent-media"), reference: "FWL-MEDIA-004", screeningType: "ADVERSE_MEDIA", subjectName: "Crescent Digital Trading FZ-LLC", aliases: [], country: "AE", details: "Fictional adverse-media entry for demonstration." },
    { id: stableUuid("watch-yousef-possible"), reference: "FWL-SAN-005", screeningType: "SANCTIONS", subjectName: "Yusuf Al Haddad", aliases: ["Yousef Haddad"], country: "JO", details: "Fictional near-name entry requiring Compliance resolution." },
  ]);
  await tx.insert(tables.screeningChecks).values([
    { id: stableUuid("screen-c1-clear"), reference: "SCR-000001", kycCaseId: kycCaseId("C000001"), customerId: customerId("C000001"), subjectType: "CUSTOMER", subjectReference: "C000001", subjectName: "Amelia Hart", screeningType: "SANCTIONS", matchScore: 0, outcome: "CLEAR" },
    { id: stableUuid("screen-c2-pep"), reference: "SCR-000002", kycCaseId: kycCaseId("C000002"), customerId: customerId("C000002"), subjectType: "CUSTOMER", subjectReference: "C000002", subjectName: "Omar Al Mansoori", screeningType: "PEP", matchScore: 100, outcome: "CONFIRMED_MATCH", resolvedBy: staffId("compliance"), resolvedAt: new Date("2026-07-13T11:00:00.000Z"), resolutionComment: "PEP confirmed; EDD completed. PEP status is not a sanctions rejection." },
    { id: stableUuid("screen-c4-false"), reference: "SCR-000004", kycCaseId: kycCaseId("C000004"), customerId: customerId("C000004"), subjectType: "CUSTOMER", subjectReference: "C000004", subjectName: "Northstar Sustainable Logistics Ltd", screeningType: "SANCTIONS", matchScore: 82, outcome: "FALSE_POSITIVE", resolvedBy: staffId("compliance"), resolvedAt: new Date("2026-07-14T11:00:00.000Z"), resolutionComment: "Different legal entity, country and registration number." },
    { id: stableUuid("screen-c5-sanctions"), reference: "SCR-000005", kycCaseId: kycCaseId("C000005"), customerId: customerId("C000005"), subjectType: "CUSTOMER", subjectReference: "C000005", subjectName: "Crescent Digital Trading FZ-LLC", screeningType: "SANCTIONS", matchScore: 100, outcome: "CONFIRMED_MATCH", resolvedBy: staffId("compliance"), resolvedAt: new Date("2026-07-15T11:00:00.000Z"), resolutionComment: "Confirmed fictional match; relationship rejected and debit block applied." },
    { id: stableUuid("screen-c5-media"), reference: "SCR-000006", kycCaseId: kycCaseId("C000005"), customerId: customerId("C000005"), subjectType: "CUSTOMER", subjectReference: "C000005", subjectName: "Crescent Digital Trading FZ-LLC", screeningType: "ADVERSE_MEDIA", matchScore: 96, outcome: "CONFIRMED_MATCH", resolvedBy: staffId("compliance"), resolvedAt: new Date("2026-07-15T11:05:00.000Z"), resolutionComment: "Confirmed fictional adverse-media subject." },
    { id: stableUuid("screen-c7-possible"), reference: "SCR-000007", kycCaseId: kycCaseId("C000007"), customerId: customerId("C000007"), subjectType: "CUSTOMER", subjectReference: "C000007", subjectName: "Yousef Haddad", screeningType: "SANCTIONS", matchScore: 76, candidateDetails: { watchlistReference: "FWL-SAN-005", fictional: true }, outcome: "POSSIBLE_MATCH" },
    { id: stableUuid("screen-c8-clear"), reference: "SCR-000008", kycCaseId: kycCaseId("C000008"), customerId: customerId("C000008"), subjectType: "CUSTOMER", subjectReference: "C000008", subjectName: "Harbour Green Energy Ltd", screeningType: "SANCTIONS", matchScore: 0, outcome: "CLEAR" },
    { id: stableUuid("screen-c9-clear"), reference: "SCR-000009", kycCaseId: kycCaseId("C000009"), customerId: customerId("C000009"), subjectType: "CUSTOMER", subjectReference: "C000009", subjectName: "Layla Rahman", screeningType: "SANCTIONS", matchScore: 0, outcome: "CLEAR" },
  ]);
  await tx.insert(tables.customerRestrictions).values([
    { id: stableUuid("restriction-c5-debit"), reference: "RST-000001", customerId: customerId("C000005"), type: "DEBIT_BLOCK" as const, reason: "Confirmed fictional sanctions result", sourceKycCaseId: kycCaseId("C000005"), effectiveFrom: new Date("2026-07-15T12:00:00.000Z"), appliedBy: staffId("compliance"), active: true },
    { id: stableUuid("restriction-c6-onboarding"), reference: "RST-000002", customerId: customerId("C000006"), type: "ONBOARDING_HOLD" as const, reason: "KYC has not started; account opening is unavailable.", sourceKycCaseId: null, effectiveFrom: new Date("2026-07-20T08:00:00.000Z"), appliedBy: staffId("compliance"), active: true },
    { id: stableUuid("restriction-c7-review"), reference: "RST-000003", customerId: customerId("C000007"), type: "PAYMENT_REVIEW" as const, reason: "KYC review and fictional possible match are unresolved.", sourceKycCaseId: kycCaseId("C000007"), effectiveFrom: new Date("2026-07-20T08:30:00.000Z"), appliedBy: staffId("compliance"), active: true },
    { id: stableUuid("restriction-c9-debit"), reference: "RST-000004", customerId: customerId("C000009"), type: "DEBIT_BLOCK" as const, reason: "Mandatory KYC evidence expired.", sourceKycCaseId: kycCaseId("C000009"), effectiveFrom: new Date("2026-07-01T08:00:00.000Z"), appliedBy: staffId("compliance"), active: true },
  ]);

  await tx.insert(tables.bankAccounts).values(baselineAccounts.map((item) => {
    const product = baselineProducts.find((candidate) => candidate.code === item.productCode)!;
    return {
      id: bankAccountId(item.accountNumber), accountNumber: item.accountNumber, customerId: customerId(item.customerNumber),
      productId: productId(item.productCode), branchId: branchId(item.branchCode), nickname: item.nickname, currency: product.currency,
      balance: item.balance, availableBalance: item.balance, status: "status" in item ? item.status : "ACTIVE" as const,
      readOnly: "readOnly" in item ? item.readOnly : false, openedAt: item.openedAt, maturityDate: "maturityDate" in item ? item.maturityDate : null,
      closedAt: "closedAt" in item ? new Date(item.closedAt) : null,
    };
  }));
  const projectedAvailableBalances: Record<string, string> = {
    "1000000001": "759.50",
    "1000000004": "69650.25",
    "1000000009": "392190.44",
    "1000000019": "13000.00",
  };
  for (const [accountNumber, availableBalance] of Object.entries(projectedAvailableBalances)) {
    await tx.update(tables.bankAccounts).set({ availableBalance }).where(eq(tables.bankAccounts.id, bankAccountId(accountNumber)));
  }
  await tx.insert(tables.accountStatusHistory).values(baselineAccounts.map((item) => ({
    id: stableUuid(`status-${item.accountNumber}`), accountId: bankAccountId(item.accountNumber), previousStatus: null,
    newStatus: "ACTIVE" as const, reason: "Baseline account opened", changedBy: "system.seed", changedAt: new Date(`${item.openedAt}T09:00:00.000Z`),
  })));
  await tx.insert(tables.accountStatusHistory).values([
    { id: stableUuid("status-blocked-1000000017"), accountId: bankAccountId("1000000017"), previousStatus: "ACTIVE", newStatus: "BLOCKED", reason: "KYC evidence expired; debit activity blocked.", changedBy: "bp.compliance", changedAt: new Date("2026-07-01T08:05:00.000Z") },
    { id: stableUuid("status-closed-1000000018"), accountId: bankAccountId("1000000018"), previousStatus: "ACTIVE", newStatus: "CLOSED", reason: "Customer-requested closure after balance reached zero.", changedBy: "bp.supervisor", changedAt: new Date("2026-05-31T16:00:00.000Z") },
  ]);

  const facilities = [
    { reference: "ODF-000001", accountNumber: "1000000001", requestedLimit: "1000.00", approvedLimit: "1000.00", currency: "GBP", rate: "19.9000", purpose: "Household cash-flow buffer", riskGrade: "A", status: "ACTIVE" as const, startDate: "2025-08-01", reviewDate: timeline.date(10), expiryDate: timeline.date(365), approvedBy: staffId("supervisor") },
    { reference: "ODF-000002", accountNumber: "1000000004", requestedLimit: "10000.00", approvedLimit: "10000.00", currency: "AED", rate: "12.5000", purpose: "Personal liquidity buffer", riskGrade: "B", status: "ACTIVE" as const, startDate: "2025-10-01", reviewDate: timeline.date(70), expiryDate: timeline.date(435), approvedBy: staffId("supervisor") },
    { reference: "ODF-000003", accountNumber: "1000000007", requestedLimit: "7500.00", approvedLimit: "0.00", currency: "AED", rate: "13.2500", purpose: "Short-term household expenses", riskGrade: "B", status: "PENDING_APPROVAL" as const, startDate: null, reviewDate: null, expiryDate: null, approvedBy: null },
    { reference: "ODF-000004", accountNumber: "1000000009", requestedLimit: "50000.00", approvedLimit: "50000.00", currency: "GBP", rate: "11.7500", purpose: "Working capital", riskGrade: "B", status: "ACTIVE" as const, startDate: "2025-09-01", reviewDate: timeline.date(40), expiryDate: timeline.date(405), approvedBy: staffId("supervisor") },
    { reference: "ODF-000005", accountNumber: "1000000012", requestedLimit: "100000.00", approvedLimit: "100000.00", currency: "AED", rate: "14.5000", purpose: "Supplier settlement buffer", riskGrade: "D", status: "SUSPENDED" as const, startDate: "2025-05-01", reviewDate: timeline.date(-7), expiryDate: timeline.date(300), approvedBy: staffId("supervisor") },
    { reference: "ODF-000006", accountNumber: "1000000019", requestedLimit: "40000.00", approvedLimit: "25000.00", currency: "GBP", rate: "12.2500", purpose: "Seasonal working-capital increase", riskGrade: "B", status: "PENDING_CHANGE" as const, startDate: "2025-12-01", reviewDate: timeline.date(120), expiryDate: timeline.date(485), approvedBy: staffId("supervisor") },
    { reference: "ODF-000007", accountNumber: "1000000019", requestedLimit: "15000.00", approvedLimit: "0.00", currency: "GBP", rate: "13.5000", purpose: "Earlier expansion proposal", riskGrade: "C", status: "DECLINED" as const, startDate: null, reviewDate: null, expiryDate: null, approvedBy: staffId("supervisor") },
    { reference: "ODF-000008", accountNumber: "1000000019", requestedLimit: "10000.00", approvedLimit: "10000.00", currency: "GBP", rate: "14.0000", purpose: "Completed short-term contract", riskGrade: "B", status: "CLOSED" as const, startDate: "2023-01-01", reviewDate: "2024-01-01", expiryDate: "2025-01-01", approvedBy: staffId("supervisor") },
    { reference: "ODF-000009", accountNumber: "1000000019", requestedLimit: "20000.00", approvedLimit: "20000.00", currency: "GBP", rate: "13.7500", purpose: "Expired seasonal facility", riskGrade: "B", status: "EXPIRED" as const, startDate: "2024-01-01", reviewDate: "2025-01-01", expiryDate: "2025-12-31", approvedBy: staffId("supervisor") },
  ];
  await tx.insert(tables.overdraftFacilities).values(facilities.map((item) => ({
    id: facilityId(item.reference), reference: item.reference, accountId: bankAccountId(item.accountNumber), requestedLimit: item.requestedLimit,
    approvedLimit: item.approvedLimit, currency: item.currency, annualInterestRate: item.rate, purpose: item.purpose,
    affordabilityInformation: { monthlyIncomeOrTurnover: item.currency === "AED" ? "75000.00" : "25000.00", monthlyCommittedOutgoings: item.currency === "AED" ? "42000.00" : "14000.00", fictional: true },
    riskGrade: item.riskGrade, status: item.status, startDate: item.startDate, reviewDate: item.reviewDate, expiryDate: item.expiryDate,
    createdBy: staffId("operator"), approvedBy: item.approvedBy, submittedAt: new Date("2026-07-18T09:00:00.000Z"),
    decidedAt: item.approvedBy ? new Date("2026-07-18T12:00:00.000Z") : null, decisionComment: item.status === "DECLINED" ? "Declined after affordability review under FutureBank demo policy." : item.approvedBy ? "Approved under FutureBank demo policy." : null,
  })));
  await tx.insert(tables.overdraftLimitHistory).values(facilities.filter((item) => item.approvedBy && item.startDate && item.approvedLimit !== "0.00").map((item) => ({
    id: stableUuid(`od-history-${item.reference}`), facilityId: facilityId(item.reference), previousLimit: "0.00", newLimit: item.approvedLimit,
    reason: "Initial arranged overdraft approval", effectiveDate: item.startDate!, approvedBy: item.approvedBy!,
  })));
  await tx.insert(tables.overdraftUsageSnapshots).values([
    { id: stableUuid("od-snapshot-1"), facilityId: facilityId("ODF-000001"), snapshotDate: "2026-07-18", ledgerBalance: "-180.00", utilization: "180.00", approvedLimit: "1000.00", regularCredits30Days: "4200.00" },
    { id: stableUuid("od-snapshot-2"), facilityId: facilityId("ODF-000001"), snapshotDate: "2026-07-19", ledgerBalance: "-220.00", utilization: "220.00", approvedLimit: "1000.00", regularCredits30Days: "4200.00" },
    { id: stableUuid("od-snapshot-3"), facilityId: facilityId("ODF-000001"), snapshotDate: "2026-07-20", ledgerBalance: "-240.50", utilization: "240.50", approvedLimit: "1000.00", regularCredits30Days: "3150.00" },
    { id: stableUuid("od-snapshot-c5"), facilityId: facilityId("ODF-000005"), snapshotDate: "2026-07-20", ledgerBalance: "895420.32", utilization: "0.00", approvedLimit: "100000.00", regularCredits30Days: "185000.00" },
    { id: stableUuid("od-snapshot-change-1"), facilityId: facilityId("ODF-000006"), snapshotDate: "2026-06-30", ledgerBalance: "-22000.00", utilization: "22000.00", approvedLimit: "25000.00", regularCredits30Days: "75000.00" },
    { id: stableUuid("od-snapshot-change-2"), facilityId: facilityId("ODF-000006"), snapshotDate: "2026-07-20", ledgerBalance: "-12000.00", utilization: "12000.00", approvedLimit: "25000.00", regularCredits30Days: "90000.00" },
    { id: stableUuid("od-snapshot-expired"), facilityId: facilityId("ODF-000009"), snapshotDate: "2025-12-31", ledgerBalance: "0.00", utilization: "0.00", approvedLimit: "20000.00", regularCredits30Days: "82000.00" },
  ]);
  await tx.insert(tables.overdraftAlerts).values([
    { id: stableUuid("od-alert-repeat"), reference: "ODA-000001", facilityId: facilityId("ODF-000001"), type: "REPEAT_USE", status: "OPEN", severity: "HIGH", detectedAt: timeline.instant(-2, 6), dueAt: timeline.instant(3, 17), details: "FutureBank demo policy: regular credits fell by 25% while utilization increased." },
    { id: stableUuid("od-alert-c5"), reference: "ODA-000002", facilityId: facilityId("ODF-000005"), type: "FINANCIAL_DIFFICULTY", status: "ASSIGNED", severity: "CRITICAL", detectedAt: timeline.instant(-7, 13), dueAt: timeline.instant(1, 17), details: "Facility suspended after rejected KYC and debit restriction.", assignedTo: staffId("supervisor") },
    { id: stableUuid("od-alert-high-util"), reference: "ODA-000003", facilityId: facilityId("ODF-000006"), type: "HIGH_UTILIZATION", status: "RESOLVED", severity: "HIGH", detectedAt: new Date("2026-06-30T06:00:00.000Z"), dueAt: new Date("2026-07-03T17:00:00.000Z"), details: "Utilization reached 88% of the approved facility.", assignedTo: staffId("supervisor"), intervention: "CUSTOMER_CONTACTED", resolutionComment: "Customer reduced utilization and supplied an updated cash-flow forecast.", resolvedBy: staffId("supervisor"), resolvedAt: new Date("2026-07-04T10:00:00.000Z") },
    { id: stableUuid("od-alert-review"), reference: "ODA-000004", facilityId: facilityId("ODF-000009"), type: "REVIEW_DUE", status: "RESOLVED", severity: "NORMAL", detectedAt: new Date("2025-12-01T06:00:00.000Z"), dueAt: new Date("2025-12-15T17:00:00.000Z"), details: "Facility expiry review became due.", assignedTo: staffId("supervisor"), intervention: "LIMIT_REVIEW", resolutionComment: "Facility allowed to expire with no renewal request.", resolvedBy: staffId("supervisor"), resolvedAt: new Date("2025-12-15T12:00:00.000Z") },
  ]);

  await tx.insert(tables.beneficiaries).values(baselineBeneficiaries.map((item) => ({
    ...item, customerId: customerId(item.customerNumber), status: item.status,
  })));

  const pendingPaymentId = stableUuid("payment-pending-pep");
  const bookedPaymentId = stableUuid("payment-booked-approved");
  const rejectedPaymentId = stableUuid("payment-rejected-review");
  const expiredPaymentId = stableUuid("payment-expired-approval");
  const pendingScenarioCreatedAt = timeline.instant(0, 9);
  const pendingScenarioExpiry = timeline.instant(1, 9);
  const bookedPaymentTransaction = baselineTransactions.find((item) => item.reference === "TX-1000000016-025")!;
  await tx.insert(tables.paymentOrders).values([
    { id: pendingPaymentId, reference: "PAY-000001", type: "EXTERNAL", status: "PENDING", sourceAccountId: bankAccountId("1000000004"), beneficiaryId: stableUuid("beneficiary-2"), amount: "2500.00", currency: "AED", description: "Fictional service payment", idempotencyKey: "SEED-PAY-PENDING-0001", initiatedBy: "bp.operator", approvalReason: "Approved PEP relationship requires external-payment approval", expiresAt: pendingScenarioExpiry, createdAt: pendingScenarioCreatedAt },
    { id: bookedPaymentId, reference: "PAY-000002", type: "EXTERNAL", status: "BOOKED", sourceAccountId: bankAccountId("1000000016"), beneficiaryId: stableUuid("beneficiary-15"), amount: bookedPaymentTransaction.amount, currency: "GBP", description: "Approved renewable-energy supplier payment", idempotencyKey: "SEED-PAY-BOOKED-0002", initiatedBy: "bp.operator", approvalReason: "KYC pending approval required independent payment approval", decidedBy: staffId("supervisor"), decisionComment: "Payment purpose and beneficiary verified.", expiresAt: new Date("2026-07-18T18:00:00.000Z"), decidedAt: new Date("2026-07-18T16:30:00.000Z"), createdAt: new Date("2026-07-17T16:00:00.000Z"), bookedAt: new Date(bookedPaymentTransaction.bookedAt) },
    { id: rejectedPaymentId, reference: "PAY-000003", type: "EXTERNAL", status: "REJECTED", sourceAccountId: bankAccountId("1000000015"), beneficiaryId: stableUuid("beneficiary-14"), amount: "1000.00", currency: "AED", description: "Payment rejected during KYC review", idempotencyKey: "SEED-PAY-REJECTED-0003", initiatedBy: "bp.operator", approvalReason: "KYC review and possible screening match", decidedBy: staffId("supervisor"), decisionComment: "Rejected until Compliance resolves the possible match.", expiresAt: new Date("2026-07-20T10:00:00.000Z"), decidedAt: new Date("2026-07-19T13:00:00.000Z"), createdAt: new Date("2026-07-19T10:00:00.000Z") },
    { id: expiredPaymentId, reference: "PAY-000004", type: "EXTERNAL", status: "EXPIRED", sourceAccountId: bankAccountId("1000000016"), beneficiaryId: stableUuid("beneficiary-15"), amount: "3250.00", currency: "GBP", description: "Approval window expired", idempotencyKey: "SEED-PAY-EXPIRED-0004", initiatedBy: "bp.operator", approvalReason: "KYC pending approval required independent payment approval", decisionComment: "Approval window expired after 24 hours", expiresAt: new Date("2026-07-19T08:00:00.000Z"), decidedAt: new Date("2026-07-19T08:05:00.000Z"), createdAt: new Date("2026-07-18T08:00:00.000Z") },
  ]);
  await tx.insert(tables.accountHolds).values([
    { id: stableUuid("hold-pending-pep"), reference: "HLD-000001", accountId: bankAccountId("1000000004"), paymentOrderId: pendingPaymentId, amount: "2500.00", currency: "AED", status: "ACTIVE", expiresAt: pendingScenarioExpiry },
    { id: stableUuid("hold-booked-approved"), reference: "HLD-000002", accountId: bankAccountId("1000000016"), paymentOrderId: bookedPaymentId, amount: bookedPaymentTransaction.amount, currency: "GBP", status: "CONSUMED", expiresAt: new Date("2026-07-18T18:00:00.000Z"), releasedAt: new Date("2026-07-18T16:30:00.000Z"), releaseReason: "Consumed when approved payment booked" },
    { id: stableUuid("hold-rejected-review"), reference: "HLD-000003", accountId: bankAccountId("1000000015"), paymentOrderId: rejectedPaymentId, amount: "1000.00", currency: "AED", status: "RELEASED", expiresAt: new Date("2026-07-20T10:00:00.000Z"), releasedAt: new Date("2026-07-19T13:00:00.000Z"), releaseReason: "Payment rejected by independent checker" },
    { id: stableUuid("hold-expired-approval"), reference: "HLD-000004", accountId: bankAccountId("1000000016"), paymentOrderId: expiredPaymentId, amount: "3250.00", currency: "GBP", status: "EXPIRED", expiresAt: new Date("2026-07-19T08:00:00.000Z"), releasedAt: new Date("2026-07-19T08:05:00.000Z"), releaseReason: "Payment approval expired" },
  ]);
  const seededWorkItems = [
    { id: stableUuid("work-payment-1"), reference: "WRK-000001", type: "PAYMENT_APPROVAL" as const, status: "OPEN" as const, priority: "HIGH" as const, entityType: "PAYMENT", entityReference: "PAY-000001", title: "Approve external PEP payment", description: "Review customer KYC, beneficiary screening, hold and available headroom.", requiredRole: "SUPERVISOR" as const, dueAt: pendingScenarioExpiry },
    { id: stableUuid("work-overdraft-3"), reference: "WRK-000002", type: "OVERDRAFT_APPROVAL" as const, status: "OPEN" as const, priority: "NORMAL" as const, entityType: "OVERDRAFT", entityReference: "ODF-000003", title: "Approve arranged overdraft application", description: "Review affordability and current KYC due status before decision.", requiredRole: "SUPERVISOR" as const, dueAt: timeline.instant(2, 17) },
    { id: stableUuid("work-alert-c5"), reference: "WRK-000003", type: "OVERDRAFT_ALERT" as const, status: "ASSIGNED" as const, priority: "CRITICAL" as const, entityType: "OVERDRAFT_ALERT", entityReference: "ODA-000002", title: "Resolve financial-difficulty alert", description: "Record the intervention outcome for the suspended facility.", requiredRole: "SUPERVISOR" as const, assignedTo: staffId("supervisor"), dueAt: timeline.instant(1, 17) },
    { id: stableUuid("work-kyc-c8"), reference: "WRK-000004", type: "KYC_APPROVAL" as const, status: "ASSIGNED" as const, priority: "HIGH" as const, entityType: "KYC_CASE", entityReference: "KYC-000008", title: "Approve SME onboarding KYC", description: "Review ownership, evidence, risk and clear fictional screening.", requiredRole: "COMPLIANCE" as const, assignedTo: staffId("compliance"), dueAt: timeline.instant(2, 17) },
    { id: stableUuid("work-overdraft-change"), reference: "WRK-000005", type: "OVERDRAFT_CHANGE" as const, status: "OPEN" as const, priority: "NORMAL" as const, entityType: "OVERDRAFT", entityReference: "ODF-000006", title: "Approve overdraft limit increase", description: "Review the proposed increase from GBP 25,000 to GBP 40,000.", requiredRole: "SUPERVISOR" as const, dueAt: timeline.instant(3, 17) },
    { id: stableUuid("work-payment-approved"), reference: "WRK-000006", type: "PAYMENT_APPROVAL" as const, status: "APPROVED" as const, priority: "HIGH" as const, entityType: "PAYMENT", entityReference: "PAY-000002", title: "Approved external payment", description: "Historical maker-checker approval example.", requiredRole: "SUPERVISOR" as const, decidedBy: staffId("supervisor"), decisionComment: "Payment purpose and beneficiary verified.", decidedAt: new Date("2026-07-18T16:30:00.000Z"), completedAt: new Date("2026-07-18T16:30:00.000Z"), dueAt: new Date("2026-07-18T18:00:00.000Z") },
    { id: stableUuid("work-payment-rejected"), reference: "WRK-000007", type: "PAYMENT_APPROVAL" as const, status: "REJECTED" as const, priority: "HIGH" as const, entityType: "PAYMENT", entityReference: "PAY-000003", title: "Rejected external payment", description: "Historical independent rejection example.", requiredRole: "SUPERVISOR" as const, decidedBy: staffId("supervisor"), decisionComment: "Possible screening match remains unresolved.", decidedAt: new Date("2026-07-19T13:00:00.000Z"), completedAt: new Date("2026-07-19T13:00:00.000Z"), dueAt: new Date("2026-07-20T10:00:00.000Z") },
    { id: stableUuid("work-payment-expired"), reference: "WRK-000008", type: "PAYMENT_APPROVAL" as const, status: "CANCELLED" as const, priority: "NORMAL" as const, entityType: "PAYMENT", entityReference: "PAY-000004", title: "Expired payment approval", description: "Approval expired and the hold was released without ledger movement.", requiredRole: "SUPERVISOR" as const, decisionComment: "Approval window expired after 24 hours.", completedAt: new Date("2026-07-19T08:05:00.000Z"), dueAt: new Date("2026-07-19T08:00:00.000Z") },
    { id: stableUuid("work-alert-resolved"), reference: "WRK-000009", type: "OVERDRAFT_ALERT" as const, status: "COMPLETED" as const, priority: "HIGH" as const, entityType: "OVERDRAFT_ALERT", entityReference: "ODA-000003", title: "Resolved high-utilization alert", description: "Historical intervention and resolution example.", requiredRole: "SUPERVISOR" as const, assignedTo: staffId("supervisor"), decisionComment: "Customer reduced utilization and supplied a cash-flow forecast.", completedAt: new Date("2026-07-04T10:00:00.000Z"), dueAt: new Date("2026-07-03T17:00:00.000Z") },
  ];
  await tx.insert(tables.workItems).values(seededWorkItems.map((item) => ({ ...item, createdBy: staffId("operator") })));
  const seededWorkItemEvents: Array<typeof tables.workItemEvents.$inferInsert> = [];
  for (const item of seededWorkItems) {
    const createdAt = ["OPEN", "ASSIGNED"].includes(item.status)
      ? timeline.instant(-1, 9)
      : new Date(item.reference === "WRK-000009" ? "2026-06-30T09:00:00.000Z" : "2026-07-18T09:00:00.000Z");
    seededWorkItemEvents.push({ id: stableUuid(`event-created-${item.reference}`), workItemId: item.id, eventType: "CREATED", fromStatus: null, toStatus: "OPEN", actorUserId: staffId("operator"), actorUsername: "bp.operator", comment: "Seeded demonstration work item.", occurredAt: createdAt });
    if (item.status === "OPEN") continue;
    if (item.status === "ASSIGNED") {
      const assigneeKey = item.requiredRole === "COMPLIANCE" ? "compliance" : "supervisor";
      seededWorkItemEvents.push({ id: stableUuid(`event-assigned-${item.reference}`), workItemId: item.id, eventType: "ASSIGNED", fromStatus: "OPEN", toStatus: "ASSIGNED", actorUserId: staffId(assigneeKey), actorUsername: `bp.${assigneeKey}`, comment: "Work item claimed for review.", occurredAt: timeline.instant(0, 9, 30) });
      continue;
    }
    const actorKey: "supervisor" | "admin" = item.status === "CANCELLED" ? "admin" : "supervisor";
    seededWorkItemEvents.push({ id: stableUuid(`event-final-${item.reference}`), workItemId: item.id, eventType: item.status, fromStatus: "OPEN", toStatus: item.status, actorUserId: staffId(actorKey), actorUsername: `bp.${actorKey}`, comment: "decisionComment" in item ? item.decisionComment : "Seeded terminal workflow state.", occurredAt: "completedAt" in item && item.completedAt ? item.completedAt : new Date("2026-07-20T10:00:00.000Z") });
  }
  await tx.insert(tables.workItemEvents).values(seededWorkItemEvents);

  const currencies = ["GBP", "AED", "USD", "EUR"];
  await tx.insert(tables.clearingAccounts).values(currencies.map((currency) => ({
    id: stableUuid(`clearing-${currency}`), code: `HIST-${currency}`, name: `Historical ${currency} Clearing`, currency, balance: "0.00",
  })));

  for (let offset = 0; offset < baselineTransactions.length; offset += 100) {
    await tx.insert(tables.ledgerTransactions).values(baselineTransactions.slice(offset, offset + 100).map((item) => ({
      id: item.id, reference: item.reference, bookedAt: new Date(item.bookedAt), valueDate: item.valueDate, description: item.description,
      type: item.type, status: "BOOKED" as const, currency: item.currency, amount: item.amount, counterparty: item.counterparty,
      paymentOrderId: item.reference === bookedPaymentTransaction.reference ? bookedPaymentId : null,
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
  if (preparedDocuments.length) await tx.insert(tables.auditEvents).values(preparedDocuments.map((document) => ({
    id: stableUuid(`audit-document-C000001-${document.slot}`), occurredAt: new Date("2026-07-20T08:00:00.000Z"), actorUsername: "system.seed",
    action: "DOCUMENT_BASELINE_CREATED", entityType: "CUSTOMER", entityReference: "C000001", correlationId: `SEED-C000001-${document.slot}`,
    before: null, after: { slot: document.slot, filename: document.filename, mimeType: document.mimeType, sizeBytes: document.sizeBytes },
  })));
}

export async function resetBaseline(database: Database, actor: { id: string; username: string }): Promise<void> {
  const preparedDocuments = await prepareSeedDocumentBlobs();
  await database.transaction(async (transaction) => {
    const tx = transaction as unknown as SeedDb;
    await tx.execute(sql`select pg_advisory_xact_lock(738_204_019)`);
    await tx.delete(tables.loginAttempts).where(lt(tables.loginAttempts.attemptedAt, new Date(Date.now() - 24 * 60 * 60_000)));
    await clearBankingData(tx);
    await seedBaseline(tx, preparedDocuments);
    await tx.insert(tables.auditEvents).values({
      actorUserId: actor.id,
      actorUsername: actor.username,
      action: "DEMO_RESET",
      entityType: "SYSTEM",
      entityReference: "FUTUREBANK",
      correlationId: crypto.randomUUID(),
      before: null,
      after: { baselineCustomers: 9, baselineAccounts: 19 },
    });
  });
  const referenced = new Set((await database.select({ pathname: tables.customerDocumentFiles.blobPathname }).from(tables.customerDocumentFiles)).map((row) => row.pathname));
  await removeUnreferencedNamespaceBlobs(referenced);
}
