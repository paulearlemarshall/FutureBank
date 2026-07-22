import { expect, test } from "@playwright/test";
import { bp, demo, expectReady, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page));

test("finds a seeded customer and persists an edit", async ({ page }) => {
  await page.goto("/customers");
  await expectReady(page, "customers");
  await bp(page, "customer-search-query").fill(demo.customerNumber);
  await bp(page, "customer-search-submit").click();
  await expect(page.getByRole("link", { name: new RegExp(demo.customerNumber) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(demo.customerNumber) }).click();
  await expectReady(page, "customer-detail");
  await bp(page, "customer-edit").click();
  await expectReady(page, "customer-edit");

  const field = bp(page, "customer-phone");
  const original = await field.inputValue();
  const changed = original.endsWith("1") ? `${original.slice(0, -1)}2` : `${original.slice(0, -1)}1`;
  await field.fill(changed);
  await bp(page, "customer-save").click();
  await expect(bp(page, "status-customer-form-status")).toContainText(/saved|updated/i);

  await page.reload();
  await expect(bp(page, "customer-phone")).toHaveValue(changed);
  await bp(page, "customer-phone").fill(original);
  await bp(page, "customer-save").click();
  await expect(bp(page, "status-customer-form-status")).toContainText(/saved|updated/i);
});

test("searches and edits the seeded Arabic retail customer with stable bidi controls", async ({ page }) => {
  await page.goto(`/customers?query=${encodeURIComponent("المنصوري")}`);
  await expectReady(page, "customers");
  await expect(bp(page, "customer-search-query")).toHaveAttribute("dir", "auto");
  const row = bp(page, "customer-row-C000002");
  await expect(row).toContainText("عمر المنصوري");
  await bp(page, "customer-open-C000002").click();
  await expectReady(page, "customer-detail");
  await expect(bp(page, "customer-display-name")).toHaveText("عمر المنصوري");
  await expect(bp(page, "customer-display-name")).toHaveAttribute("dir", "auto");

  await bp(page, "customer-edit").click();
  await expectReady(page, "customer-edit");
  await expect(bp(page, "customer-given-name")).toHaveValue("عمر");
  await expect(bp(page, "customer-given-name")).toHaveAttribute("dir", "auto");
  await expect(bp(page, "customer-address-line1")).toHaveValue("١١ شارع المثال");
  await expect(bp(page, "customer-address-line1")).toHaveAttribute("dir", "auto");
  await expect(bp(page, "customer-tax-id")).toHaveAttribute("dir", "ltr");
  await bp(page, "customer-address-line1").fill("١١ شارع المثال");
  await bp(page, "customer-save").click();
  await expect(bp(page, "status-customer-form-status")).toContainText(/saved|updated/i);

  await page.goto(`/customers?query=${encodeURIComponent("Crescent Digital")}`);
  await expectReady(page, "customers");
  await expect(bp(page, "customer-row-C000005")).toContainText("شركة الهلال للتجارة الرقمية");
});

test("onboards a fully populated fictional retail customer", async ({ page }) => {
  await page.goto("/customers/new");
  await expectReady(page, "customer-new");
  const suffix = Date.now().toString().slice(-8);
  const values: Record<string, string> = {
    "customer-given-name": "Elena",
    "customer-family-name": `Demo${suffix}`,
    "customer-short-name": `E DEMO ${suffix}`,
    "customer-date-of-birth": "1990-06-15",
    "customer-nationality": "GB",
    "customer-residence-country": "GB",
    "customer-language": "English",
    "customer-industry": "Professional Services",
    "customer-sector": "Personal Banking",
    "customer-kyc-review-date": "2027-06-15",
    "customer-tax-id": `FIC-E2E-${suffix}`,
    "customer-relationship-manager": "Sofia Bennett",
    "customer-address-line1": "99 Fictional Avenue",
    "customer-city": "London",
    "customer-postal-code": "EC1A 1AA",
    "customer-address-country": "GB",
    "customer-email": `elena.${suffix}@futurebank.example`,
    "customer-phone": `+447700${suffix}`,
  };
  await bp(page, "customer-party-type").selectOption("RETAIL");
  await bp(page, "customer-title").selectOption("Ms");
  await bp(page, "customer-risk-rating").selectOption("LOW");
  await bp(page, "customer-kyc-status").selectOption("APPROVED");
  await bp(page, "customer-branch-code").selectOption("LON001");
  for (const [selector, value] of Object.entries(values)) {
    await bp(page, selector).fill(value);
  }
  await bp(page, "customer-save").click();
  await expect(bp(page, "status-customer-form-status")).toContainText(/created/i);

  await page.goto(`/customers?query=${encodeURIComponent(values["customer-family-name"])}`);
  await expectReady(page, "customers");
  await expect(page.getByRole("row", { name: new RegExp(values["customer-family-name"]) })).toBeVisible();
});
