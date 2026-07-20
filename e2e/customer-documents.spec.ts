import { expect, test } from "@playwright/test";
import { bp, expectReady, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("shows Amelia Hart's seeded Passport and National ID", async ({ page }) => {
  await page.goto("/customers/C000001?tab=documents");
  await expectReady(page, "customer-detail");
  await expect(bp(page, "document-slot-passport")).toContainText("Passport-AmeliaHart.jpg");
  await expect(bp(page, "document-slot-national-id")).toContainText("EmiratesID-AmeliaHart.jpg");
  const response = await page.request.get("/customers/C000001/documents/PASSPORT");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/jpeg");
  expect((await response.body()).byteLength).toBe(58533);
});

test("uploads and deletes a document through the browser", async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Vercel Blob completion callbacks require a reachable preview URL");
  await page.goto("/customers/C000006?tab=documents");
  await expectReady(page, "customer-detail");
  const file = bp(page, "document-file-national-id");
  await file.setInputFiles({ name: "browser-fixture.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]) });
  await bp(page, "document-upload-national-id").click();
  await expect(bp(page, "status-document-national-id")).toContainText(/uploaded/i, { timeout: 30_000 });
  await expect(bp(page, "document-slot-national-id")).toContainText("browser-fixture.jpg", { timeout: 30_000 });
  await bp(page, "document-delete-confirm-national-id").check();
  await bp(page, "document-delete-national-id").click();
  await expect(bp(page, "status-document-national-id")).toContainText(/deleted/i, { timeout: 30_000 });
});
