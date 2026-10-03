import { test as setup, expect, type Page } from "@playwright/test";

const AUTH_DIR = "playwright/.auth";

async function loginAs(page: Page, email: string, password: string, stateFile: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/tickets/);
  // Home redirects into the queue; the heading differs by role.
  await expect(page.getByRole("heading", { name: /Tickets|My tickets/ })).toBeVisible();
  await page.context().storageState({ path: stateFile });
}

setup("authenticate as admin", async ({ page }) => {
  await loginAs(page, "admin@support.local", "Admin1234!", `${AUTH_DIR}/admin.json`);
});

setup("authenticate as agent", async ({ page }) => {
  await loginAs(page, "agent1@support.local", "Agent1234!", `${AUTH_DIR}/agent.json`);
});

setup("authenticate as requester", async ({ page }) => {
  await loginAs(page, "requester1@support.local", "Requester1234!", `${AUTH_DIR}/requester.json`);
});
