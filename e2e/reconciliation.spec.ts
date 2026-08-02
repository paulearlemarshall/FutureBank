import { expect, test } from "@playwright/test";
import { assertBluePrismContract, bp, expectReady, login } from "./helpers";

test("reconciles clearing evidence once and resolves exceptions without ledger mutation", async ({ page }) => {
  await login(page, "supervisor");
  await page.goto("/reconciliation");
  await expectReady(page, "reconciliation");
  await bp(page, "reconciliation-run-submit").click();
  const status = bp(page, "status-reconciliation-run-status");
  await expect(status).toContainText(/17 matched, 2 exceptions/i, { timeout: 30_000 });
  const reference = (await status.textContent())?.match(/REC-[A-Z0-9-]+/)?.[0];
  expect(reference).toBeTruthy();

  await page.goto(`/reconciliation/${reference}`);
  await assertBluePrismContract(page, "reconciliation-detail");
  const table = bp(page, "reconciliation-items-table");
  await expect(table.locator("tbody tr")).toHaveCount(19);
  await expect(table).toContainText("Amount mismatch");
  await expect(table).toContainText("Missing internal");

  const selectedTransaction = await bp(page, "reconciliation-item-reference").locator("option:checked").textContent();
  await bp(page, "reconciliation-resolution-comment").fill("Verified fictional settlement evidence during the browser control journey.");
  await bp(page, "reconciliation-resolution-submit").click();
  await expect(bp(page, "status-reconciliation-resolution-status")).toContainText(/resolved without changing the ledger/i);
  await expect(table).toContainText(selectedTransaction!.split(" · ")[0]);
  await expect(table).toContainText("Verified fictional settlement evidence");
});
