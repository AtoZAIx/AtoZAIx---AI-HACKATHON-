import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against their own production build on a separate port, so
 * they never reset or restart the dev server on :3000. They always use the
 * payment simulator, even when .env.local holds PayPal Sandbox keys.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  // One shared in-memory store: run serially so stock and orders are predictable.
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      // A fresh audit log per run, so trust scores and lockouts start clean.
      NEXUS_DATA_DIR: join(tmpdir(), `nexus-e2e-${Date.now()}`),
      NEXUS_PACE_MS: "40",
      NEXUS_PAYMENTS: "simulated",
      // Never touch the real Supabase project from tests.
      NEXUS_SUPABASE: "off",
      NEXUS_ALLOW_RESET: "1",
      // Production has no dev passcode fallback, so give the test stores one.
      NEXUS_MERCHANT_PASSCODE_ATELIER: "nexus-dev",
      NEXUS_MERCHANT_PASSCODE_BOLT: "nexus-dev",
      NEXUS_MERCHANT_PASSCODE_COVE: "nexus-dev",
    },
  },
});
