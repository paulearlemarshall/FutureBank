import { expect, test } from "@playwright/test";

const apiKey = process.env.FUTUREBANK_API_KEY;

test("serves the OpenAPI 3 artifact without authentication", async ({ request }) => {
  const response = await request.get("/api/openapi.json");
  expect(response.ok()).toBe(true);
  const document = await response.json();
  expect(document.openapi).toMatch(/^3\.0\./);
  expect(document.paths["/payments"].post).toBeDefined();
});

test("rejects unauthenticated business API requests", async ({ request }) => {
  const response = await request.get("/api/v1/customers");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({
    error: { code: "INVALID_API_KEY", message: "A valid FutureBank API key is required." },
  });
});

test("reads deterministic customer and account data with an API key", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey! };
  const customers = await request.get("/api/v1/customers?limit=20", { headers });
  expect(customers.ok()).toBe(true);
  expect((await customers.json()).data).toHaveLength(9);

  const account = await request.get("/api/v1/accounts/1000000001", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  expect(account.ok()).toBe(true);
  const accountBody = await account.json();
  expect(accountBody.data.accountNumber).toBe("1000000001");
  expect(accountBody.data.transactions.length).toBeGreaterThanOrEqual(25);
});

test("uses the selected staff actor for controlled work-item writes", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey!, "X-Staff-Username": "bp.supervisor" };
  const queueResponse = await request.get("/api/v1/work-items?status=OPEN", { headers });
  expect(queueResponse.ok()).toBe(true);
  const queue = (await queueResponse.json()).data as Array<{ reference: string; requiredRole: string; version: number }>;
  const item = queue.find((candidate) => candidate.requiredRole === "SUPERVISOR");
  expect(item).toBeDefined();

  const claim = await request.post(`/api/v1/work-items/${item!.reference}/claim`, {
    headers,
    data: { expectedVersion: item!.version },
  });
  expect(claim.ok(), await claim.text()).toBe(true);

  const detail = await request.get(`/api/v1/work-items/${item!.reference}`, { headers });
  const claimed = (await detail.json()).data as { status: string; version: number };
  expect(claimed.status).toBe("ASSIGNED");

  const release = await request.post(`/api/v1/work-items/${item!.reference}/release`, {
    headers,
    data: { expectedVersion: claimed.version },
  });
  expect(release.ok(), await release.text()).toBe(true);
});
