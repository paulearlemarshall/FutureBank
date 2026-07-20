import { test } from "@playwright/test";
import { assertBluePrismContract, demo, login } from "./helpers";

test("public login page satisfies the Blue Prism selector contract", async ({ page }) => {
  await page.goto("/login");
  await assertBluePrismContract(page, "login");
});

test("authenticated pages satisfy the Blue Prism selector contract", async ({ page }) => {
  await login(page);
  const routes = [
    ["/dashboard", "dashboard"],
    [`/search?query=${demo.customerNumber}`, "search"],
    ["/customers", "customers"],
    [`/customers/${demo.customerNumber}`, "customer-detail"],
    [`/accounts/${demo.accountNumber}`, "account-detail"],
    ["/beneficiaries", "beneficiaries"],
    ["/payments", "payments"],
    ["/products", "products"],
    ["/audit", "audit"],
  ] as const;

  for (const [route, pageName] of routes) {
    await page.goto(route);
    await assertBluePrismContract(page, pageName);
  }
});
