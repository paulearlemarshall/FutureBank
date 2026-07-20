import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test("creates a beneficiary that remains visible in the register", async ({ page }) => {
  await login(page);
  await page.goto("/beneficiaries");
  await expectReady(page, "beneficiaries");

  const name = `E2E Supplier ${Date.now()}`;
  await bp(page, "beneficiary-customer-number").selectOption(demo.customerNumber);
  await bp(page, "beneficiary-name").fill(name);
  await bp(page, "beneficiary-bank-name").fill("Fictional Clearing Bank");
  await bp(page, "beneficiary-account-number").fill(`E2E${Date.now()}`);
  await bp(page, "beneficiary-swift-bic").fill("FICTGB2L");
  await bp(page, "beneficiary-currency").selectOption("GBP");
  await bp(page, "beneficiary-submit").click();

  await expect(page.locator('[role="status"]')).toContainText(/saved|added|created/i);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
});
