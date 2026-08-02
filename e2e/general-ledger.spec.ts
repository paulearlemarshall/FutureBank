import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("submits and independently posts a manual general-ledger journal", async ({ page }) => {
  await login(page, "supervisor");
  await page.goto("/general-ledger");
  await expectReady(page, "general-ledger");
  await bp(page, "general-ledger-currency").selectOption("GBP");
  await bp(page, "general-ledger-debit-account").selectOption("5100-GBP");
  await bp(page, "general-ledger-credit-account").selectOption("1100-GBP");
  await bp(page, "general-ledger-amount").fill("17.25");
  await bp(page, "general-ledger-description").fill("Fictional browser accrual correction");
  await bp(page, "general-ledger-submission-comment").fill("Prepared from the fictional browser control evidence.");
  await bp(page, "general-ledger-journal-submit").click();
  const submissionStatus = bp(page, "status-general-ledger-journal-status");
  await expect(submissionStatus).toContainText(/entered independent Admin review/i);
  const reference = (await submissionStatus.textContent())?.match(/GLJ-[0-9]+/)?.[0];
  expect(reference).toBeTruthy();

  await bp(page, "sign-out").click();
  await login(page, "admin");
  await page.goto(`/general-ledger/journals/${reference}`);
  await expectReady(page, "general-ledger-journal-detail");
  await bp(page, "general-ledger-journal-decision").selectOption("APPROVE");
  await bp(page, "general-ledger-journal-decision-comment").fill("Independent Admin review confirms the fictional accounting evidence.");
  await bp(page, "general-ledger-journal-decision-submit").click();
  await expect(bp(page, "status-general-ledger-journal-control-state")).toContainText(/Posted debit and credit totals/i, { timeout: 20_000 });
  await expect(bp(page, "general-ledger-journal-details")).toContainText("bp.admin");
});
