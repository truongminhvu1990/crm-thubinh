import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Phase 1.6 Wave B1.2 - Monthly Sold Products browser matrix. Separate from playwright.config.ts (shared by every other suite).
// Run against a production build pointed at DEV, with the QA harness enabled on the server:
//   next start -p 3400   then
//   QA_BASE_URL=http://localhost:3400 npx playwright test -c playwright.b12.config.ts
// "webkit-*" projects are Playwright's WebKit build (the Safari engine); they approximate Safari but are NOT Safari itself.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./tests/column-management-b1-2",
  outputDir: "./artifacts/test-results-b12",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: process.env.PW_JSON_OUT ?? "artifacts/b12-matrix.json" }]],
  use: {
    baseURL: process.env.QA_BASE_URL || "http://localhost:3400",
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
