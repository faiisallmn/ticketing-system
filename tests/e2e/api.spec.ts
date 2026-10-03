import { test, expect, type Page } from "@playwright/test";
import { cleanupE2E, scalar } from "./db";

test.use({ storageState: "playwright/.auth/admin.json" });

test.afterAll(async () => {
  await cleanupE2E();
});

async function createKey(
  page: Page,
  name: string,
  ownerLabel: string,
  scopes: Array<"tickets:read" | "tickets:write">,
): Promise<string> {
  await page.goto("/admin/api-keys");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Acts as").selectOption({ label: ownerLabel });
  for (const scope of ["tickets:read", "tickets:write"] as const) {
    const box = page.getByRole("checkbox", { name: new RegExp(scope) });
    if (scopes.includes(scope)) await box.check();
    else await box.uncheck();
  }
  await page.getByRole("button", { name: "Create key" }).click();
  const code = page.locator("code").first();
  await expect(code).toContainText("sk_");
  return (await code.textContent())!.trim();
}

test("REST API round-trip with scoped keys", async ({ page, request }) => {
  const requester2Id = await scalar<string>(
    `SELECT id FROM users WHERE email = 'requester2@support.local'`,
  );
  const adminKey = await createKey(page, "E2E-PW-admin", "Alice Admin (ADMIN)", [
    "tickets:read",
    "tickets:write",
  ]);
  const authed = (key: string) => ({ Authorization: `Bearer ${key}` });

  // List.
  const list = await request.get("/api/v1/tickets?per_page=5", { headers: authed(adminKey) });
  expect(list.status()).toBe(200);
  const listed = await list.json();
  expect(listed.data.length).toBeGreaterThan(0);
  expect(listed.meta.total).toBeGreaterThan(0);
  expect(listed.data[0].publicId).toMatch(/^TK-/);

  // Auth failures.
  expect((await request.get("/api/v1/tickets", { headers: authed("bogus") })).status()).toBe(401);
  expect((await request.get("/api/v1/tickets")).status()).toBe(401);

  // Create as requester2 (staff key filing on behalf).
  const title = `E2E-PW-api ticket ${Date.now()}`;
  const created = await request.post("/api/v1/tickets", {
    headers: authed(adminKey),
    data: {
      title,
      description: "Created through the REST API with enough detail to pass validation.",
      priority: "HIGH",
      requesterId: requester2Id,
    },
  });
  expect(created.status()).toBe(200);
  const createdBody = await created.json();
  const publicId: string = createdBody.data.publicId;
  expect(publicId).toMatch(/^TK-/);

  // Get + patch lifecycle + comment.
  const fetched = await request.get(`/api/v1/tickets/${publicId}`, { headers: authed(adminKey) });
  expect(fetched.status()).toBe(200);

  const patched = await request.patch(`/api/v1/tickets/${publicId}`, {
    headers: authed(adminKey),
    data: { status: "IN_PROGRESS" },
  });
  expect((await patched.json()).data.status).toBe("IN_PROGRESS");

  const illegal = await request.patch(`/api/v1/tickets/${publicId}`, {
    headers: authed(adminKey),
    data: { status: "CLOSED" },
  });
  expect(illegal.status()).toBe(422);
  const illegalBody = await illegal.json();
  expect(illegalBody.error.code).toBe("illegal_transition");

  const comment = await request.post(`/api/v1/tickets/${publicId}/comments`, {
    headers: authed(adminKey),
    data: { body: "E2E-PW api comment." },
  });
  expect(comment.status()).toBe(200);

  const comments = await request.get(`/api/v1/tickets/${publicId}/comments`, {
    headers: authed(adminKey),
  });
  expect(comments.status()).toBe(200);
  expect((await comments.json()).data.length).toBeGreaterThan(0);

  // Requester key only sees its own tickets.
  const reqKey = await createKey(page, "E2E-PW-requester", "Casey Requester (REQUESTER)", [
    "tickets:read",
    "tickets:write",
  ]);
  const scoped = await request.get("/api/v1/tickets", { headers: authed(reqKey) });
  expect(scoped.status()).toBe(200);
  const scopedBody = await scoped.json();
  expect(scopedBody.data.length).toBeGreaterThan(0);
  for (const ticket of scopedBody.data) {
    expect(ticket.requester.email).toBe("requester1@support.local");
  }
  expect(
    (await request.get(`/api/v1/tickets/${publicId}`, { headers: authed(reqKey) })).status(),
  ).toBe(404);

  // Read-only key cannot write.
  const readKey = await createKey(page, "E2E-PW-readonly", "Sam Agent (AGENT)", ["tickets:read"]);
  const denied = await request.post("/api/v1/tickets", {
    headers: authed(readKey),
    data: { title: "E2E-PW no", description: "Should be rejected by scope with enough detail." },
  });
  expect(denied.status()).toBe(403);
});
