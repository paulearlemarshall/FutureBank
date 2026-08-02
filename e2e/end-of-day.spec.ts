import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("runs daily charges and interest once and exposes balanced posting references", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "supervisor");
  await page.goto("/end-of-day");
  await expectReady(page, "end-of-day");
  await bp(page, "end-of-day-run-submit").click();
  const status = bp(page, "status-end-of-day-run-status");
  await expect(status).toContainText(/9 booked \(2 charges, 7 interest\), 0 failed/i, { timeout: 60_000 });
  const reference = (await status.textContent())?.match(/EOD-[A-Z0-9-]+/)?.[0];
  expect(reference).toBeTruthy();

  await page.goto(`/end-of-day/${reference}`);
  await expectReady(page, "end-of-day-detail");
  await expect(bp(page, "end-of-day-run-details")).toContainText("Booked");
  const table = bp(page, "end-of-day-postings-table");
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await expect(table).toContainText("PCR-000001");
  await expect(table).toContainText("Interest");
});
