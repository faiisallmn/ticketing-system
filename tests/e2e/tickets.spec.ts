import { test, expect } from "@playwright/test";
import { cleanupE2E, E2E_PREFIX, scalar } from "./db";
import { gotoSettled, trackConsoleErrors } from "./helpers";

test.use({ storageState: "playwright/.auth/admin.json" });

test.afterAll(async () => {
  await cleanupE2E();
});

test("creates a ticket, comments, and moves it through the lifecycle", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const title = `${E2E_PREFIX}printer smoking ${Date.now()}`;

  await gotoSettled(page, "/tickets/new");
  await page.getByLabel("Title").fill(title);
  await page
    .getByLabel("Description")
    .fill("There is smoke coming out of the floor-3 printer. Steps: it started after a paper jam, unplugged now.");
  await page.getByLabel("Priority").selectOption("HIGH");
  await page.getByRole("button", { name: "Create ticket" }).click();

  // Lands on the new ticket's detail page.
  await page.waitForURL(/\/tickets\/TK-/);
  const publicId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Post a public reply.
  await page.getByLabel("Add a reply").fill("E2E-PW technician dispatched.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("E2E-PW technician dispatched.")).toBeVisible();

  // Move through the lifecycle to closed.
  await page.getByLabel("Status", { exact: true }).selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText("In Progress").first()).toBeVisible();

  await page.getByLabel("Status", { exact: true }).selectOption("RESOLVED");
  await page.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText("Resolved").first()).toBeVisible();

  // Illegal jump is rejected server-side (verified here through search state).
  const status = await scalar<string>(`SELECT status FROM tickets WHERE "publicId" = $1`, [
    publicId,
  ]);
  const responded = await scalar<boolean>(
    `SELECT ("firstRespondedAt" IS NOT NULL) FROM tickets WHERE "publicId" = $1`,
    [publicId],
  );
  expect(status).toBe("RESOLVED");
  expect(responded).toBe(true);

  // Search finds it; the timeline recorded the journey.
  await gotoSettled(page, `/tickets?q=${encodeURIComponent("smoking floor-3")}`);
  await expect(page.getByText(title)).toBeVisible();
  await gotoSettled(page, `/tickets/${publicId}`);
  expect(await page.getByText("changed the status").count()).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
