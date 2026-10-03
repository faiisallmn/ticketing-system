import { test, expect } from "@playwright/test";
import { gotoSettled, trackConsoleErrors } from "./helpers";

test.use({ storageState: "playwright/.auth/admin.json" });

/**
 * Renders every major surface and fails on ANY console error or uncaught
 * exception — including React hydration mismatches. Headless Chromium runs
 * without extensions, so anything caught here is a real code defect.
 */
test("no console errors across the app", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const urls = [
    "/",
    "/tickets",
    "/tickets/new",
    "/tickets/TK-000002",
    "/tickets?q=vpn&status=OPEN",
    "/team",
    "/canned",
    "/kb",
    "/kb/reset-your-password",
    "/notifications",
    "/admin/categories",
    "/admin/sla",
    "/admin/automation",
    "/admin/webhooks",
    "/admin/audit",
    "/reports",
  ];

  for (const url of urls) {
    await gotoSettled(page, url);
    // Reports + article render charts/markdown after mount; give them a beat.
    if (url.startsWith("/reports") || url.startsWith("/kb/")) {
      await page.waitForTimeout(800);
    }
  }

  expect(errors).toEqual([]);
});

test("theme toggle flips and persists", async ({ page }) => {
  await gotoSettled(page, "/tickets");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
