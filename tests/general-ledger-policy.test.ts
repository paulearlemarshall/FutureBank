import { describe, expect, it } from "vitest";
import { generalLedgerAccountCodeForLeg, isBalancedGeneralLedger, naturalBalance, validateManualJournalInput } from "@/modules/domain/general-ledger-policy";

describe("general ledger policy", () => {
  it("maps subledger legs to currency control accounts", () => {
    expect(generalLedgerAccountCodeForLeg({ transactionType: "PAYMENT", legType: "ACCOUNT", currency: "GBP" })).toBe("2100-GBP");
    expect(generalLedgerAccountCodeForLeg({ transactionType: "PAYMENT", legType: "CLEARING", currency: "GBP" })).toBe("1100-GBP");
    expect(generalLedgerAccountCodeForLeg({ transactionType: "ACCOUNT_CHARGE", legType: "CLEARING", currency: "AED" })).toBe("4100-AED");
    expect(generalLedgerAccountCodeForLeg({ transactionType: "DEPOSIT_INTEREST", legType: "CLEARING", currency: "AED" })).toBe("5100-AED");
    expect(generalLedgerAccountCodeForLeg({ transactionType: "LOAN_ORIGINATION", legType: "ACCOUNT", accountKind: "LOAN", currency: "GBP" })).toBe("1200-GBP");
    expect(generalLedgerAccountCodeForLeg({ transactionType: "LOAN_ORIGINATION", legType: "ACCOUNT", accountKind: "CURRENT", currency: "GBP" })).toBe("2100-GBP");
  });

  it("validates exact balanced manual journals", () => {
    expect(validateManualJournalInput({ valueDate: "2026-08-02", currency: "GBP", debitAccountCode: "5100-GBP", creditAccountCode: "1100-GBP", amount: "12.30", description: "Accrual correction", comment: "Independent review required for this correction." })).toMatchObject({ ok: true, amount: "12.30" });
    expect(validateManualJournalInput({ valueDate: "2026-02-30", currency: "GBP", debitAccountCode: "5100-GBP", creditAccountCode: "1100-GBP", amount: "12.30", description: "Accrual correction", comment: "Independent review required for this correction." }).ok).toBe(false);
    expect(isBalancedGeneralLedger([{ direction: "DEBIT", amount: "12.30" }, { direction: "CREDIT", amount: "12.30" }])).toBe(true);
    expect(isBalancedGeneralLedger([{ direction: "DEBIT", amount: "12.30" }, { direction: "CREDIT", amount: "12.29" }])).toBe(false);
  });

  it("reports natural debit and credit balances", () => {
    expect(naturalBalance("ASSET", "100.00", "25.00")).toBe("75.00");
    expect(naturalBalance("LIABILITY", "25.00", "100.00")).toBe("75.00");
  });
});
