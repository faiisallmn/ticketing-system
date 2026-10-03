import { test, expect } from "@playwright/test";

test("redirects unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to Support Desk" })).toBeVisible();
});

test("rejects a wrong password with a clear error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@support.local");
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Scoped to the form: Next.js also renders an aria-live route announcer
  // with role="alert" outside of it.
  await expect(page.locator('form [role="alert"]')).toContainText("Invalid email or password");
});

test("signs in with seeded admin credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@support.local");
  await page.getByLabel("Password").fill("Admin1234!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/tickets/);
  await expect(page.getByRole("heading", { name: /Tickets|My tickets/ })).toBeVisible();
  await expect(page.locator("aside").getByText("Alice Admin")).toBeVisible();
});

test("signed-in users are sent away from the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("agent1@support.local");
  await page.getByLabel("Password").fill("Agent1234!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/tickets/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/tickets/);
});
