import { expect, test } from "@playwright/test";

const apiKey = process.env.FUTUREBANK_API_KEY;

test("serves the OpenAPI 3 artifact without authentication", async ({ request }) => {
  const response = await request.get("/api/openapi.json");
  expect(response.ok()).toBe(true);
  const document = await response.json();
  expect(document.openapi).toMatch(/^3\.0\./);
  expect(document.paths["/payments"].post).toBeDefined();
  expect(document.paths["/payment-instructions"].post).toBeDefined();
  expect(document.paths["/payment-instructions/processing-runs"].post).toBeDefined();
  expect(document.paths["/direct-debits/{mandateReference}/collections"].post).toBeDefined();
  expect(document.paths["/payments/{paymentReference}/reversals"].post).toBeDefined();
  expect(document.paths["/payment-reversals/{reversalReference}/decision"].post).toBeDefined();
  expect(document.paths["/end-of-day-runs"].post).toBeDefined();
  expect(document.paths["/end-of-day-runs/{runReference}"].get).toBeDefined();
  expect(document.paths["/reconciliation-runs"].post).toBeDefined();
  expect(document.paths["/reconciliation-runs/{runReference}/items/{itemReference}/resolution"].post).toBeDefined();
  expect(document.paths["/customers/{customerNumber}/documents/{slot}"].put).toBeDefined();
  expect(document.paths["/customers/{customerNumber}/documents/{slot}"].delete).toBeDefined();
  expect(document.paths["/customers/{customerNumber}/documents/{slot}/content"].get.responses["200"].content["image/jpeg"].schema.format).toBe("binary");
});

test("reads Amelia Hart's seeded private document metadata and content", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey! };
  const slots = await request.get("/api/v1/customers/C000001/documents", { headers });
  expect(slots.ok()).toBe(true);
  expect((await slots.json()).data).toEqual(expect.arrayContaining([
    expect.objectContaining({ slot: "PASSPORT", filename: "Passport-AmeliaHart.jpg", sizeBytes: 58533 }),
    expect.objectContaining({ slot: "NATIONAL_ID", filename: "EmiratesID-AmeliaHart.jpg", sizeBytes: 85430 }),
  ]));
  const content = await request.get("/api/v1/customers/C000001/documents/PASSPORT/content", { headers });
  expect(content.ok()).toBe(true);
  expect(content.headers()["content-type"]).toContain("image/jpeg");
  expect(content.headers()["content-length"]).toBe("58533");
  expect(content.headers().etag).toBeTruthy();
  expect(content.headers()["cache-control"]).toBe("no-store");
  expect((await content.body()).byteLength).toBe(58533);
});

test("requires multipart form data for customer document uploads", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const response = await request.put("/api/v1/customers/C000006/documents/PASSPORT", {
    headers: { "X-API-Key": apiKey!, "X-Staff-Username": "bp.operator", "Content-Type": "application/json" },
    data: { file: "not-binary" },
  });
  expect(response.status()).toBe(415);
  expect(await response.json()).toEqual({
    error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Customer document uploads require multipart/form-data with a file field." },
  });
});

