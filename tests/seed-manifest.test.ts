import { describe, expect, it } from "vitest";
import {
  baselineAccounts,
  baselineBeneficiaries,
  baselineCustomerAddressOverrides,
  baselineCustomers,
  baselineTransactions,
  stableUuid,
  validateBaselineSeed,
} from "@/db/seed-manifest";

describe("baseline seed manifest", () => {
  it("passes its complete invariant validator", () => {
    expect(validateBaselineSeed()).toEqual([]);
  });

  it("contains exactly six retail and three SME customers", () => {
    expect(baselineCustomers).toHaveLength(9);
    expect(baselineCustomers.filter(({ partyType }) => partyType === "RETAIL")).toHaveLength(6);
    expect(baselineCustomers.filter(({ partyType }) => partyType === "SME")).toHaveLength(3);
    expect(baselineCustomers.every(({ customerNumber }) => /^C\d{6}$/.test(customerNumber))).toBe(true);
  });

  it("fully populates the customer fields required by search, KYC and servicing", () => {
    for (const customer of baselineCustomers) {
      expect(customer.shortName).not.toBe("");
      expect(customer.nationality).toMatch(/^[A-Z]{2}$/);
      expect(customer.residenceCountry).toMatch(/^[A-Z]{2}$/);
      expect(customer.sector).not.toBe("");
      expect(customer.industry).not.toBe("");
      expect(customer.taxId).not.toBe("");
      expect(customer.branchCode).not.toBe("");
      expect(customer.relationshipManager).not.toBe("");
      expect(customer.kycReviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (customer.partyType === "RETAIL") {
        expect(customer.givenName).toBeTruthy();
        expect(customer.familyName).toBeTruthy();
        expect(customer.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } else {
        expect(customer.legalName).toBeTruthy();
        expect(customer.registrationNumber).toBeTruthy();
      }
    }
  });

  it("contains nineteen accounts across the four demo currencies and two read-only loans", () => {
    expect(baselineAccounts).toHaveLength(19);
    const productCurrency = new Map([
      ["CUR-GBP", "GBP"], ["SAV-GBP", "GBP"], ["TD-GBP", "GBP"], ["LOAN-GBP", "GBP"],
      ["CUR-AED", "AED"], ["SAV-AED", "AED"], ["LOAN-AED", "AED"],
      ["FCY-USD", "USD"], ["FCY-EUR", "EUR"],
    ]);
    expect(new Set(baselineAccounts.map(({ productCode }) => productCurrency.get(productCode)))).toEqual(
      new Set(["GBP", "AED", "USD", "EUR"]),
    );
    expect(baselineAccounts.filter(({ productCode }) => productCode.startsWith("LOAN-"))).toHaveLength(2);
    expect(
      baselineAccounts
        .filter(({ productCode }) => productCode.startsWith("LOAN-"))
        .every((account) => "readOnly" in account && account.readOnly === true),
    ).toBe(true);
    expect(baselineAccounts.some((account) => "status" in account && account.status === "BLOCKED")).toBe(true);
    expect(baselineAccounts.some((account) => "status" in account && account.status === "CLOSED")).toBe(true);
  });

  it("preserves the original identifiers and adds the KYC coverage customers", () => {
    expect(baselineCustomers.slice(0, 5).map(({ customerNumber }) => customerNumber)).toEqual(["C000001", "C000002", "C000003", "C000004", "C000005"]);
    expect(baselineAccounts.slice(0, 14).map(({ accountNumber }) => accountNumber)).toEqual(Array.from({ length: 14 }, (_, index) => `10000000${(index + 1).toString().padStart(2, "0")}`));
    expect(new Set(baselineCustomers.map(({ kycStatus }) => kycStatus))).toEqual(new Set(["NOT_STARTED", "IN_PROGRESS", "PENDING_APPROVAL", "APPROVED", "DUE", "REJECTED", "EXPIRED"]));
    expect(baselineCustomers.find(({ customerNumber }) => customerNumber === "C000001")?.kycStatus).toBe("IN_PROGRESS");
  });

  it("includes searchable Arabic retail and SME scenarios with Arabic addresses", () => {
    const arabicScript = /\p{Script=Arabic}/u;
    const arabicCustomers = baselineCustomers.filter(({ language }) => language === "Arabic");
    expect(arabicCustomers.map(({ customerNumber }) => customerNumber)).toEqual(["C000002", "C000005"]);

    const retail = baselineCustomers.find(({ customerNumber }) => customerNumber === "C000002")!;
    expect(retail.givenName).toBe("عمر");
    expect(retail.familyName).toBe("المنصوري");
    expect(retail.shortName).toMatch(/Omar Al Mansoori/);
    expect(retail.shortName).toMatch(arabicScript);

    const sme = baselineCustomers.find(({ customerNumber }) => customerNumber === "C000005")!;
    expect(sme.legalName).toBe("شركة الهلال للتجارة الرقمية ش.م.ح-ذ.م.م");
    expect(sme.shortName).toMatch(/Crescent Digital/);
    expect(sme.shortName).toMatch(arabicScript);

    expect(baselineCustomerAddressOverrides.C000002.line1).toMatch(arabicScript);
    expect(baselineCustomerAddressOverrides.C000005.city).toBe("دبي");
  });

  it("provides at least 25 chronologically valid transactions per account ending at its balance", () => {
    for (const account of baselineAccounts) {
      const entries = baselineTransactions.filter(
        ({ accountNumber }) => accountNumber === account.accountNumber,
      );
      expect(entries.length).toBeGreaterThanOrEqual(25);
      expect(entries.at(-1)?.balanceAfter).toBe(account.balance);
      for (const [index, entry] of entries.entries()) {
        expect(entry.currency).toMatch(/^(GBP|AED|USD|EUR)$/);
        expect(Number.isNaN(Date.parse(entry.bookedAt))).toBe(false);
        expect(entry.reference).toContain(account.accountNumber);
        if (index > 0) expect(Date.parse(entry.bookedAt)).toBeGreaterThan(Date.parse(entries[index - 1].bookedAt));
      }
    }
  });

  it("contains at least twelve beneficiaries owned by baseline customers", () => {
    expect(baselineBeneficiaries.length).toBeGreaterThanOrEqual(12);
    const customerNumbers = new Set(baselineCustomers.map(({ customerNumber }) => customerNumber));
    expect(
      baselineBeneficiaries.every(({ customerNumber }) => customerNumbers.has(customerNumber)),
    ).toBe(true);
  });

  it("generates deterministic RFC 4122 version 4 shaped IDs", () => {
    const first = stableUuid("customer-C000001");
    expect(stableUuid("customer-C000001")).toBe(first);
    expect(stableUuid("customer-C000002")).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
