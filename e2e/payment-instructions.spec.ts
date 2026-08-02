import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("creates and cancels a future-dated payment instruction without posting funds", async ({ page }) => {
  await login(page, "operator");
  await page.goto("/payments");
  await expectReady(page, "payments");
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  const startDate = date.toISOString().slice(0, 10);
  await bp(page, "payment-instruction-type").selectOption("SCHEDULED");
  await bp(page, "payment-instruction-payment-type").selectOption("INTERNAL");
  await bp(page, "payment-instruction-source").selectOption("1000000002");
  await bp(page, "payment-instruction-destination").selectOption("1000000001");
  await bp(page, "payment-instruction-amount").fill("2.34");
  await bp(page, "payment-instruction-frequency").selectOption("ONCE");
  await bp(page, "payment-instruction-start-date").fill(startDate);
  await bp(page, "payment-instruction-description").fill(`E2E future payment ${Date.now()}`);
  await bp(page, "payment-instruction-create").click();
  const status = bp(page, "status-payment-instruction-create-status");
  await expect(status).toContainText(/created without reserving funds/i);
  const reference = (await status.textContent())?.match(/PIN-[A-Z0-9-]+/)?.[0];
  expect(reference).toBeTruthy();

  await page.goto(`/payment-instructions/${reference}`);
  await expectReady(page, "payment-instruction-detail");
  await expect(bp(page, "payment-instruction-executions-table")).toContainText("Scheduled for");
  await bp(page, "payment-instruction-cancellation-reason").fill("E2E cleanup cancellation");
  await bp(page, "payment-instruction-cancel").click();
  await expect(bp(page, "status-payment-instruction-cancellation")).toContainText(/E2E cleanup cancellation/i);
});
