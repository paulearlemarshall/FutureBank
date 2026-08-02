import { describe, expect, it } from "vitest";
import { classifyReconciliation, validateReconciliationDate } from "@/modules/domain/reconciliation-policy";

const side = { direction: "CREDIT" as const, amount: "125.00", currency: "GBP" };

describe("clearing reconciliation policy", () => {
  it("classifies exact matches and every durable exception family", () => {
    expect(classifyReconciliation(side, side)).toEqual({ type: "MATCHED", status: "MATCHED" });
    expect(classifyReconciliation(null, side).type).toBe("MISSING_INTERNAL");
    expect(classifyReconciliation(side, null).type).toBe("MISSING_EXTERNAL");
    expect(classifyReconciliation(side, { ...side, amount: "125.01" }).type).toBe("AMOUNT_MISMATCH");
    expect(classifyReconciliation(side, { ...side, direction: "DEBIT" }).type).toBe("DIRECTION_MISMATCH");
    expect(classifyReconciliation(side, { ...side, currency: "EUR" }).type).toBe("CURRENCY_MISMATCH");
  });

  it("rejects invalid and future business dates", () => {
    expect(validateReconciliationDate({ businessDate: "2026-02-30", today: "2026-08-02" }).ok).toBe(false);
    expect(validateReconciliationDate({ businessDate: "2026-08-03", today: "2026-08-02" }).ok).toBe(false);
    expect(validateReconciliationDate({ businessDate: "2026-08-02", today: "2026-08-02" }).ok).toBe(true);
  });
});
