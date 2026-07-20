import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("opens an account and displays its statement", async ({ page }) => {
  await page.goto("/accounts/new");
  await expectReady(page, "account-new");
  const customerValue = await bp(page, "account-customer-number")
    .locator("option")
    .filter({ hasText: demo.customerNumber })
    .first()
    .getAttribute("value");
  expect(customerValue).not.toBeNull();
  await bp(page, "account-customer-number").selectOption(customerValue!);
  await bp(page, "account-product-code").selectOption("CUR-GBP");
  await bp(page, "account-branch-code").selectOption("LON001");
  await bp(page, "account-opening-balance").fill("100.00");
  await bp(page, "account-open-submit").click();
  await expect(bp(page, "status-account-open-status")).toContainText(/opened|created/i);
  await page.goto("/accounts");
  await expectReady(page, "accounts");
  await expect(page.getByRole("table")).toBeVisible();
});

test("shows a populated statement for a seeded account", async ({ page }) => {
  await page.goto(`/accounts/${demo.accountNumber}`);
  await expectReady(page, "account-detail");
  expect(await page.getByRole("table").locator("tbody tr").count()).toBeGreaterThanOrEqual(25);
});

test("blocks and restores an eligible deposit account", async ({ page }) => {
  await page.goto(`/accounts/${demo.accountNumber}`);
  await expectReady(page, "account-detail");
  await bp(page, "account-new-status").selectOption("BLOCKED");
  await bp(page, "account-status-reason").fill("E2E temporary block");
  await bp(page, "account-status-submit").click();
  await expect(bp(page, "status-account-status-result")).toContainText(/blocked/i);

  await page.goto(`/accounts?status=BLOCKED&query=${demo.accountNumber}`);
  await expectReady(page, "accounts");
  await expect(page.getByRole("row", { name: new RegExp(demo.accountNumber) })).toBeVisible();

  await page.goto(`/accounts/${demo.accountNumber}`);
  await bp(page, "account-new-status").selectOption("ACTIVE");
  await bp(page, "account-status-reason").fill("E2E restore active status");
  await bp(page, "account-status-submit").click();
  await expect(bp(page, "status-account-status-result")).toContainText(/active/i);
});

test("keeps seeded loan maintenance read-only", async ({ page }) => {
  await page.goto("/accounts/1000000011");
  await expectReady(page, "account-detail");
  await expect(bp(page, "account-new-status")).toBeDisabled();
  await expect(bp(page, "account-status-submit")).toBeDisabled();
});

test("rejects closure while an account has a non-zero balance", async ({ page }) => {
  await page.goto(`/accounts/${demo.accountNumber}`);
  await expectReady(page, "account-detail");
  await bp(page, "account-new-status").selectOption("CLOSED");
  await bp(page, "account-status-reason").fill("E2E invalid closure attempt");
  await bp(page, "account-status-submit").click();
  await expect(bp(page, "status-account-status-result")).toContainText(/zero balance/i);
});
