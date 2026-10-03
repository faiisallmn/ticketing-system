import type { Page } from "@playwright/test";

/** Collects console errors + uncaught exceptions (incl. hydration mismatches). */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

export async function gotoSettled(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("load");
  // Let hydration effects and deferred fetches finish.
  await page.waitForTimeout(400);
}
