import { describe, expect, it } from "vitest";
import {
  BASELINE_ACCOUNT_NUMBERS,
  BASELINE_CUSTOMER_NUMBERS,
} from "@/modules/contracts";

describe("deterministic baseline identifiers", () => {
  it("defines exactly five unique customer identifiers", () => {
    expect(BASELINE_CUSTOMER_NUMBERS).toHaveLength(5);
    expect(new Set(BASELINE_CUSTOMER_NUMBERS).size).toBe(5);
    expect(BASELINE_CUSTOMER_NUMBERS).toEqual([
      "C000001",
      "C000002",
      "C000003",
      "C000004",
      "C000005",
    ]);
  });

  it("defines exactly fourteen unique account identifiers", () => {
    expect(BASELINE_ACCOUNT_NUMBERS).toHaveLength(14);
    expect(new Set(BASELINE_ACCOUNT_NUMBERS).size).toBe(14);
    expect(BASELINE_ACCOUNT_NUMBERS[0]).toBe("1000000001");
    expect(BASELINE_ACCOUNT_NUMBERS.at(-1)).toBe("1000000014");
  });
});
