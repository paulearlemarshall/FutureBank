import { expect, test } from "@playwright/test";
import { assertBluePrismContract, bp, expectReady, login } from "./helpers";

test("shows the period-close control and retains failed close evidence", async ({ page }) => {
  await login(page, "supervisor");
  await page.goto("/accounting-periods");
  await expectReady(page, "accounting-periods");
  await expect(bp(page, "accounting-periods-table")).toContainText("2026-07-CONTROL");

  await page.goto("/accounting-periods/ACP-000001");
  await assertBluePrismContract(page, "accounting-period-detail");
  await bp(page, "accounting-period-close-request-comment").fill("Browser control attempt before final period evidence is available.");
  await bp(page, "accounting-period-close-request-submit").click();
  await expect(bp(page, "status-accounting-period-close-request-status")).toContainText(/end-of-day|reconciliation|exceptions/i);
  await expect(bp(page, "accounting-period-close-request-comment")).toHaveValue("Browser control attempt before final period evidence is available.");
});
