import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("submits a payment once even when the submit is retried", async ({ page }) => {
  await page.goto("/payments");
  await expectReady(page, "payments");
  await bp(page, "payment-type").selectOption("INTERNAL");
  await bp(page, "payment-from-account").selectOption(demo.transferFromAccount);
  await bp(page, "payment-to-account").selectOption(demo.transferToAccount);
  await bp(page, "payment-amount").fill("1.23");
  await bp(page, "payment-reference").fill(`E2E-${Date.now()}`);

  await bp(page, "payment-submit").dblclick();
  await expect(bp(page, "status-payment-status")).toContainText(/booked|submitted|complete|success/i);
  await expect(page.getByText(/duplicate/i)).toHaveCount(0);
});

test("rejects an amount above the available balance", async ({ page }) => {
  await page.goto("/payments");
  await bp(page, "payment-type").selectOption("INTERNAL");
  await bp(page, "payment-from-account").selectOption(demo.transferFromAccount);
  await bp(page, "payment-to-account").selectOption(demo.transferToAccount);
  await bp(page, "payment-amount").fill("999999999999.99");
  await bp(page, "payment-reference").fill("E2E insufficient funds");
  await bp(page, "payment-submit").click();
  await expect(bp(page, "status-payment-status")).toContainText(/insufficient/i);
});

test("rejects a beneficiary owned by another customer", async ({ page }) => {
  await page.goto("/payments");
  await expectReady(page, "payments");
  await bp(page, "payment-type").selectOption("EXTERNAL");
  await bp(page, "payment-from-account").selectOption("1000000001");
  const beneficiaryValue = await bp(page, "payment-beneficiary")
    .locator("option")
    .filter({ hasText: "Nadia Rahman" })
    .getAttribute("value");
  expect(beneficiaryValue).not.toBeNull();
  await bp(page, "payment-beneficiary").selectOption(beneficiaryValue!);
  await bp(page, "payment-amount").fill("1.00");
  await bp(page, "payment-reference").fill("E2E ownership isolation");
  await bp(page, "payment-submit").click();
  await expect(bp(page, "status-payment-status")).toContainText(/beneficiary.*not.*found|inactive/i);
});
