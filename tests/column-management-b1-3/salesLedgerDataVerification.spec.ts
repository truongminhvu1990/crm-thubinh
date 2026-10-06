import fs from "node:fs";
import path from "node:path";
import { test, expect, Page, Request } from "@playwright/test";
import ExcelJS from "exceljs";
import { credentialsFor, QaRole } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

// Phase 1.6 Wave B1.3 - Sales Ledger + Data Verification on the shared ColumnManager (DEV backend, production build).
// Runs as the QA OWNER account (the Sales Ledger applies Data Scope, and the QA Manager account sees no rows there; the Owner sees cost /
// profit and all rows). That account owns NO sales_ledger / data_verification preference row on Dev, so no existing row is ever touched. READ-ONLY for business data. The only thing written is that account's OWN preference
// rows: read first (and copied to a file), restored exactly afterwards (a row that did not exist is removed again). Nothing is ever
// deleted by report key alone, and no business data is created, changed or deleted.

const DATE_KEY = "crm-thubinh:globalDateFilter";
const KEYS = ["sales_ledger", "data_verification"] as const;
type Key = (typeof KEYS)[number];

const SL_ALL = ["sale_date", "order_number", "product_code", "product_name", "customer", "salesperson", "sale_amount", "commission_amount", "cost_price", "profit", "commission_status", "entry_source", "audit_info", "duplicate"];
const VERIFICATION_ONLY = ["entry_source", "audit_info", "duplicate"];
const SL_NORMAL = SL_ALL.filter((k) => !VERIFICATION_ONLY.includes(k)); // Manager: cost + profit, no verification columns
const DV_ALL = ["sale_date", "order_number", "product_code", "product_name", "customer", "salesperson", "sale_amount", "commission_amount", "commission_status", "entry_source", "audit_info", "duplicate"];
const SL_LABELS: Record<string, string> = { sale_date: "Ngày bán", order_number: "Số đơn", product_code: "Mã sản phẩm", product_name: "Tên sản phẩm", customer: "Khách hàng", salesperson: "Nhân viên", sale_amount: "Giá trị bán", commission_amount: "Hoa hồng", cost_price: "Giá vốn", profit: "Lãi / Lỗ", commission_status: "Trạng thái hoa hồng", entry_source: "Nguồn nhập", audit_info: "Thông tin ghi nhận", duplicate: "Trùng lặp" };
const DV_EXPORT_HEADERS = ["Ngày bán", "Mã sản phẩm", "Tên sản phẩm", "Khách hàng", "Nhân viên", "Giá trị bán", "Hoa hồng", "Trạng thái hoa hồng", "Nguồn nhập", "Người tạo", "Ngày tạo", "Người cập nhật", "Ngày cập nhật", "Nghi ngờ trùng lặp"];

async function login(page: Page, role: QaRole = "OWNER") {
  const { email, password } = credentialsFor(role);
  // WebKit (iPhone profile) intermittently lands back on /login even though the auth token response was 200: retry the navigation, and
  // if that still fails sign in once more. Test infrastructure only.
  for (let round = 0; round < 2; round += 1) {
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
  }
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

interface Saved { visibleColumns: string[]; columnOrder: string[] | null }
const original: Record<Key, Saved | null> = { sales_ledger: null, data_verification: null };

async function readPref(page: Page, key: Key): Promise<Saved | null> {
  const res = await page.request.get(`/api/report-preferences?reportKey=${key}`);
  expect(res.status()).toBe(200);
  return (await res.json()).preference;
}
async function restore(page: Page, key: Key) {
  const o = original[key];
  if (o === null) await page.request.delete(`/api/report-preferences?reportKey=${key}`); // only because THIS run found no row at all
  else await page.request.put("/api/report-preferences", { data: { reportKey: key, visibleColumns: o.visibleColumns, ...(o.columnOrder ? { columnOrder: o.columnOrder } : {}) } });
}

const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;
const headerKeys = (page: Page) => page.locator('[data-testid="sales-ledger-table"] th').evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key"))) as Promise<string[]>;
const rowCount = (page: Page) => page.locator('[data-testid="sales-ledger-table"] tbody tr').count();
const panelOrder = (page: Page, T: string) => page.locator(`[data-testid="${T}-list"] li`).evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key"))) as Promise<string[]>;
const noSpin = (page: Page) => expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 20_000 });

