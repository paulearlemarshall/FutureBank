import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("global search finds a customer number", async ({ page }) => {
  await bp(page, "global-search-query").fill(demo.customerNumber);
  await bp(page, "global-search-submit").click();
  await expectReady(page, "search");
  await expect(bp(page, `global-customer-${demo.customerNumber}`)).toBeVisible();
});

test("global search finds an account number", async ({ page }) => {
  await bp(page, "global-search-query").fill(demo.accountNumber);
  await bp(page, "global-search-submit").click();
  await expectReady(page, "search");
  await expect(bp(page, `global-account-${demo.accountNumber}`)).toBeVisible();
});
