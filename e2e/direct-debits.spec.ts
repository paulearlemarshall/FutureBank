import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("creates, collects and cancels a direct debit mandate", async ({ page }) => {
  await login(page, "operator");
  await page.goto("/direct-debits");
  await expectReady(page, "direct-debits");
  await bp(page, "direct-debit-source").selectOption("1000000002");
  const creditor = await bp(page, "direct-debit-creditor").locator("option").filter({ hasText: "Alex Morgan" }).getAttribute("value");
  expect(creditor).toBeTruthy();
  await bp(page, "direct-debit-creditor").selectOption(creditor!);
  await bp(page, "direct-debit-creditor-reference").fill(`E2E-DD-${Date.now()}`);
  await bp(page, "direct-debit-maximum").fill("100.00");
  await bp(page, "direct-debit-mandate-submit").click();
  const status = bp(page, "status-direct-debit-mandate-status");
  await expect(status).toContainText(/was created/i);
  const reference = (await status.textContent())?.match(/DDM-[A-Z0-9-]+/)?.[0];
  expect(reference).toBeTruthy();

  await page.goto("/direct-debits");
  await bp(page, "direct-debit-collection-mandate").selectOption(reference!);
  await bp(page, "direct-debit-collection-amount").fill("2.34");
  await bp(page, "direct-debit-collection-submit").click();
  await expect(bp(page, "status-direct-debit-collection-status")).toContainText(/is booked/i);

  await page.goto(`/direct-debits/${reference}`);
  await expectReady(page, "direct-debit-detail");
  await expect(bp(page, "direct-debit-collections-table")).toContainText("2.34");
  await bp(page, "direct-debit-cancel-reason").fill("E2E mandate cleanup");
  await bp(page, "direct-debit-cancel-submit").click();
  await expect(bp(page, "status-direct-debit-cancellation")).toContainText(/E2E mandate cleanup/i);
});