interface Cfg { name: string; key: Key; url: string; T: string; exportBtn: string; allKeys: string[]; mandatory: string[] }
const SLC: Cfg = { name: "Sales Ledger", key: "sales_ledger", url: "/reports/sales-ledger", T: "sales-ledger-columns-button", exportBtn: "report-export-button", allKeys: SL_NORMAL, mandatory: ["sale_date", "product_name", "sale_amount"] };
const DVC: Cfg = { name: "Data Verification", key: "data_verification", url: "/data-verification", T: "data-verification-columns-button", exportBtn: "data-verification-export-button", allKeys: DV_ALL, mandatory: ["sale_date", "product_name", "sale_amount", "duplicate"] };

async function openReport(page: Page, cfg: Cfg) {
  const apiMatch = cfg.key === "sales_ledger" ? (r: import("@playwright/test").Response) => r.url().includes("/api/sales-ledger?") : (r: import("@playwright/test").Response) => r.url().includes("/rest/v1/sales_ledger");
  const loaded = page.waitForResponse(apiMatch, { timeout: 40_000 });
  await page.goto(cfg.url);
  expect([200, 206]).toContain((await loaded).status()); // the Data Verification list is a PostgREST read (206 = partial content with a count)
  await noSpin(page);
  if (isDesktop(page)) await expect(page.getByTestId("sales-ledger-table")).toBeVisible();
  if (cfg.key === "data_verification") {
    // the dashboard numbers load separately (placeholders are an em dash): wait until they are real before anything is compared
    await expect.poll(async () => await page.locator("div.grid", { has: page.getByText("Đã nhập lịch sử") }).first().innerText(), { timeout: 20_000 }).not.toMatch(/—/);
  }
}
async function openPanel(page: Page, T: string) {
  await page.getByTestId(T).evaluate((el) => el.scrollIntoView({ block: "center" })); // the panel needs room below the trigger
  await page.getByTestId(T).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeVisible();
}
const saved = (page: Page, T: string) => expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 8000 });

async function snapshot(page: Page, cfg: Cfg) {
  const rows = await rowCount(page);
  const firstRow = rows ? (await page.locator('[data-testid="sales-ledger-table"] tbody tr').first().innerText()).replace(/\s+/g, " ") : "";
  const extra = cfg.key === "sales_ledger"
    ? (await page.locator("div.grid", { has: page.getByText("Tổng doanh thu") }).first().innerText()).replace(/\s+/g, " ") + " | " + (await page.getByText(/giao dịch trong kỳ đã chọn/).first().innerText()).replace(/\s+/g, " ")
    : (await page.locator("div.grid", { has: page.getByText("Đã nhập lịch sử") }).first().innerText()).replace(/\s+/g, " ");
  const showing = await page.getByText(/Hiển thị \d+–\d+/).first().innerText().catch(() => null);
  return { rows, firstRow, extra, showing };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ option: "all_time", customFrom: "", customTo: "" })), [DATE_KEY]);
  await login(page);
  for (const k of KEYS) original[k] = await readPref(page, k);
  // A durable copy of what is about to be touched, so it can be put back by hand if the process ever dies mid-test.
  fs.mkdirSync(path.resolve("artifacts"), { recursive: true });
  fs.writeFileSync(path.resolve("artifacts", `b13-original-preferences-${test.info().project.name}.json`), JSON.stringify({ at: new Date().toISOString(), original }, null, 2));
  // Every test starts from the registry default (an existing row would have been copied above and is put back by afterEach).
  for (const k of KEYS) if (original[k] !== null) await page.request.delete(`/api/report-preferences?reportKey=${k}`);
});
test.afterEach(async ({ page }) => {
  for (const k of KEYS) await restore(page, k);
});

