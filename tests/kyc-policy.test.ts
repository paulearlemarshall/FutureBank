import { describe, expect, it } from "vitest";
import { calculateKycRisk, canChangeOverdraft, canSubmitKyc, kycPaymentControl, nextReviewDate, requirementsFor } from "@/modules/domain/kyc-policy";

describe("KYC policy", () => {
  it("generates jurisdiction and party-specific requirements", () => {
    expect(requirementsFor("GB", "RETAIL").map((item) => item.code)).toEqual(["IDENTITY", "ADDRESS"]);
    expect(requirementsFor("AE", "RETAIL").map((item) => item.code)).toEqual(["EMIRATES_ID", "PASSPORT", "RESIDENCY"]);
    expect(requirementsFor("AE", "SME").map((item) => item.code)).toEqual(expect.arrayContaining(["INCORPORATION", "OWNERSHIP", "BENEFICIAL_OWNERS"]));
  });

  it("calculates the locked demo scores and bands", () => {
    expect(calculateKycRisk({ pep: true })).toEqual({ score: 40, rating: "MEDIUM", enhancedDueDiligence: true });
    expect(calculateKycRisk({ pep: true, highRiskGeography: true, cashIntensive: true })).toEqual({ score: 70, rating: "HIGH", enhancedDueDiligence: true });
    expect(calculateKycRisk({ complexOwnership: true })).toEqual({ score: 15, rating: "LOW", enhancedDueDiligence: false });
  });

  it("enforces evidence completeness and expiry", () => {
    const requirements = requirementsFor("GB", "RETAIL");
    expect(canSubmitKyc(requirements, [
      { evidenceType: "IDENTITY", verificationStatus: "VERIFIED", expiresAt: "2027-01-01" },
      { evidenceType: "ADDRESS", verificationStatus: "VERIFIED", expiresAt: null },
    ], new Date("2026-07-20T00:00:00Z"))).toBe(true);
    expect(canSubmitKyc(requirements, [{ evidenceType: "IDENTITY", verificationStatus: "VERIFIED", expiresAt: "2026-01-01" }], new Date("2026-07-20T00:00:00Z"))).toBe(false);
  });

  it("maps KYC status and risk to downstream controls", () => {
    expect(kycPaymentControl("APPROVED", "LOW", false)).toBe("NORMAL");
    expect(kycPaymentControl("APPROVED", "HIGH", false)).toBe("APPROVAL");
    expect(kycPaymentControl("DUE", "LOW", false)).toBe("APPROVAL");
    expect(kycPaymentControl("REJECTED", "HIGH", false)).toBe("BLOCK");
    expect(canChangeOverdraft("APPROVED", false)).toBe(true);
    expect(canChangeOverdraft("DUE", false)).toBe(false);
  });

  it("uses the internal 36, 12 and 6 month review schedule", () => {
    const date = new Date("2026-07-20T00:00:00Z");
    expect(nextReviewDate(date, "LOW")).toBe("2029-07-20");
    expect(nextReviewDate(date, "MEDIUM")).toBe("2027-07-20");
    expect(nextReviewDate(date, "HIGH")).toBe("2027-01-20");
  });
});
