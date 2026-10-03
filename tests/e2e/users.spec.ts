import { test, expect, type Page, request as baseRequest } from "@playwright/test";
import { hash as bcryptHash } from "bcryptjs";
import { gotoSettled, trackConsoleErrors } from "./helpers";
import { cleanupE2E, query, scalar } from "./db";

test.use({ storageState: "playwright/.auth/admin.json" });

test.beforeAll(async () => {
  await cleanupE2E();
});

test.afterAll(async () => {
  await cleanupE2E();
});

const EMAIL = "e2e-pw-user@example.com";

/**
 * Request-level sign-in check with an isolated cookie jar per call, so stale
 * sessions from earlier steps can never leak into the verdict. A failed
 * sign-in redirects back to /login with ?error=.
 */
async function loginOk(page: Page, email: string, password: string): Promise<boolean> {
  const origin = new URL(page.url()).origin;
  const ctx = await baseRequest.newContext({ baseURL: origin });
  try {
    const csrfRes = await ctx.get("/api/auth/csrf");
    if (!csrfRes.ok()) return false;
    const { csrfToken } = await csrfRes.json();
    const res = await ctx.post("/api/auth/callback/credentials", {
      form: { csrfToken, email, password, redirectTo: "/" },
      maxRedirects: 0,
    });
    if (res.status() !== 302) return false;
    if ((res.headers()["location"] ?? "").includes("error=")) return false;
    const session = await ctx.get("/api/auth/session");
    if (!session.ok()) return false;
    const body = await session.json();
    return body?.user?.email === email;
  } finally {
    await ctx.dispose();
  }
}

async function openTempUser(page: Page) {
  await page.goto("/admin/users");
  await page
    .getByRole("row", { name: /e2e-pw-user@example.com/ })
    .getByRole("link", { name: "Edit" })
    .click();
}

async function tempUserRow(page: Page) {
  await page.goto("/admin/users");
  return page.getByRole("row", { name: /e2e-pw-user@example.com/ });
}

test("admin creates, edits, deactivates and deletes a user", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  // Create.
  await gotoSettled(page, "/admin/users/new");
  await page.getByLabel("Full name").fill("E2E PW User");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Temporary password").fill("TempPass123!");
  await page.getByLabel("Role").selectOption("AGENT");
  await page.getByRole("button", { name: "Create user" }).click();
  await page.waitForURL("/admin/users");
  await expect(page.getByText("E2E PW User")).toBeVisible();

  // The new account signs in.
  expect(await loginOk(page, EMAIL, "TempPass123!")).toBe(true);

  // Promote to manager.
  await openTempUser(page);
  await page.getByLabel("Role").selectOption("MANAGER");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect((await tempUserRow(page)).getByText("Manager")).toBeVisible();

  // Deactivate: sign-in stops working.
  await openTempUser(page);
  await page.getByLabel(/Account active/).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect((await tempUserRow(page)).getByText("Disabled")).toBeVisible();
  expect(await loginOk(page, EMAIL, "TempPass123!")).toBe(false);

  // Reactivate + reset password by admin.
  await openTempUser(page);
  await page.getByLabel(/Account active/).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await openTempUser(page);
  await page.getByLabel("New temporary password").fill("ResetPass456!");
  await page.getByRole("button", { name: "Reset password" }).click();
  // The form clears itself only after the server action succeeds.
  await expect(page.getByLabel("New temporary password")).toHaveValue("");
  expect(await loginOk(page, EMAIL, "TempPass123!")).toBe(false);
  expect(await loginOk(page, EMAIL, "ResetPass456!")).toBe(true);

  // Delete (no ticket history yet).
  await openTempUser(page);
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL("/admin/users");
  await expect(page.getByText("E2E PW User")).not.toBeVisible();
  expect(await loginOk(page, EMAIL, "ResetPass456!")).toBe(false);

  expect(errors).toEqual([]);
});

test("admin cannot demote or disable themselves", async ({ page }) => {
  await gotoSettled(page, "/admin/users");
  await page.getByRole("row", { name: /Alice Admin/ }).getByRole("link", { name: "Edit" }).click();

  await page.getByLabel("Role").selectOption("AGENT");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator('form [role="alert"]')).toContainText("You cannot change your own role.");
});

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/tickets/);
}

async function signOut(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

test("settings lets users update their profile", async ({ page }) => {
  test.setTimeout(120_000);
  const hash = await bcryptHash("TempPass123!", 10);
  await query(
    `INSERT INTO users (id, name, email, "passwordHash", role, "isActive", "sessionVersion", "createdAt", "updatedAt")
     VALUES ('e2e-prof', 'E2E PW Prof', 'e2e-pw-prof@example.com', $1, 'AGENT', true, 0, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [hash],
  );

  await signOut(page);
  await signInAs(page, "e2e-pw-prof@example.com", "TempPass123!");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByLabel("Full name").fill("E2E PW Renamed");
  await page.getByLabel("Job title").fill("QC Engineer");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("E2E PW Renamed");
  const stored = await scalar<string>(
    `SELECT name FROM users WHERE email = 'e2e-pw-prof@example.com'`,
  );
  expect(stored).toBe("E2E PW Renamed");
});

test("settings password change signs sessions out", async ({ page }) => {
  test.setTimeout(120_000);
  const hash = await bcryptHash("TempPass123!", 10);
  await query(
    `INSERT INTO users (id, name, email, "passwordHash", role, "isActive", "sessionVersion", "createdAt", "updatedAt")
     VALUES ('e2e-pass', 'E2E PW Pass', 'e2e-pw-pass@example.com', $1, 'AGENT', true, 0, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [hash],
  );

  await signOut(page);
  await signInAs(page, "e2e-pw-pass@example.com", "TempPass123!");
  await page.goto("/settings");

  // Wrong current password is rejected.
  await page.getByLabel("Current password").fill("nope-wrong");
  await page.getByLabel("New password").fill("BrandNew789!");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator('form [role="alert"]')).toContainText("Current password is incorrect.");

  // Right one signs every session out.
  await page.getByLabel("Current password").fill("TempPass123!");
  await page.getByLabel("New password").fill("BrandNew789!");
  await page.getByRole("button", { name: "Change password" }).click();
  await page.waitForURL(/\/login/);

  await signInAs(page, "e2e-pw-pass@example.com", "BrandNew789!");
  await expect(page.getByRole("heading", { name: /Tickets|My tickets/ })).toBeVisible();
});
