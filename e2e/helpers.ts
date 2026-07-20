import { expect, type Locator, type Page } from "@playwright/test";

export const demo = {
  operatorUsername: process.env.DEMO_OPERATOR_USERNAME ?? "bp.operator",
  operatorPassword: process.env.DEMO_OPERATOR_PASSWORD,
  supervisorUsername: process.env.DEMO_SUPERVISOR_USERNAME ?? "bp.supervisor",
  supervisorPassword: process.env.DEMO_SUPERVISOR_PASSWORD,
  complianceUsername: process.env.DEMO_COMPLIANCE_USERNAME ?? "bp.compliance",
  compliancePassword: process.env.DEMO_COMPLIANCE_PASSWORD,
  adminUsername: process.env.DEMO_ADMIN_USERNAME ?? "bp.admin",
  adminPassword: process.env.DEMO_ADMIN_PASSWORD,
  customerNumber: process.env.DEMO_CUSTOMER_NUMBER ?? "C000001",
  accountNumber: process.env.DEMO_ACCOUNT_NUMBER ?? "1000000001",
  transferFromAccount: process.env.DEMO_TRANSFER_FROM_ACCOUNT ?? "1000000001",
  transferToAccount: process.env.DEMO_TRANSFER_TO_ACCOUNT ?? "1000000002",
};

export const bp = (page: Page, selector: string): Locator =>
  page.locator(`[data-bp="${selector}"]`);

export async function expectReady(page: Page, pageName: string) {
  const root = page.locator(`[data-bp-page="${pageName}"]`);
  await expect(root).toHaveAttribute("data-bp-ready", "true");
  return root;
}

export async function login(
  page: Page,
  role: "operator" | "supervisor" | "compliance" | "admin" = "operator",
) {
  const credentials: [string, string | undefined, string] = role === "admin" ? [demo.adminUsername, demo.adminPassword, "DEMO_ADMIN_PASSWORD"] : role === "supervisor" ? [demo.supervisorUsername, demo.supervisorPassword, "DEMO_SUPERVISOR_PASSWORD"] : role === "compliance" ? [demo.complianceUsername, demo.compliancePassword, "DEMO_COMPLIANCE_PASSWORD"] : [demo.operatorUsername, demo.operatorPassword, "DEMO_OPERATOR_PASSWORD"];
  const [username, password, variable] = credentials;
  if (!password) {
    throw new Error(`${variable} is required for Playwright authentication`);
  }
  await page.goto("/login");
  await expectReady(page, "login");
  await bp(page, "login-username").fill(
    username,
  );
  await bp(page, "login-password").fill(password);
  await bp(page, "login-submit").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectReady(page, "dashboard");
}

export async function assertBluePrismContract(page: Page, pageName: string) {
  const documentRoot = await expectReady(page, pageName);
  const duplicateSelectors = await documentRoot.locator("[data-bp]").evaluateAll((nodes) => {
    const values = nodes.map((node) => node.getAttribute("data-bp"));
    return values.filter((value, index) => value && values.indexOf(value) !== index);
  });
  expect(duplicateSelectors, `duplicate data-bp selectors on ${pageName}`).toEqual([]);

  const invalidControls = await documentRoot
    .locator('input:not([type="hidden"]), select, textarea, button')
    .evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const control = node as HTMLInputElement;
        const id = control.id;
        const name = control.getAttribute("name");
        const selector = control.getAttribute("data-bp");
        const labelled =
          Boolean(control.getAttribute("aria-label")) ||
          Boolean(control.getAttribute("aria-labelledby")) ||
          Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          (control.tagName === "BUTTON" && Boolean(control.textContent?.trim()));
        return id && name && selector && labelled
          ? []
          : [{ tag: control.tagName, id, name, selector, labelled }];
      }),
    );
  expect(invalidControls, `unspyable controls on ${pageName}`).toEqual([]);
}
