import { describe, expect, it } from "vitest";
import {
  assertBalancedEntries,
  minorUnitsToMoney,
  moneyToMinorUnits,
  validateTransfer,
} from "@/modules/domain/transfer-policy";

const validTransfer = {
  amount: "25.50",
  sourceCurrency: "GBP",
  destinationCurrency: "GBP",
  availableBalance: "100.00",
  sourceStatus: "ACTIVE" as const,
  destinationStatus: "ACTIVE" as const,
};

describe("monetary values", () => {
  it.each([
    ["0", 0n],
    ["0.1", 10n],
    ["12.34", 1234n],
    ["999999999999.99", 99999999999999n],
  ])("converts %s to exact minor units", (value, expected) => {
    expect(moneyToMinorUnits(value)).toBe(expected);
  });

  it.each(["", "-1.00", "1.001", "1e3", "£1.00", "1,000.00", " 1.00"])(
    "rejects ambiguous monetary input %j",
    (value) => expect(() => moneyToMinorUnits(value)).toThrow("Invalid monetary value"),
  );

  it.each([
    [0n, "0.00"],
    [1n, "0.01"],
    [1234n, "12.34"],
    [-1234n, "-12.34"],
  ])("formats %s minor units", (value, expected) => {
    expect(minorUnitsToMoney(value)).toBe(expected);
  });
});

describe("transfer validation", () => {
  it("normalizes and accepts a valid same-currency transfer", () => {
    expect(validateTransfer({ ...validTransfer, amount: "25.5" })).toEqual({
      ok: true,
      amount: "25.50",
    });
  });

  it.each(["0", "0.00", "-1", "abc", "1.234"])(
    "rejects invalid amount %j",
    (amount) => {
      expect(validateTransfer({ ...validTransfer, amount })).toEqual({
        ok: false,
        code: "INVALID_AMOUNT",
      });
    },
  );

  it.each([
    { sourceStatus: "BLOCKED" as const },
    { sourceStatus: "CLOSED" as const },
    { destinationStatus: "BLOCKED" as const },
    { destinationStatus: "CLOSED" as const },
  ])("rejects an unavailable account: %o", (override) => {
    expect(validateTransfer({ ...validTransfer, ...override })).toEqual({
      ok: false,
      code: "ACCOUNT_UNAVAILABLE",
    });
  });

  it("rejects a debit from a read-only loan account", () => {
    expect(validateTransfer({ ...validTransfer, sourceReadOnly: true })).toEqual({
      ok: false,
      code: "READ_ONLY_ACCOUNT",
    });
  });

  it("rejects cross-currency transfers", () => {
    expect(
      validateTransfer({ ...validTransfer, destinationCurrency: "AED" }),
    ).toEqual({ ok: false, code: "CURRENCY_MISMATCH" });
  });

  it("rejects an amount above available funds and accepts the exact balance", () => {
    expect(
      validateTransfer({ ...validTransfer, amount: "100.01" }),
    ).toEqual({ ok: false, code: "INSUFFICIENT_FUNDS" });
    expect(
      validateTransfer({ ...validTransfer, amount: "100.00" }),
    ).toEqual({ ok: true, amount: "100.00" });
  });
});

describe("double-entry invariant", () => {
  it("accepts balanced debit and credit entries", () => {
    expect(
      assertBalancedEntries([
        { direction: "DEBIT", amount: "25.50" },
        { direction: "CREDIT", amount: "25.50" },
      ]),
    ).toBe(true);
  });

  it("accepts a balanced multi-entry posting", () => {
    expect(
      assertBalancedEntries([
        { direction: "DEBIT", amount: "100.00" },
        { direction: "CREDIT", amount: "97.50" },
        { direction: "CREDIT", amount: "2.50" },
      ]),
    ).toBe(true);
  });

  it("rejects an unbalanced posting", () => {
    expect(
      assertBalancedEntries([
        { direction: "DEBIT", amount: "25.50" },
        { direction: "CREDIT", amount: "25.49" },
      ]),
    ).toBe(false);
  });
});
