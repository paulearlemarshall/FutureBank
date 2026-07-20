import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("admin resets the demo to exactly five customers", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/reset");
  await expectReady(page, "admin-reset");
  await bp(page, "reset-confirmation").fill("RESET FUTUREBANK");
  await bp(page, "reset-submit").click();
  await expect(bp(page, "status-reset-status")).toContainText(/reset complete|restored/i, { timeout: 30_000 });
  await page.goto("/customers");
  await expectReady(page, "customers");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(5);
});
