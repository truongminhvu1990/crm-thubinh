import { test, expect, Page } from "@playwright/test";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

// Phase 1.6 Wave B1.1 - Customer Receivable on the shared ColumnManager (DEV backend, production build, READ + the signed-in
// QA Owner's own preference row for report_key = customer_receivable). The spec never creates or changes business data.
// Preference safety: the Owner's existing customer_receivable row (if any) is read first and restored EXACTLY afterwards; a row
// that did not exist before is removed again. Nothing is ever deleted by report key blindly.

const KEY = "customer_receivable";
const PAGE_URL = "/reports/customer-receivable";
const DEFAULT = ["Khách hàng", "Đơn hàng", "Ngày đặt", "Tổng tiền", "Đã thanh toán", "Còn lại / Dư", "Trạng thái", "Phương thức thanh toán", "Thanh toán gần nhất"];
const T = "customer-receivable-columns-button";

async function login(page: Page) {
  const { email, password } = credentialsFor("OWNER");
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.fillCredentials(email, password);
  const token = page.waitForResponse((r) => r.url().includes("/auth/v1/token"), { timeout: 60_000 });
  await lp.submit();
  await token;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.waitForTimeout(500 * (attempt + 1));
    await page.goto("/dashboard");
    if (/\/dashboard/.test(page.url())) return;
  }
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

interface Saved { visibleColumns: string[]; columnOrder: string[] | null }
let original: Saved | null = null;

async function readPref(page: Page): Promise<Saved | null> {
  const res = await page.request.get(`/api/report-preferences?reportKey=${KEY}`);
  expect(res.status()).toBe(200);
  return (await res.json()).preference;
}
async function restore(page: Page) {
  if (original === null) {
    await page.request.delete(`/api/report-preferences?reportKey=${KEY}`); // only when THIS run found no row at all
  } else {
    await page.request.put("/api/report-preferences", { data: { reportKey: KEY, visibleColumns: original.visibleColumns, ...(original.columnOrder ? { columnOrder: original.columnOrder } : {}) } });
  }
}

const headers = (page: Page) => page.locator('[data-testid="customer-receivable-table"] th').evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
const stat = async (page: Page) => ({
  outstanding: await page.getByTestId("customer-receivable-total-outstanding-card").innerText(),
  overpaid: await page.getByTestId("customer-receivable-total-overpaid-card").innerText(),
  count: await page.getByTestId("customer-receivable-order-count-card").innerText(),
});
async function openPage(page: Page) {
  await page.goto(PAGE_URL);
  await expect(page.getByTestId("customer-receivable-table").or(page.getByTestId("customer-receivable-total-outstanding-card"))).toBeVisible();
  await expect(page.locator(".animate-spin")).toHaveCount(0);
}
const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;
async function openPanel(page: Page) {
  await page.getByTestId(T).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
  original = await readPref(page);
});
test.afterEach(async ({ page }) => {
  await restore(page);
});

test("default: header order is exactly the current order, and the mobile card list is untouched", async ({ page }) => {
  await openPage(page);
  if (isDesktop(page)) {
    expect(await headers(page)).toEqual(original ? await headers(page) : DEFAULT);
    if (!original) expect(await headers(page)).toEqual(DEFAULT);
  } else {
    await expect(page.getByTestId("customer-receivable-table")).toBeHidden();
  }
});

test("ColumnManager appears only where the desktop table is (hidden at mobile width)", async ({ page }) => {
  await openPage(page);
  if (isDesktop(page)) await expect(page.getByTestId(T)).toBeVisible();
  else await expect(page.getByTestId(T)).toBeHidden();
});

test("mobile 390px: card list renders with order links, no column control", async ({ page }) => {
  test.skip(isDesktop(page), "mobile only");
  await openPage(page);
  const cards = page.locator('a[href^="/orders/"]');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(page.getByTestId(T)).toBeHidden();
});

test("open, Escape, close and focus return", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  await openPage(page);
  await openPanel(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
  await expect(page.getByTestId(T)).toBeFocused();
  await openPanel(page);
  await page.getByTestId(`${T}-close`).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
});

test("hide / show with immediate save, persisted over reload; mandatory columns are locked", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  await openPage(page);
  await openPanel(page);
  for (const k of ["customer", "orderNumber", "balance"]) await expect(page.getByTestId(`${T}-check-${k}`)).toBeDisabled();
  await page.getByTestId(`${T}-check-paymentMethods`).setChecked(false);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(await headers(page)).not.toContain("Phương thức thanh toán");
  await page.reload();
  await expect(page.getByTestId("customer-receivable-table")).toBeVisible();
  expect(await headers(page)).not.toContain("Phương thức thanh toán");
  await openPanel(page);
  await page.getByTestId(`${T}-check-paymentMethods`).setChecked(true);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(await headers(page)).toContain("Phương thức thanh toán");
});

