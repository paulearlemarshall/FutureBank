import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("submits and independently approves a loan with exact booking evidence", async ({ page }) => {
  await login(page, "operator");
  await page.goto("/loans/new");
  await expectReady(page, "loan-application");
  await bp(page, "loan-customer-number").selectOption("C000004");
  await bp(page, "loan-product-code").selectOption("LOAN-GBP");
  await bp(page, "loan-destination-account").selectOption("1000000009");
  await bp(page, "loan-principal").fill("12000.00");
  await bp(page, "loan-term-months").fill("12");
  await bp(page, "loan-monthly-income").fill("20000.00");
  await bp(page, "loan-monthly-commitments").fill("1000.00");
  await bp(page, "loan-risk-grade").selectOption("B");
  await bp(page, "loan-purpose").fill("Fictional working-capital evidence for the browser origination journey.");
  await bp(page, "loan-application-submit").click();
  const submissionStatus = bp(page, "status-loan-application-status");
  await expect(submissionStatus).toContainText(/entered independent review/i);
  const applicationReference = (await submissionStatus.textContent())?.match(/LOA-[0-9]+/)?.[0];
  expect(applicationReference).toBeTruthy();

  await bp(page, "sign-out").click();
  await login(page, "supervisor");
  await page.goto(`/loans/${applicationReference}`);
  await expectReady(page, "loan-application-detail");
  await bp(page, "loan-decision-comment").fill("Affordability, eligibility, product pricing, and destination evidence independently verified.");
  await bp(page, "loan-decision-submit").click();
  await expect(bp(page, "status-loan-booking-status")).toContainText(/Booked once as TX-LOA-/i, { timeout: 20_000 });
  await expect(bp(page, "loan-schedule-table").locator("tbody tr")).toHaveCount(12);
});
