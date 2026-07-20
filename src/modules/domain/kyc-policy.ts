import type { KycStatus, PartyType, RiskRating } from "@/modules/contracts";

export type KycRequirement = { code: string; label: string; mandatory: boolean };
export type KycRiskInput = {
  pep?: boolean;
  confirmedAdverseMedia?: boolean;
  highRiskGeography?: boolean;
  complexOwnership?: boolean;
  cashIntensive?: boolean;
};

export function requirementsFor(jurisdiction: string, partyType: PartyType): KycRequirement[] {
  if (partyType === "SME") {
    return [
      { code: "INCORPORATION", label: jurisdiction === "AE" ? "Trade licence or incorporation evidence" : "Certificate of incorporation", mandatory: true },
      { code: "OWNERSHIP", label: "Ownership and control structure", mandatory: true },
      { code: "CONTROLLERS", label: "Directors and authorised signatories", mandatory: true },
      { code: "BENEFICIAL_OWNERS", label: "Verified beneficial owners", mandatory: true },
      { code: "BUSINESS_ADDRESS", label: "Business address evidence", mandatory: true },
    ];
  }
  if (jurisdiction === "AE") {
    return [
      { code: "EMIRATES_ID", label: "Emirates ID", mandatory: true },
      { code: "PASSPORT", label: "Passport", mandatory: true },
      { code: "RESIDENCY", label: "Residency evidence", mandatory: true },
    ];
  }
  return [
    { code: "IDENTITY", label: "Identity evidence", mandatory: true },
    { code: "ADDRESS", label: "Address evidence", mandatory: true },
  ];
}

export function calculateKycRisk(input: KycRiskInput): { score: number; rating: RiskRating; enhancedDueDiligence: boolean } {
  const score = (input.pep ? 40 : 0)
    + (input.confirmedAdverseMedia ? 25 : 0)
    + (input.highRiskGeography ? 20 : 0)
    + (input.complexOwnership ? 15 : 0)
    + (input.cashIntensive ? 10 : 0);
  return { score, rating: score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW", enhancedDueDiligence: Boolean(input.pep) };
}

export function nextReviewDate(approvedAt: Date, rating: RiskRating): string {
  const result = new Date(approvedAt);
  result.setUTCMonth(result.getUTCMonth() + (rating === "HIGH" ? 6 : rating === "MEDIUM" ? 12 : 36));
  return result.toISOString().slice(0, 10);
}

export function kycPaymentControl(status: KycStatus, rating: RiskRating, pep: boolean): "NORMAL" | "APPROVAL" | "BLOCK" {
  if (["REJECTED", "EXPIRED"].includes(status)) return "BLOCK";
  if (status !== "APPROVED" || rating === "HIGH" || pep) return "APPROVAL";
  return "NORMAL";
}

export function canChangeOverdraft(status: KycStatus, hasDebitRestriction: boolean): boolean {
  return status === "APPROVED" && !hasDebitRestriction;
}

export function canSubmitKyc(requirements: KycRequirement[], evidence: Array<{ evidenceType: string; verificationStatus: string; expiresAt: string | null }>, today = new Date()): boolean {
  const day = today.toISOString().slice(0, 10);
  return requirements.filter((item) => item.mandatory).every((requirement) => evidence.some((item) =>
    item.evidenceType === requirement.code && item.verificationStatus === "VERIFIED" && (!item.expiresAt || item.expiresAt >= day),
  ));
}
