import { test, expect, Page } from "@playwright/test";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

// Phase 1.6 Wave B0 - ColumnManager UI behaviour in a real browser, through the QA harness page (/qa/column-manager).
// Report under test: commission_aging (salesperson M, sale_amount, commission_amount M, days_pending). It is not wired to
// any real table yet, so no Production-visible behaviour depends on this row. The signed-in QA account's own preference
// row for this key is deleted before and after every test.

const T = "qa-column-manager";
const PAGE_URL = "/qa/column-manager?report=commission_aging";
const DEFAULT = ["salesperson", "sale_amount", "commission_amount", "days_pending"];

const headers = (page: Page) => page.locator('[data-testid="qa-table"] th').evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")));
const panelRows = (page: Page) => page.locator(`[data-testid="${T}-list"] li`).evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")));

// Same sequence the date-picker matrix uses: wait for the auth token response, then navigate (avoids the Next prefetch bounce).
async function login(page: Page) {
  const { email, password } = credentialsFor("OWNER");
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.fillCredentials(email, password);
  const token = page.waitForResponse((r) => r.url().includes("/auth/v1/token"), { timeout: 60_000 });
  await lp.submit();
  await token;
  // WebKit (iPhone profile) sometimes lands back on /login if the session cookie is not yet visible: retry the navigation.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.waitForTimeout(500 * (attempt + 1));
    await page.goto("/dashboard");
    if (/\/dashboard/.test(page.url())) return;
  }
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function wipe(page: Page) {
  await page.request.delete("/api/report-preferences?reportKey=commission_aging");
}
async function openPage(page: Page) {
  await page.goto(PAGE_URL);
  await expect(page.getByTestId("qa-loading")).toHaveText("ready");
}
async function openPanel(page: Page) {
  await page.getByTestId(T).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await wipe(page);
});
test.afterEach(async ({ page }) => {
  await wipe(page);
});

test("defaults, open, close button, Escape, outside click and focus return", async ({ page }) => {
  await openPage(page);
  expect(await headers(page)).toEqual(DEFAULT);
  await openPanel(page);
  expect(await panelRows(page)).toEqual(DEFAULT);
  await expect(page.getByTestId(`${T}-count`)).toHaveText("4/4 cột hiển thị");

  await page.getByTestId(`${T}-close`).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
  await expect(page.getByTestId(T)).toBeFocused();

  await openPanel(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
  await expect(page.getByTestId(T)).toBeFocused();

  await openPanel(page);
  await page.locator("h1, body").first().click({ position: { x: 5, y: 300 }, force: true });
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
});

test("panel fits the viewport", async ({ page }) => {
  await openPage(page);
  await openPanel(page);
  const box = await page.getByTestId(`${T}-panel`).boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
});

test("hide / show saves immediately and survives a reload; mandatory columns cannot be hidden", async ({ page }) => {
  await openPage(page);
  await openPanel(page);
  await expect(page.getByTestId(`${T}-check-salesperson`)).toBeDisabled();
  await expect(page.getByTestId(`${T}-check-commission_amount`)).toBeDisabled();

  await page.getByTestId(`${T}-check-days_pending`).uncheck();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(await headers(page)).toEqual(["salesperson", "sale_amount", "commission_amount"]);
  await expect(page.getByTestId(`${T}-count`)).toHaveText("3/4 cột hiển thị");

  await page.reload();
  await expect(page.getByTestId("qa-loading")).toHaveText("ready");
  expect(await headers(page)).toEqual(["salesperson", "sale_amount", "commission_amount"]);

  await openPanel(page);
  await page.getByTestId(`${T}-check-days_pending`).check();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(await headers(page)).toEqual(DEFAULT);
});

test("hiding every optional column leaves only the mandatory ones, which can still be reordered", async ({ page }) => {
  await openPage(page);
  await openPanel(page);
  await page.getByTestId(`${T}-check-sale_amount`).uncheck();
  await page.getByTestId(`${T}-check-days_pending`).uncheck();
  expect(await headers(page)).toEqual(["salesperson", "commission_amount"]);
  await page.getByTestId(`${T}-up-commission_amount`).click();
  await page.getByTestId(`${T}-up-commission_amount`).click();
  await expect.poll(() => headers(page)).toEqual(["commission_amount", "salesperson"]);
});

test("up / down buttons reorder (debounced single save) and persist", async ({ page }) => {
  await openPage(page);
  await openPanel(page);
  const puts: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && puts.push(r.postData() ?? ""));
  await page.getByTestId(`${T}-down-salesperson`).click();
  await page.getByTestId(`${T}-down-salesperson`).click();
  expect(await headers(page)).toEqual(["sale_amount", "commission_amount", "salesperson", "days_pending"]);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  expect(puts.length).toBe(1);
  expect(JSON.parse(puts[0]).columnOrder).toEqual(["sale_amount", "commission_amount", "salesperson", "days_pending"]);

  await page.reload();
  await expect(page.getByTestId("qa-loading")).toHaveText("ready");
  expect(await headers(page)).toEqual(["sale_amount", "commission_amount", "salesperson", "days_pending"]);
});

