import { Page } from "@playwright/test";
import path from "path";

const SCREENSHOTS_DIR = path.resolve(__dirname, "../../../artifacts/screenshots");

function sanitize(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "-");
}

/**
 * Saves a full-page screenshot to artifacts/screenshots/<name>-<timestamp>.png.
 * Use for deliberate, named captures during a test step — separate from
 * Playwright's automatic on-failure screenshots (artifacts/test-results/).
 */
export async function takeScreenshot(page: Page, name: string) {
  const fileName = `${sanitize(name)}-${Date.now()}.png`;
  const filePath = path.join(SCREENSHOTS_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
