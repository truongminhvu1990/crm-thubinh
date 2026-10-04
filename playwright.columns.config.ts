import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Phase 1.6 Wave B0 - ColumnManager browser matrix. Separate from playwright.config.ts (shared by every other suite).
// Run against a production build pointed at DEV, with the QA harness enabled on the server:
//   COLUMN_MANAGER_QA_HARNESS=1 next start -p 3200   then
//   QA_BASE_URL=http://localhost:3200 npx playwright test -c playwright.columns.config.ts
// "webkit-*" projects are Playwright's WebKit build (the Safari engine); they approximate Safari but are NOT Safari itself.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./tests/column-management-b0",
  outputDir: "./artifacts/test-results-columns",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: process.env.PW_JSON_OUT ?? "artifacts/columns-matrix.json" }]],
  use: {
    baseURL: process.env.QA_BASE_URL || "http://localhost:3200",
    locale: "en-US",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit-mobile", use: { ...devices["iPhone 14"] } },
    { name: "edge-desktop", use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1440, height: 900 } } },
  ],
});
