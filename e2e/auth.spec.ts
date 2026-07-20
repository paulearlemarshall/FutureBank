import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test("anonymous users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expectReady(page, "login");
});

test("invalid credentials show a generic error", async ({ page }) => {
  await page.goto("/login");
  await bp(page, "login-username").fill(demo.operatorUsername);
  await bp(page, "login-password").fill("definitely-wrong");
  await bp(page, "login-submit").click();
  await expect(bp(page, "status-login-status")).toContainText(/invalid|incorrect/i);
  await expect(page).toHaveURL(/\/login/);
});

test("operator can sign in and sign out", async ({ page }) => {
  await login(page);
  await bp(page, "sign-out").click();
  await expect(page).toHaveURL(/\/login/);
});

test("operator cannot access the admin reset page", async ({ page }) => {
  await login(page);
  await page.goto("/admin/reset");
  await expect(page).not.toHaveURL(/\/admin\/reset$/);
});
