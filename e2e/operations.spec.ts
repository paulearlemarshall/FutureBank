import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test("operator can inspect KYC evidence and overdraft utilization", async ({ page }) => {
  await login(page, "operator");
  await page.goto("/kyc/KYC-000003");
  await expectReady(page, "kyc-case-workspace");
  await expect(page.locator('[data-bp="kyc-evidence-table"]')).toContainText("EVD-003");
  await expect(page.locator('[data-bp="kyc-evidence-table"]')).toContainText("Pending");
  await page.goto("/overdrafts/ODF-000001");
  await expectReady(page, "overdraft-facility-detail");
  await expect(bp(page, "overdraft-metric-utilization")).toContainText("240.50");
  await expect(page.locator('[data-bp="overdraft-alert-table"]')).toContainText("Repeat use");
});

test("supervisor can inspect payment hold and approval work", async ({ page }) => {
  await login(page, "supervisor");
  await page.goto("/payments/PAY-000001");
  await expectReady(page, "payment-approval-detail");
  await expect(page.locator('[data-bp="payment-record-header"]')).toContainText("Pending");
  await expect(page.locator('[data-bp="payment-decision-controls"]')).toBeVisible();
  await expect(page.locator('[data-bp="payment-decision-controls"]')).toContainText("Approve and book");
  await page.goto("/work-queue/WRK-000001");
  await expectReady(page, "work-item-detail");
  await expect(page.locator('[data-bp="work-item-record-header"]')).toContainText("Payment approval");
});

test("compliance can inspect PEP EDD and fictional screening resolution", async ({ page }) => {
  await login(page, "compliance");
  await page.goto("/kyc/KYC-000002");
  await expectReady(page, "kyc-case-workspace");
  await expect(page.locator('[data-bp="kyc-screening-table"]')).toContainText("PEP");
  await expect(page.locator('[data-bp="kyc-screening-table"]')).toContainText("Confirmed match");
  await expect(page.locator('[data-bp="kyc-screening-table"]')).toContainText("EDD completed");
});

test("expanded baseline exposes blocked, closed, pending-change and terminal payment states", async ({ page }) => {
  await login(page, "operator");
  await page.goto("/accounts/1000000017");
  await expectReady(page, "account-detail");
  await expect(page.locator('[data-bp="account-record-header"]')).toContainText("Blocked");
  await page.goto("/accounts/1000000018");
  await expectReady(page, "account-detail");
  await expect(page.locator('[data-bp="account-record-header"]')).toContainText("Closed");
  await page.goto("/kyc/KYC-000007");
  await expectReady(page, "kyc-case-workspace");
  await expect(page.locator('[data-bp="kyc-screening-table"]')).toContainText("Possible match");
  await page.goto("/overdrafts/ODF-000006");
  await expectReady(page, "overdraft-facility-detail");
  await expect(page.locator('[data-bp="overdraft-record-header"]')).toContainText("Pending change");
  await page.goto("/payments/PAY-000004");
  await expectReady(page, "payment-approval-detail");
  await expect(page.locator('[data-bp="payment-record-header"]')).toContainText("Expired");
  await expect(bp(page, "status-payment-decision-complete")).toContainText("Expired");
});
