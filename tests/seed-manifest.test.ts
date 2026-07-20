import { describe, expect, it } from "vitest";
import {
  baselineAccounts,
  baselineBeneficiaries,
  baselineCustomers,
  baselineTransactions,
  stableUuid,
  validateBaselineSeed,
} from "@/db/seed-manifest";

describe("baseline seed manifest", () => {
  it("passes its complete invariant validator", () => {
    expect(validateBaselineSeed()).toEqual([]);
  });

  it("contains exactly three retail and two SME customers", () => {
    expect(baselineCustomers).toHaveLength(5);
    expect(baselineCustomers.filter(({ partyType }) => partyType === "RETAIL")).toHaveLength(3);
    expect(baselineCustomers.filter(({ partyType }) => partyType === "SME")).toHaveLength(2);
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

  it("contains fourteen accounts across the four demo currencies and two read-only loans", () => {
    expect(baselineAccounts).toHaveLength(14);
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
  });

  it("provides at least 25 chronologically valid transactions per account ending at its balance", () => {
    for (const account of baselineAccounts) {
      const entries = baselineTransactions.filter(
        ({ accountNumber }) => accountNumber === account.accountNumber,
      );
      expect(entries.length).toBeGreaterThanOrEqual(25);
      expect(entries.at(-1)?.balanceAfter).toBe(account.balance);
      for (const entry of entries) {
        expect(entry.currency).toMatch(/^(GBP|AED|USD|EUR)$/);
        expect(Number.isNaN(Date.parse(entry.bookedAt))).toBe(false);
        expect(entry.reference).toContain(account.accountNumber);
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
