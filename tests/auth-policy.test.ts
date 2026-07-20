import { describe, expect, it } from "vitest";
import { hasRequiredRole } from "@/modules/domain/auth-policy";

describe("role boundaries", () => {
  it("allows operators to perform operator work", () => {
    expect(hasRequiredRole("OPERATOR", "OPERATOR")).toBe(true);
  });

  it("denies operators access to administrator work", () => {
    expect(hasRequiredRole("OPERATOR", "ADMIN")).toBe(false);
  });

  it.each(["OPERATOR", "ADMIN"] as const)(
    "allows administrators to satisfy the %s requirement",
    (required) => expect(hasRequiredRole("ADMIN", required)).toBe(true),
  );
});