for (const cfg of [SLC, DVC]) {
  test.describe(cfg.name, () => {
    test("default: columns in the registry order with the current labels, and the report has data", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop table");
      await openReport(page, cfg);
      expect(await headerKeys(page)).toEqual(cfg.allKeys);
      if (cfg.key === "sales_ledger") expect(await page.locator('[data-testid="sales-ledger-table"] th').allInnerTexts().then((a) => a.map((x) => x.trim().toLowerCase()))).toEqual(cfg.allKeys.map((k) => SL_LABELS[k].toLowerCase()));
      expect(await rowCount(page)).toBeGreaterThan(0);
    });

    test("open, Escape, close and focus return; panel lists the available columns and the mandatory ones are locked", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop only");
      await openReport(page, cfg);
      await openPanel(page, cfg.T);
      expect([...(await panelOrder(page, cfg.T))].sort()).toEqual([...cfg.allKeys].sort());
      for (const k of cfg.mandatory) await expect(page.getByTestId(`${cfg.T}-check-${k}`)).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId(`${cfg.T}-panel`)).toBeHidden();
      await expect(page.getByTestId(cfg.T)).toBeFocused();
      await openPanel(page, cfg.T);
      await page.getByTestId(`${cfg.T}-close`).click();
      await expect(page.getByTestId(`${cfg.T}-panel`)).toBeHidden();
    });

    test("hide / show saves immediately and survives a reload", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop only");
      await openReport(page, cfg);
      await openPanel(page, cfg.T);
      await page.getByTestId(`${cfg.T}-check-product_code`).setChecked(false);
      await saved(page, cfg.T);
      expect(await headerKeys(page)).not.toContain("product_code");
      await page.reload();
      await noSpin(page);
      await expect(page.getByTestId("sales-ledger-table")).toBeVisible();
      expect(await headerKeys(page)).not.toContain("product_code");
      await openPanel(page, cfg.T);
      await page.getByTestId(`${cfg.T}-check-product_code`).setChecked(true);
      await saved(page, cfg.T);
      expect(await headerKeys(page)).toContain("product_code");
    });

    test("▲/▼, keyboard and drag reorder header and cells together; the order persists; reset restores the default", async ({ page, isMobile }) => {
      test.skip(!isDesktop(page), "desktop only");
      await openReport(page, cfg);
      await openPanel(page, cfg.T);
      // ▲/▼
      const before = await headerKeys(page);
      await page.getByTestId(`${cfg.T}-down-${before[0]}`).click();
      const swapped = [...before]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
      await expect.poll(() => headerKeys(page)).toEqual(swapped);
      expect(await page.locator('[data-testid="sales-ledger-table"] tbody tr').first().locator("td").count()).toBe(swapped.length);
      await saved(page, cfg.T);
      // keyboard on a drag handle (the panel also lists hidden columns, so derive the expectation from the panel order)
      const panel0 = await panelOrder(page, cfg.T);
      const vis0 = await headerKeys(page);
      const idx = panel0.findIndex((k, i) => i > 0 && i < 8 && vis0.includes(k) && vis0.includes(panel0[i - 1]));
      await page.getByTestId(`${cfg.T}-handle-${panel0[idx]}`).focus();
      await page.keyboard.press("ArrowUp");
      await saved(page, cfg.T);
      const panel1 = await panelOrder(page, cfg.T);
      expect(panel1[idx - 1]).toBe(panel0[idx]);
      expect(await headerKeys(page)).toEqual(panel1.filter((k) => vis0.includes(k)));
      // mouse drag
      if (!isMobile) {
        const vis1 = await headerKeys(page);
        const dragKey = panel1.slice(4, 8).find((k) => vis1.includes(k))!;
        const target = panel1[1];
        const h = (await page.getByTestId(`${cfg.T}-handle-${dragKey}`).boundingBox())!;
        const t = (await page.getByTestId(`${cfg.T}-row-${target}`).boundingBox())!;
        const puts: string[] = [];
        page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/report-preferences") && puts.push(r.postData() ?? ""));
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + 4, t.y + 2, { steps: 12 });
        await page.mouse.up();
        await saved(page, cfg.T);
        const panel2 = await panelOrder(page, cfg.T);
        expect(panel2.indexOf(dragKey)).toBeLessThan(panel1.indexOf(dragKey));
        expect(await headerKeys(page)).toEqual(panel2.filter((k) => vis1.includes(k)));
        expect(puts.length).toBe(1);
      }
      // persistence
      await page.keyboard.press("Escape");
      const afterAll = await headerKeys(page);
      await page.reload();
      await noSpin(page);
      await expect(page.getByTestId("sales-ledger-table")).toBeVisible();
      expect(await headerKeys(page)).toEqual(afterAll);
      // reset
      await openPanel(page, cfg.T);
      const dels: string[] = [];
      page.on("request", (r) => r.method() === "DELETE" && dels.push(r.url()));
      await page.getByTestId(`${cfg.T}-reset`).click();
      await expect.poll(() => headerKeys(page)).toEqual(cfg.allKeys);
      expect(dels.length).toBe(1);
    });

    test("hide + reorder never change the rows, summary, totals or the first row; and call ONLY /api/report-preferences", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop only");
      await openReport(page, cfg);
      const base = await snapshot(page, cfg);
      await openPanel(page, cfg.T);
      const actions: [string, () => Promise<void>][] = [
        ["hide", () => page.getByTestId(`${cfg.T}-check-salesperson`).setChecked(false)],
        ["show", () => page.getByTestId(`${cfg.T}-check-salesperson`).setChecked(true)],
        ["reorder", () => page.getByTestId(`${cfg.T}-down-sale_date`).click()],
        ["reset", () => page.getByTestId(`${cfg.T}-reset`).click()],
      ];
      for (const [name, run] of actions) {
        await page.waitForTimeout(700);
        const seen: string[] = [];
        const on = (r: Request) => seen.push(`${r.method()} ${r.url()} [${r.resourceType()}]`);
        page.on("request", on);
        await run();
        await expect(page.getByTestId(`${cfg.T}-status`)).toContainText("Đã lưu", { timeout: 8000 });
        await page.waitForTimeout(1500);
        page.off("request", on);
        const bad = seen.filter((s) => !/\/api\/report-preferences/.test(s) && !/_next\/static|\.(woff2?|png|svg|ico|css)(\?|\s|$)/.test(s));
        expect(bad, `${name}: unexpected requests (report API, export, Supabase REST, products, customers ...)`).toEqual([]);
        expect(seen.some((s) => /rest\/v1|\/api\/sales-ledger|_rsc=|\/orders\/|\/customers\/|products/.test(s) && !/report-preferences/.test(s)), `${name}: no business-data request`).toBe(false);
        expect(seen.filter((s) => /\/api\/report-preferences/.test(s)).length, `${name}: the preference request`).toBeGreaterThan(0);
      }
      await page.keyboard.press("Escape");
      expect(await snapshot(page, cfg)).toEqual(base);
    });

    test("filters and pagination keep working, a column action does not reset a filter, and clearing returns to the baseline", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop only");
      await openReport(page, cfg);
      const base = await snapshot(page, cfg);
      const keys = await headerKeys(page);
      const name = (await page.locator('[data-testid="sales-ledger-table"] tbody tr').first().locator("td").nth(keys.indexOf("customer")).locator("div").first().innerText()).trim();
      const isList = (r: import("@playwright/test").Response) => r.url().includes(cfg.key === "sales_ledger" ? "/api/sales-ledger?" : "/rest/v1/sales_ledger") && /search=|ilike/.test(r.url());
      const filteredResponse = page.waitForResponse(isList, { timeout: 30_000 });
      await page.getByTestId("sales-ledger-search-input").fill(name);
      expect([200, 206]).toContain((await filteredResponse).status());
      await noSpin(page);
      await page.waitForTimeout(800);
      expect(await rowCount(page)).toBeGreaterThan(0);
      // a column action while the filter is active neither resets the filter nor refetches the data
      await openPanel(page, cfg.T);
      const seen: string[] = [];
      const on = (r: Request) => seen.push(`${r.method()} ${r.url()}`);
      page.on("request", on);
      await page.getByTestId(`${cfg.T}-check-salesperson`).setChecked(false);
      await saved(page, cfg.T);
      await page.getByTestId(`${cfg.T}-check-salesperson`).setChecked(true);
      await saved(page, cfg.T);
      page.off("request", on);
      expect(seen.filter((s) => !/report-preferences/.test(s) && !/_next\/static/.test(s))).toEqual([]);
      expect(await page.getByTestId("sales-ledger-search-input").inputValue()).toBe(name);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /Xóa bộ lọc/ }).first().click();
      await page.waitForTimeout(800);
      await noSpin(page);
      await expect.poll(async () => (await snapshot(page, cfg)).rows, { timeout: 20_000 }).toBe(base.rows);
      // pagination when there is more than one page
      const next = page.getByRole("button", { name: /Sau/ });
      if (await next.isEnabled().catch(() => false)) {
        const keysBefore = await headerKeys(page);
        await next.click();
        await noSpin(page);
        await expect(page.getByText(/Hiển thị 51–/)).toBeVisible();
        expect(await headerKeys(page)).toEqual(keysBefore); // the column preference is not reset by paging
        await page.getByRole("button", { name: /Trước/ }).click();
        await noSpin(page);
        await expect.poll(async () => (await snapshot(page, cfg)).showing).toBe(base.showing);
      }
    });

    test("EntityLinks open the drawer on the same page; a plain cell click still opens the detail page", async ({ page }) => {
      test.skip(!isDesktop(page), "desktop only");
      await openReport(page, cfg);
      await openPanel(page, cfg.T);
      await page.getByTestId(`${cfg.T}-down-sale_date`).click();
      await saved(page, cfg.T);
      await page.keyboard.press("Escape");
      const keys = await headerKeys(page);
      const pathname = new URL(page.url()).pathname;
      for (const key of ["product_name", "customer"]) {
        const link = page.locator('[data-testid="sales-ledger-table"] tbody tr').first().locator("td").nth(keys.indexOf(key)).locator("button").first();
        if ((await link.count()) === 0) continue;
        await link.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(pathname);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
      }
      await page.locator('[data-testid="sales-ledger-table"] tbody tr').first().locator("td").nth(keys.indexOf("salesperson")).click();
      await expect(page).toHaveURL(/\/reports\/sales-ledger\/[0-9a-f-]+/);
    });

    test("mobile 390px: no page-level overflow, the card list is unchanged, and the desktop table and ColumnManager are hidden", async ({ page }) => {
      test.skip(isDesktop(page), "mobile only");
      await openReport(page, cfg);
      await expect(page.getByTestId("sales-ledger-mobile-row").first()).toBeVisible({ timeout: 30_000 });
      const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(overflow.page).toBeLessThanOrEqual(overflow.inner + 1);
      expect(await page.getByTestId("sales-ledger-mobile-row").count()).toBeGreaterThan(0);
      await expect(page.getByTestId("sales-ledger-table")).toBeHidden();
      await expect(page.getByTestId(cfg.T)).toBeHidden();
      expect(await page.getByTestId("sales-ledger-mobile-row").first().getAttribute("href")).toMatch(/^\/reports\/sales-ledger\/[0-9a-f-]+$/);
    });
  });
}

