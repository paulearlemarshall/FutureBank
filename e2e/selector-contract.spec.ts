import { test } from "@playwright/test";
import { assertBluePrismContract, demo, login } from "./helpers";

test("public login page satisfies the Blue Prism selector contract", async ({ page }) => {
  await page.goto("/login");
  await assertBluePrismContract(page, "login");
});

const authenticatedRoutes = [
  ["/dashboard", "dashboard"],
  [`/search?query=${demo.customerNumber}`, "search"],
  ["/customers", "customers"],
  [`/customers/${demo.customerNumber}`, "customer-detail"],
  [`/customers/${demo.customerNumber}?tab=documents`, "customer-detail"],
  [`/accounts/${demo.accountNumber}`, "account-detail"],
  ["/beneficiaries", "beneficiaries"],
  ["/payments", "payments"],
  ["/payments/PAY-000001", "payment-approval-detail"],
  ["/payments/PAY-000004", "payment-approval-detail"],
  ["/payment-instructions/PIN-000001", "payment-instruction-detail"],
  ["/direct-debits", "direct-debits"],
  ["/direct-debits/DDM-000001", "direct-debit-detail"],
  ["/payment-reversals", "payment-reversals"],
  ["/payment-reversals/REV-000001", "payment-reversal-detail"],
  ["/work-queue", "work-queue"],
  ["/work-queue/WRK-000001", "work-item-detail"],
  ["/kyc", "kyc-register"],
  ["/kyc/KYC-000003", "kyc-case-workspace"],
  ["/kyc/KYC-000007", "kyc-case-workspace"],
  ["/overdrafts", "overdraft-register"],
  ["/overdrafts/new", "overdraft-application"],
  ["/overdrafts/ODF-000001", "overdraft-facility-detail"],
  ["/overdrafts/ODF-000006", "overdraft-facility-detail"],
  ["/products", "products"],
  ["/audit", "audit"],
] as const;

test.describe("authenticated Blue Prism selector contract", () => {
  for (const [route, pageName] of authenticatedRoutes) {
    test(`${pageName}: ${route}`, async ({ page }) => {
      await login(page);
      await page.goto(route);
      await assertBluePrismContract(page, pageName);
    });
  }
});