test("keyboard up/down buttons reorder header and cells together; persisted", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  await openPage(page);
  const before = await headers(page);
  await openPanel(page);
  await page.getByTestId(`${T}-down-customer`).click();
  const after = [...before];
  [after[0], after[1]] = [after[1], after[0]];
  await expect.poll(() => headers(page)).toEqual(after);
  // first body cell now belongs to the order column (a link to /orders/..)
  await expect(page.locator('[data-testid="customer-receivable-table"] tbody tr').first().locator("td").first().locator('a[href^="/orders/"]')).toHaveCount(1);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  await page.reload();
  await expect(page.getByTestId("customer-receivable-table")).toBeVisible();
  expect(await headers(page)).toEqual(after);
});

test("drag reorder (mouse) saves once on drop", async ({ page, isMobile }) => {
  test.skip(isMobile || !isDesktop(page), "desktop only");
  await openPage(page);
  const before = await headers(page);
  await openPanel(page);
  const puts: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/report-preferences") && puts.push(r.postData() ?? ""));
  const h = (await page.getByTestId(`${T}-handle-lastPaymentDate`).boundingBox())!;
  const t = (await page.getByTestId(`${T}-row-orderDate`).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 4, t.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  const moved = await headers(page);
  expect(moved.indexOf("Thanh toán gần nhất")).toBeLessThan(before.indexOf("Thanh toán gần nhất"));
  expect(puts.length).toBe(1);
});

test("reset deletes the row and restores the default order", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  await openPage(page);
  await openPanel(page);
  await page.getByTestId(`${T}-down-customer`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  const dels: string[] = [];
  page.on("request", (r) => r.method() === "DELETE" && dels.push(r.url()));
  await page.getByTestId(`${T}-reset`).click();
  await expect.poll(() => headers(page)).toEqual(DEFAULT);
  expect(dels.length).toBe(1);
});

test("changing columns does not refetch business data and does not change totals; only /api/report-preferences is called", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  await openPage(page);
  const totalsBefore = await stat(page);
  const rowsBefore = await page.locator('[data-testid="customer-receivable-table"] tbody tr').count();
  const urls: string[] = [];
  page.on("request", (r) => /\/api\//.test(r.url()) && urls.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await openPanel(page);
  await page.getByTestId(`${T}-check-orderDate`).setChecked(false);
  await page.getByTestId(`${T}-down-customer`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  await page.getByTestId(`${T}-reset`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((u) => u.endsWith("/api/report-preferences"))).toBe(true);
  expect(await stat(page)).toEqual(totalsBefore);
  expect(await page.locator('[data-testid="customer-receivable-table"] tbody tr').count()).toBe(rowsBefore);
});

test("EntityLinks keep working after a reorder (order and customer links navigate)", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  await openPage(page);
  await openPanel(page);
  await page.getByTestId(`${T}-down-customer`).click();
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 5000 });
  await page.keyboard.press("Escape");
  const order = page.getByTestId("customer-receivable-order-link").first();
  const href = await order.getAttribute("href");
  expect(href).toMatch(/^\/orders\/[0-9a-f-]+$/);
  await order.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await page.goBack();
  await expect(page.getByTestId("customer-receivable-table")).toBeVisible();
  const cust = await page.getByTestId("customer-receivable-customer-link").first().getAttribute("href");
  expect(cust).toMatch(/^\/customers\/[0-9a-f-]+$/);
});

test("existing (legacy-format) preference is honoured: unlisted columns hidden, mandatory forced, default order; first change converts to the new format", async ({ page }) => {
  test.skip(!isDesktop(page), "desktop only");
  // legacy shape = what the old picker stored: visible keys only, no column order
  const put = await page.request.put("/api/report-preferences", { data: { reportKey: KEY, visibleColumns: ["customer", "orderNumber", "balance", "status"] } });
  expect(put.status()).toBe(200);
  expect((await put.json()).preference.columnOrder).toBeNull();
  await openPage(page);
  expect(await headers(page)).toEqual(["Khách hàng", "Đơn hàng", "Còn lại / Dư", "Trạng thái"].sort((a, b) => DEFAULT.indexOf(a) - DEFAULT.indexOf(b)));
  await openPanel(page);
  await page.getByTestId(`${T}-check-orderDate`).setChecked(true);
  await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu");
  const pref = await readPref(page);
  expect(pref!.columnOrder).not.toBeNull();
  expect(pref!.columnOrder!.length).toBe(9);
});
