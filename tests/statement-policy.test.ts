import { describe, expect, it } from "vitest";
import type { AccountStatement } from "@/modules/contracts";
import { renderAccountStatementCsv, validateStatementPeriod } from "@/modules/domain/statement-policy";

describe("account statement policy", () => {
  it("accepts an inclusive period of up to 366 days", () => {
    expect(validateStatementPeriod("2024-01-01", "2024-12-31")).toEqual({ ok: true, fromDate: "2024-01-01", toDate: "2024-12-31" });
  });

  it.each([
    ["2026-02-30", "2026-03-01", "INVALID_DATE"],
    ["2026-03-02", "2026-03-01", "INVALID_PERIOD"],
    ["2025-01-01", "2026-01-02", "PERIOD_TOO_LONG"],
  ])("rejects %s to %s with %s", (fromDate, toDate, code) => {
    expect(validateStatementPeriod(fromDate, toDate)).toEqual({ ok: false, code });
  });

  it("renders exact debit and credit columns and neutralizes spreadsheet formulas", () => {
    const statement: AccountStatement = {
      accountNumber: "1000000001", customerNumber: "C000001", customerName: "Amelia Hart", productName: "Current",
      currency: "GBP", fromDate: "2026-08-01", toDate: "2026-08-02", openingBalance: "100.00", closingBalance: "90.00",
      generatedAt: "2026-08-02T10:00:00.000Z",
      entries: [{ reference: "TX-1", bookedAt: "2026-08-02T09:00:00.000Z", valueDate: "2026-08-02", description: "=unsafe", type: "PAYMENT", direction: "DEBIT", amount: "10.00", currency: "GBP", balanceAfter: "90.00", counterparty: "Demo, Ltd", status: "BOOKED" }],
    };
    const csv = renderAccountStatementCsv(statement);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"10.00","","90.00"');
    expect(csv).toContain('"\'=unsafe"');
    expect(csv).toContain('"Demo, Ltd"');
  });
});