test.describe("Sales Ledger: export (registry order, hidden excluded, 'Số đơn' empty)", () => {
  test("table reorder does NOT reorder the Excel; hidden columns are excluded; 'Số đơn' exports empty", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page, SLC);
    await openPanel(page, SLC.T);
    await page.getByTestId(`${SLC.T}-check-salesperson`).setChecked(false);
    await saved(page, SLC.T);
    await page.getByTestId(`${SLC.T}-down-sale_date`).click();
    await saved(page, SLC.T);
    await page.keyboard.press("Escape");
    expect(((await headerKeys(page)) as string[])[0]).not.toBe("sale_date");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(SLC.exportBtn).click()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    const sheet = wb.worksheets[0];
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    expect(headers).toEqual(SL_NORMAL.filter((k) => k !== "salesperson").map((k) => SL_LABELS[k]));
    const orderCol = headers.indexOf("Số đơn") + 1;
    expect(orderCol).toBeGreaterThan(0);
    for (let r = 2; r <= Math.min(sheet.rowCount, 6); r += 1) expect(String(sheet.getRow(r).getCell(orderCol).value ?? "")).toBe("");
  });

  test("verification mode: toggling it adds / removes the three verification columns without resetting the others; the Excel follows the visible set in registry order", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page, SLC);
    await openPanel(page, SLC.T);
    await page.getByTestId(`${SLC.T}-check-product_code`).setChecked(false);
    await saved(page, SLC.T);
    await page.keyboard.press("Escape");
    expect(await headerKeys(page)).toEqual(SL_NORMAL.filter((k) => k !== "product_code"));
    await page.getByTestId("sales-ledger-verification-mode-button").click();
    await expect.poll(() => headerKeys(page)).toEqual(SL_ALL.filter((k) => k !== "product_code")); // verification columns appear, product_code still hidden
    expect(await page.locator('[data-testid="sales-ledger-table"]').getAttribute("class")).toContain("min-w-[1560px]");
    const dupRows = page.locator('[data-testid="sales-ledger-table"] tbody tr.bg-amber-50');
    const n = await dupRows.count();
    for (let i = 0; i < Math.min(n, 3); i += 1) await expect(dupRows.nth(i)).toContainText("Possible Duplicate");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(SLC.exportBtn).click()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    expect((wb.worksheets[0].getRow(1).values as unknown[]).slice(1).map(String)).toEqual(SL_ALL.filter((k) => k !== "product_code").map((k) => SL_LABELS[k]));
    await page.getByTestId("sales-ledger-verification-mode-button").click();
    await expect.poll(() => headerKeys(page)).toEqual(SL_NORMAL.filter((k) => k !== "product_code"));
  });
});

