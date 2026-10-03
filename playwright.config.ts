import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end QC suite. Runs against a production build on a dedicated port
 * (3100) so it never fights a dev server on 3000 for the port or build lock.
 *
 * Prerequisites: `docker compose up -d`, `npm run db:seed`, `npm run build`.
 * Or simply run `npm run test:e2e`, which seeds and builds first.
 * The suite logs in as seeded users, so the seed must be present.
 */
const QC_PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  // Serial: specs share one database and observe each other's data.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${QC_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Match the reporter's locale/timezone: proves date rendering is
    // locale-independent (a classic hydration-mismatch source).
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next start -p ${QC_PORT}`,
    url: `http://localhost:${QC_PORT}/login`,
    // Never attach to a stray server: a wrong build or wrong AUTH_URL makes
    // logins bounce to another origin and tests fail confusingly. If the port
    // is busy the run errors immediately instead of testing the wrong thing.
    reuseExistingServer: false,
    timeout: 120_000,
    // Auth.js builds absolute redirect URLs from AUTH_URL — it must match
    // the port under test or logins bounce to the wrong origin.
    env: {
      ...process.env,
      AUTH_URL: `http://localhost:${QC_PORT}`,
      APP_URL: `http://localhost:${QC_PORT}`,
    } as Record<string, string>,
  },
});