test("enforces document write permissions without mutating data", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const response = await request.put("/api/v1/customers/C000001/documents/PASSPORT", {
    headers: { "X-API-Key": apiKey!, "X-Staff-Username": "bp.supervisor" },
    multipart: { file: { name: "tiny.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) } },
  });
  expect(response.status()).toBe(403);
});

test("uploads, reads and deletes a customer document through the REST API", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey!, "X-Staff-Username": "bp.operator" };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
  const upload = await request.put("/api/v1/customers/C000006/documents/NATIONAL_ID", {
    headers,
    multipart: { file: { name: "api-fixture.jpg", mimeType: "image/jpeg", buffer: jpeg } },
  });
  const uploadBody = await upload.json();
  expect(upload.status(), JSON.stringify(uploadBody)).toBe(201);
  expect(uploadBody.data).toMatchObject({ slot: "NATIONAL_ID", filename: "api-fixture.jpg", sizeBytes: jpeg.byteLength });

  const content = await request.get("/api/v1/customers/C000006/documents/NATIONAL_ID/content", { headers });
  expect(content.ok()).toBe(true);
  expect(await content.body()).toEqual(jpeg);

  const deleted = await request.delete("/api/v1/customers/C000006/documents/NATIONAL_ID", { headers });
  expect(deleted.ok()).toBe(true);
  expect((await deleted.json()).data).toEqual({ deleted: true });
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

test("discovers seeded payment instructions through the authenticated API", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey! };
  const discovery = await request.get("/api/v1", { headers });
  expect(discovery.ok()).toBe(true);
  expect((await discovery.json()).data).toMatchObject({ version: "1.6.0", resources: expect.arrayContaining(["payment-instructions", "payment-reversals", "direct-debits", "end-of-day-runs", "reconciliation-runs"]) });
  const list = await request.get("/api/v1/payment-instructions", { headers });
  expect(list.ok()).toBe(true);
  expect((await list.json()).data).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: "PIN-000001", type: "SCHEDULED", status: "ACTIVE", frequency: "ONCE" }),
    expect.objectContaining({ reference: "PIN-000002", type: "STANDING_ORDER", status: "ACTIVE", frequency: "MONTHLY" }),
    expect.objectContaining({ reference: "PIN-000003", status: "CANCELLED" }),
  ]));
});

test("discovers the deterministic failed end-of-day run", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey! };
  const response = await request.get("/api/v1/end-of-day-runs", { headers });
  expect(response.ok()).toBe(true);
  expect((await response.json()).data).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: "EOD-000001", status: "FAILED", attempted: 0, booked: 0, failed: 1, postings: [] }),
  ]));
  const detail = await request.get("/api/v1/end-of-day-runs/EOD-000001", { headers });
  expect(detail.ok()).toBe(true);
  expect((await detail.json()).data.errorMessage).toContain("Fictional clearing control unavailable");
});

test("runs and resolves clearing reconciliation through the authenticated API", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey!, "X-Staff-Username": "bp.supervisor" };
  const runResponse = await request.post("/api/v1/reconciliation-runs", { headers, data: { businessDate: "2026-07-18" } });
  expect(runResponse.status()).toBe(202);
  const runState = (await runResponse.json()).data as { message: string };
  expect(runState.message).toContain("17 matched, 2 exceptions");
  const runReference = runState.message.match(/REC-[A-Z0-9-]+/)?.[0];
  expect(runReference).toBeTruthy();

  const detailResponse = await request.get(`/api/v1/reconciliation-runs/${runReference}`, { headers });
  expect(detailResponse.ok()).toBe(true);
  const detail = (await detailResponse.json()).data as { items: Array<{ reference: string; status: string; version: number }> };
  const exception = detail.items.find((item) => item.status === "OPEN");
  expect(exception).toBeDefined();
  const resolution = await request.post(`/api/v1/reconciliation-runs/${runReference}/items/${exception!.reference}/resolution`, {
    headers, data: { expectedVersion: exception!.version, comment: "Resolved through the authenticated fictional API control journey." },
  });
  expect(resolution.ok(), await resolution.text()).toBe(true);
  const reread = await request.get(`/api/v1/reconciliation-runs/${runReference}`, { headers });
  expect((await reread.json()).data.items).toEqual(expect.arrayContaining([expect.objectContaining({ reference: exception!.reference, status: "RESOLVED", version: 2 })]));
});

test("discovers deterministic direct debit mandate lifecycles", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const response = await request.get("/api/v1/direct-debits", { headers: { "X-API-Key": apiKey! } });
  expect(response.ok()).toBe(true);
  expect((await response.json()).data).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: "DDM-000001", status: "ACTIVE", maximumSingleAmount: "500.00" }),
    expect.objectContaining({ reference: "DDM-000002", status: "SUSPENDED" }),
    expect.objectContaining({ reference: "DDM-000003", status: "CANCELLED" }),
  ]));
});