test.describe("Data Verification: export is the fixed 14-column list", () => {
  test("hiding and reordering the table does not change the Excel", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page, DVC);
    await openPanel(page, DVC.T);
    await page.getByTestId(`${DVC.T}-check-product_code`).setChecked(false);
    await saved(page, DVC.T);
    await page.getByTestId(`${DVC.T}-down-sale_date`).click();
    await saved(page, DVC.T);
    await page.keyboard.press("Escape");
    const tableKeys = await headerKeys(page);
    expect(tableKeys).not.toContain("product_code");
    expect(tableKeys[0]).not.toBe("sale_date");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(DVC.exportBtn).click()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    expect((wb.worksheets[0].getRow(1).values as unknown[]).slice(1).map(String)).toEqual(DV_EXPORT_HEADERS);
  });

  test("the Data Verification dashboard and table are untouched: verification mode is always on, the duplicate column is mandatory", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page, DVC);
    expect(await headerKeys(page)).toContain("duplicate");
    expect(await page.locator('[data-testid="sales-ledger-table"]').getAttribute("class")).toContain("min-w-[1560px]");
    await expect(page.getByText("Tổng quan xác minh")).toBeVisible();
    await expect(page.getByText("Giao dịch cần xác minh")).toBeVisible();
  });
});

test.describe("Permission: no cost / profit for a role without the permission", () => {
  for (const role of ["SALES", "VIEWER"] as QaRole[]) {
    test(`${role}: no cost / profit column in the table, the panel or the export, and no products lookup`, async ({ browser }) => {
      test.skip(test.info().project.name.includes("mobile"), "own desktop session; the mobile projects only exercise the card layout");
      const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      await p.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ option: "all_time", customFrom: "", customTo: "" })), [DATE_KEY]);
      try {
        await login(p, role);
        const seen: string[] = [];
        p.on("request", (r) => seen.push(r.url()));
        const before = await readPref(p, "sales_ledger");
        const ok = await p.goto(SLC.url).then((r) => r?.status() === 200).catch(() => false);
        test.skip(!ok, `${role} QA account cannot open the report: NOT VERIFIED for this role`);
        await expect(p.locator(".animate-spin")).toHaveCount(0, { timeout: 20_000 });
        // the ColumnManager exists whether or not this role's Data Scope returns rows
        await p.getByTestId(SLC.T).click();
        const panelKeys = await p.locator(`[data-testid="${SLC.T}-list"] li`).evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")));
        expect(panelKeys.length).toBeGreaterThan(0);
        expect(panelKeys).not.toContain("cost_price");
        expect(panelKeys).not.toContain("profit");
        await p.keyboard.press("Escape");
        const hasTable = await p.getByTestId("sales-ledger-table").isVisible().catch(() => false);
        test.info().annotations.push({ type: "permission-rows", description: `${role}: table rows visible = ${hasTable}` });
        if (hasTable) {
          const keys = (await p.locator('[data-testid="sales-ledger-table"] th').evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")))) as string[];
          expect(keys).not.toContain("cost_price");
          expect(keys).not.toContain("profit");
          const [download] = await Promise.all([p.waitForEvent("download"), p.getByTestId(SLC.exportBtn).click()]);
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.readFile((await download.path())!);
          const headers = (wb.worksheets[0].getRow(1).values as unknown[]).map(String);
          expect(headers).not.toContain("Giá vốn");
          expect(headers).not.toContain("Lãi / Lỗ");
        }
        expect(seen.filter((u) => /rest\/v1\/products/.test(u)), "no cost lookup against products").toEqual([]);
        expect(await readPref(p, "sales_ledger")).toEqual(before);
      } finally {
        await ctx.close();
      }
    });
  }
});
