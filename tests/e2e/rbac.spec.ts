import { test, expect } from "@playwright/test";
import { gotoSettled, trackConsoleErrors } from "./helpers";

test.use({ storageState: "playwright/.auth/requester.json" });

test("requester sees only their own tickets", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await gotoSettled(page, "/tickets");

  await expect(page.getByRole("heading", { name: "My tickets" })).toBeVisible();
  // Seeded requester1 tickets are visible…
  await expect(page.getByText("Cannot log in after password reset")).toBeVisible();
  // …but another requester's invoice ticket is not.
  await expect(page.getByText("INV-2041")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("requester gets 403 on staff-only areas", async ({ page }) => {
  for (const url of ["/team", "/admin/categories", "/admin/sla", "/admin/automation", "/reports"]) {
    await page.goto(url);
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  }
});

test("requester cannot open someone else's ticket", async ({ page }) => {
  // requester2's invoice ticket is TK-000003 (seeded); direct navigation 404s.
  await page.goto("/tickets/TK-000003");
  await expect(page.getByText("This page could not be found")).toBeVisible();
});

test("requester uses settings but not user admin", async ({ page }) => {
  await gotoSettled(page, "/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.goto("/admin/users");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