test("discovers the deterministic pending payment reversal", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const response = await request.get("/api/v1/payment-reversals", { headers: { "X-API-Key": apiKey! } });
  expect(response.ok()).toBe(true);
  expect((await response.json()).data).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: "REV-000001", originalPaymentReference: "PAY-000002", status: "PENDING_APPROVAL" }),
  ]));
  const filtered = await request.get("/api/v1/payment-reversals?status=BOOKED", { headers: { "X-API-Key": apiKey! } });
  expect(filtered.ok()).toBe(true);
  expect((await filtered.json()).data).toEqual([]);
});

test("downloads an authenticated exact-value CSV account statement", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const response = await request.get("/api/v1/accounts/1000000001/statement?from=2026-01-01&to=2026-12-31", { headers: { "X-API-Key": apiKey! } });
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toContain("FutureBank-1000000001-2026-01-01-2026-12-31.csv");
  expect(response.headers()["cache-control"]).toBe("no-store");
  const csv = (await response.body()).toString("utf8");
  expect(csv).toContain('"Opening balance"');
  expect(csv).toContain('"Value date","Booked at","Reference"');
  expect(csv).toContain('"GBP"');
});

test("round-trips Arabic customer text through authenticated API reads and writes", async ({ request }) => {
  expect(apiKey, "FUTUREBANK_API_KEY must be configured for API tests").toBeTruthy();
  const headers = { "X-API-Key": apiKey!, "X-Staff-Username": "bp.operator" };
  const search = await request.get(`/api/v1/customers?query=${encodeURIComponent("المنصوري")}`, { headers });
  expect(search.ok()).toBe(true);
  expect((await search.json()).data).toEqual([
    expect.objectContaining({ customerNumber: "C000002", displayName: "عمر المنصوري" }),
  ]);

  const detailResponse = await request.get("/api/v1/customers/C000002", { headers });
  expect(detailResponse.ok()).toBe(true);
  const detail = (await detailResponse.json()).data;
  expect(detail).toMatchObject({
    givenName: "عمر",
    familyName: "المنصوري",
    language: "Arabic",
    addresses: [expect.objectContaining({ line1: "١١ شارع المثال", city: "دبي" })],
  });

  const primaryAddress = detail.addresses[0];
  const email = detail.contacts.find((item: { type: string }) => item.type === "EMAIL").value;
  const phone = detail.contacts.find((item: { type: string }) => item.type === "MOBILE").value;
  const originalAddress = primaryAddress.line1;
  const updatedAddress = "١١ شارع المثال، اختبار API";
  const payload = {
    partyType: detail.partyType, title: detail.title, givenName: detail.givenName, familyName: detail.familyName,
    legalName: detail.legalName, shortName: detail.shortName, dateOfBirth: detail.dateOfBirth, registrationNumber: detail.registrationNumber,
    nationality: detail.nationality, residenceCountry: detail.residenceCountry, status: detail.status, kycStatus: detail.kycStatus,
    riskRating: detail.riskRating, kycReviewDate: detail.kycReviewDate, language: detail.language, taxId: detail.taxId,
    branchCode: detail.branchCode, relationshipManager: detail.relationshipManager, sector: detail.sector, industry: detail.industry,
    addressLine1: updatedAddress, city: primaryAddress.city, postalCode: primaryAddress.postalCode, country: primaryAddress.country,
    email, phone,
  };
  let changed = false;
  try {
    const update = await request.patch("/api/v1/customers/C000002", { headers, data: payload });
    changed = update.ok();
    expect(update.ok(), await update.text()).toBe(true);
    const reread = await request.get("/api/v1/customers/C000002", { headers });
    expect((await reread.json()).data.addresses[0].line1).toBe(updatedAddress);
  } finally {
    if (changed) {
      const restore = await request.patch("/api/v1/customers/C000002", {
        headers,
        data: { ...payload, addressLine1: originalAddress },
      });
      expect(restore.ok(), await restore.text()).toBe(true);
    }
  }
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
