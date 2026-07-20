import { describe, expect, it } from "vitest";
import {
  BASELINE_ACCOUNT_NUMBERS,
  BASELINE_CUSTOMER_NUMBERS,
} from "@/modules/contracts";

describe("deterministic baseline identifiers", () => {
  it("defines exactly nine unique customer identifiers", () => {
    expect(BASELINE_CUSTOMER_NUMBERS).toHaveLength(9);
    expect(new Set(BASELINE_CUSTOMER_NUMBERS).size).toBe(9);
    expect(BASELINE_CUSTOMER_NUMBERS).toEqual([
      "C000001",
      "C000002",
      "C000003",
      "C000004",
      "C000005",
      "C000006",
      "C000007",
      "C000008",
      "C000009",
    ]);
  });

  it("defines exactly nineteen unique account identifiers", () => {
    expect(BASELINE_ACCOUNT_NUMBERS).toHaveLength(19);
    expect(new Set(BASELINE_ACCOUNT_NUMBERS).size).toBe(19);
    expect(BASELINE_ACCOUNT_NUMBERS[0]).toBe("1000000001");
    expect(BASELINE_ACCOUNT_NUMBERS.at(-1)).toBe("1000000019");
    expect(BASELINE_ACCOUNT_NUMBERS.slice(0, 14).at(-1)).toBe("1000000014");
  });
});
