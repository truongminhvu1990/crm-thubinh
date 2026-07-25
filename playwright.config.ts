import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// QA credentials and base URL live in .env.test (gitignored).
// Copy .env.test.example -> .env.test and fill in real values before running.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

// QA Wave 1: DB-verification tests (tests/shared/utils/db.ts) reuse the
// app's own SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL instead of
// duplicating them into .env.test. dotenv never overwrites a key already
// set, so anything already in .env.test still wins.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const baseURL = process.env.QA_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./artifacts/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ["html", { outputFolder: "./artifacts/report", open: "never" }],
    ["list"],
  ],

  use: {
    baseURL,
    // QA Wave 1 diagnostics rule: capture trace/screenshot/video on
    // failure, not just on retry (retries default to 0 outside CI).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Uncomment once there is a scripted way to boot the app for CI:
  // webServer: {
  //   command: "npm run dev",
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  // },
});
