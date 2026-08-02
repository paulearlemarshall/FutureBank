import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test("requests and independently approves a payment reversal", async ({ page }) => {
  await login(page, "operator");
  await page.goto("/payments");
  await bp(page, "payment-type").selectOption("INTERNAL");
  await bp(page, "payment-from-account").selectOption(demo.transferFromAccount);
  await bp(page, "payment-to-account").selectOption(demo.transferToAccount);
  await bp(page, "payment-amount").fill("1.23");
  await bp(page, "payment-reference").fill(`E2E reversal source ${Date.now()}`);
  await bp(page, "payment-submit").click();
  const paymentStatus = bp(page, "status-payment-status");
  await expect(paymentStatus).toContainText(/was booked/i);
  const paymentReference = (await paymentStatus.textContent())?.match(/PAY-[A-Z0-9-]+/)?.[0];
  expect(paymentReference).toBeTruthy();

  await page.goto(`/payments/${paymentReference}`);
  await bp(page, "payment-reversal-reason").fill("Duplicate transfer created by the E2E journey");
  await bp(page, "payment-reversal-request-submit").click();
  const requestStatus = bp(page, "status-payment-reversal-request-status");
  await expect(requestStatus).toContainText(/pending independent approval/i);
  const reversalReference = (await requestStatus.textContent())?.match(/REV-[A-Z0-9-]+/)?.[0];
  expect(reversalReference).toBeTruthy();

  await bp(page, "sign-out").click();
  await login(page, "supervisor");
  await page.goto(`/payment-reversals/${reversalReference}`);
  await expectReady(page, "payment-reversal-detail");
  await bp(page, "payment-reversal-decision-comment").fill("Original payment and duplicate evidence verified");
  await bp(page, "payment-reversal-decision-submit").click();
  await expect(bp(page, "status-payment-reversal-decision-status")).toContainText(/booked exactly once/i);
});