test("keyboard: arrow keys on the drag handle move the column and announce it", async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName === "webkit", "keyboard focus model differs on touch devices / WebKit; covered by buttons");
  await openPage(page);
  await openPanel(page);
  await page.getByTestId(`${T}-handle-days_pending`).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => headers(page)).toEqual(["salesperson", "sale_amount", "days_pending", "commission_amount"]);
  await expect(page.getByTestId(`${T}-live`)).toContainText("days_pending".length ? "Đã chuyển" : "");
  await expect(page.getByTestId(`${T}-handle-days_pending`)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => headers(page)).toEqual(["salesperson", "days_pending", "sale_amount", "commission_amount"]);
});

test("mouse / pen drag reorders locally while dragging and saves once on drop", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag is a desktop interaction; touch drag is covered separately");
  await openPage(page);
  await openPanel(page);
  const puts: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && puts.push(r.postData() ?? ""));
  const handle = (await page.getByTestId(`${T}-handle-days_pending`).boundingBox())!;
  const target = (await page.getByTestId(`${T}-row-sale_amount`).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 5, target.y + 2, { steps: 8 });
  await expect.poll(() => headers(page)).toEqual(["salesperson", "days_pending", "sale_amount", "commission_amount"]);
  expect(puts.length, "nothing saved while still dragging").toBe(0);
  await page.mouse.up();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(puts.length).toBe(1);
  expect(JSON.parse(puts[0]).columnOrder).toEqual(["salesperson", "days_pending", "sale_amount", "commission_amount"]);
});

test("Escape during a drag cancels it and restores the order, sending nothing", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop interaction");
  await openPage(page);
  await openPanel(page);
  const puts: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && puts.push(r.postData() ?? ""));
  const handle = (await page.getByTestId(`${T}-handle-days_pending`).boundingBox())!;
  const target = (await page.getByTestId(`${T}-row-sale_amount`).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 5, target.y + 2, { steps: 6 });
  await expect.poll(() => headers(page)).toEqual(["salesperson", "days_pending", "sale_amount", "commission_amount"]);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await headers(page)).toEqual(DEFAULT);
  await expect(page.getByTestId(`${T}-panel`)).toBeVisible();
  expect(puts.length).toBe(0);
});

test("touch drag reorders (real touch events via CDP)", async ({ page, browserName, isMobile }) => {
  test.skip(!isMobile || browserName !== "chromium", "real touch injection is available through CDP on Chromium only");
  await openPage(page);
  await openPanel(page);
  const cdp = await page.context().newCDPSession(page);
  const handle = (await page.getByTestId(`${T}-handle-days_pending`).boundingBox())!;
  const target = (await page.getByTestId(`${T}-row-sale_amount`).boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y0 = handle.y + handle.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 8; i += 1) {
    const y = y0 + ((target.y + 2 - y0) * i) / 8;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => headers(page)).toEqual(["salesperson", "days_pending", "sale_amount", "commission_amount"]);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
});

test("reset deletes the row and restores registry defaults (idempotent)", async ({ page }) => {
  await openPage(page);
  await openPanel(page);
  await expect(page.getByTestId(`${T}-reset`)).toBeDisabled();
  await page.getByTestId(`${T}-check-days_pending`).uncheck();
  await page.getByTestId(`${T}-down-salesperson`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  const dels: string[] = [];
  page.on("request", (r) => r.method() === "DELETE" && dels.push(r.url()));
  await page.getByTestId(`${T}-reset`).click();
  await expect.poll(() => headers(page)).toEqual(DEFAULT);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(dels.length).toBe(1);
  const again = await page.request.delete("/api/report-preferences?reportKey=commission_aging");
  expect(again.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("qa-loading")).toHaveText("ready");
  expect(await headers(page)).toEqual(DEFAULT);
});

test("saving indicator, then failure rolls back to the last saved state with a working retry", async ({ page }) => {
  await openPage(page);
  await openPanel(page);
  await page.getByTestId(`${T}-check-days_pending`).uncheck();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");

  let fail = true;
  await page.route("**/api/report-preferences", async (route) => {
    if (route.request().method() === "PUT" && fail) {
      await new Promise((r) => setTimeout(r, 300));
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });
  await page.getByTestId(`${T}-check-sale_amount`).uncheck();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đang lưu");
  await expect(page.getByTestId(`${T}-status`)).toContainText("Lưu không thành công");
  expect(await headers(page), "rolled back to last confirmed").toEqual(["salesperson", "sale_amount", "commission_amount"]);

  fail = false;
  await page.getByTestId(`${T}-retry`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(await headers(page)).toEqual(["salesperson", "commission_amount"]);
});

test("changing columns never requests business data (only /api/report-preferences)", async ({ page }) => {
  await openPage(page);
  const urls: string[] = [];
  page.on("request", (r) => /\/api\//.test(r.url()) && urls.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await openPanel(page);
  await page.getByTestId(`${T}-check-days_pending`).uncheck();
  await page.getByTestId(`${T}-down-salesperson`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  await page.getByTestId(`${T}-reset`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((u) => u.endsWith("/api/report-preferences"))).toBe(true);
});

test("permission-gated columns are never listed or rendered unless the context allows them", async ({ page }) => {
  await page.goto("/qa/column-manager?report=sales_ledger");
  await expect(page.getByTestId("qa-loading")).toHaveText("ready");
  const hs = await headers(page);
  for (const k of ["cost_price", "profit", "entry_source", "audit_info", "duplicate"]) expect(hs).not.toContain(k);
  await page.getByTestId(T).click();
  const rows = await panelRows(page);
  for (const k of ["cost_price", "profit", "entry_source", "audit_info", "duplicate"]) expect(rows).not.toContain(k);
});
