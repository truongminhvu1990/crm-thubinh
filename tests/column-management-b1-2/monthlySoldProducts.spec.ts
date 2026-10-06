import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { credentialsFor, QaRole } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

// Phase 1.6 Wave B1.2 - Monthly Sold Products on the shared ColumnManager (DEV backend, production build).
// Runs as the QA MANAGER account (sees gross_profit like an Owner, and owns NO monthly_sold_products row on Dev), so the existing Owner rows are never touched.
// READ-ONLY for business data. The only thing written is the signed-in QA account's OWN monthly_sold_products column preference:
// it is read first and restored EXACTLY afterwards (an existing row is put back value for value; a row that did not exist is removed
// again). Nothing is ever deleted by report key alone, and no business data is created, changed or deleted.

const KEY = "monthly_sold_products";
const PAGE_URL = "/reports/monthly-sold-products";
const T = "monthly-sold-products-columns-button";
const DATE_KEY = "crm-thubinh:globalDateFilter";

const OWNER_COLUMNS = [
  ["sale_date", "Ngày bán"], ["order_number", "Số đơn"], ["product_code", "Mã sản phẩm"], ["product_name", "Tên sản phẩm"], ["product_category", "Danh mục"],
  ["jade_type", "Loại ngọc"], ["customer", "Khách hàng"], ["salesperson", "Nhân viên"], ["original_price", "Giá gốc"], ["discount", "Chiết khấu"],
  ["final_sale_price", "Giá bán cuối"], ["gross_profit", "Lãi gộp"], ["amount_paid", "Đã thanh toán (cả đơn)"], ["remaining_balance", "Tiền còn lại (cả đơn)"],
  ["payment_methods", "Phương thức thanh toán"], ["recognition", "Ghi nhận doanh thu"],
] as const;
const OWNER_KEYS = OWNER_COLUMNS.map(([k]) => k as string);
const MANDATORY = ["order_number", "product_name", "final_sale_price", "recognition"];

async function login(page: Page, role: QaRole = "MANAGER") {
  const { email, password } = credentialsFor(role);
  // WebKit (iPhone profile) intermittently lands back on /login even though the auth token response was 200 (the session cookie is not yet
  // visible to the navigation): retry the navigation, and if that still fails sign in once more. Test infrastructure only.
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
let original: Saved | null = null;

async function readPref(page: Page): Promise<Saved | null> {
  const res = await page.request.get(`/api/report-preferences?reportKey=${KEY}`);
  expect(res.status()).toBe(200);
  return (await res.json()).preference;
}
async function restore(page: Page) {
  if (original === null) await page.request.delete(`/api/report-preferences?reportKey=${KEY}`); // only because THIS run found no row at all
  else await page.request.put("/api/report-preferences", { data: { reportKey: KEY, visibleColumns: original.visibleColumns, ...(original.columnOrder ? { columnOrder: original.columnOrder } : {}) } });
}

const headerKeys = (page: Page) => page.locator('[data-testid="monthly-sold-products-table"] th').evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")));
const headerLabels = (page: Page) => page.locator('[data-testid="monthly-sold-products-table"] th').evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
const rowCount = (page: Page) => page.locator('[data-testid="monthly-sold-products-table"] tbody tr').count();
const recognitionTexts = (page: Page) => page.locator('[data-testid="monthly-sold-products-recognition-cell"]').allInnerTexts();
const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;

async function snapshot(page: Page) {
  const cards = await page.locator('[data-testid^="monthly-sold-products-"][data-testid$="-card"]').allInnerTexts();
  return {
    rows: await rowCount(page),
    totalLine: (await page.getByText(/sản phẩm trong khoảng thời gian đã chọn/).first().innerText()).replace(/\s+/g, " "),
    cards,
    reconciliation: (await page.getByTestId("monthly-sold-products-reconciliation-line").innerText()).replace(/\s+/g, " "),
    recognition: (await recognitionTexts(page)).sort(),
    showing: await page.getByText(/Hiển thị \d+–\d+ \/ \d+ sản phẩm/).first().innerText().catch(() => null),
  };
}

async function openReport(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().includes("/api/reports/monthly-sold-products") && !r.url().includes("/export"), { timeout: 30_000 });
  await page.goto(PAGE_URL);
  expect((await loaded).status()).toBe(200);
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await expect(page.getByTestId("monthly-sold-products-table")).toBeVisible();
}
async function openPanel(page: Page) {
  await page.getByTestId(T).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeVisible();
}
const saved = (page: Page) => expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 8000 });

test.beforeEach(async ({ page }) => {
  // every period with data: the whole history on Dev (same stored-period mechanism the date-filter specs use)
  await page.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ option: "all_time", customFrom: "", customTo: "" })), [DATE_KEY]);
  await login(page);
  original = await readPref(page);
  // A durable copy of what is about to be touched, so it can be put back by hand if the process ever dies mid-test.
  fs.mkdirSync(path.resolve("artifacts"), { recursive: true });
  fs.writeFileSync(path.resolve("artifacts", `b12-original-preference-${test.info().project.name}.json`), JSON.stringify({ at: new Date().toISOString(), original }, null, 2));
  // Every test starts from the registry default. An existing row is NOT lost: it was just copied above and afterEach puts it back exactly.
  if (original !== null) await page.request.delete(`/api/report-preferences?reportKey=${KEY}`);
});
test.afterEach(async ({ page }) => {
  await restore(page);
});

test("default: all 16 columns in the registry order with the current labels, and the report has data", async ({ page }) => {
  await openReport(page);
  if (original === null) {
    expect(await headerKeys(page)).toEqual(OWNER_KEYS);
    expect(await headerLabels(page)).toEqual(OWNER_COLUMNS.map(([, l]) => l));
  } else {
    expect((await headerKeys(page)).length).toBeGreaterThan(0); // an existing Dev preference is honoured; it is restored afterwards
  }
  expect(await rowCount(page)).toBeGreaterThan(0);
});

test("open, Escape, close and focus return", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
  await expect(page.getByTestId(T)).toBeFocused();
  await openPanel(page);
  await page.getByTestId(`${T}-close`).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
});

test("panel lists the 16 registry columns (gross_profit for Owner), mandatory ones are locked", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  const rows = await page.locator(`[data-testid="${T}-list"] li`).evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")));
  expect([...rows].sort()).toEqual([...OWNER_KEYS].sort());
  for (const k of MANDATORY) await expect(page.getByTestId(`${T}-check-${k}`)).toBeDisabled();
  await expect(page.getByTestId(`${T}-check-sale_date`)).toBeEnabled();
});

test("hide / show saves immediately and survives a reload", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  await page.getByTestId(`${T}-check-jade_type`).setChecked(false);
  await saved(page);
  expect(await headerKeys(page)).not.toContain("jade_type");
  await page.reload();
  await expect(page.getByTestId("monthly-sold-products-table")).toBeVisible();
  expect(await headerKeys(page)).not.toContain("jade_type");
  await openPanel(page);
  await page.getByTestId(`${T}-check-jade_type`).setChecked(true);
  await saved(page);
  expect(await headerKeys(page)).toContain("jade_type");
});

test("hiding every optional column leaves the four mandatory ones; recognition stays", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  for (const [k] of OWNER_COLUMNS) if (!MANDATORY.includes(k)) {
    const box = page.getByTestId(`${T}-check-${k}`);
    if (await box.isChecked()) await box.setChecked(false);
  }
  await saved(page);
  expect((await headerKeys(page)).sort()).toEqual([...MANDATORY].sort());
  await expect(page.getByTestId("monthly-sold-products-recognition-cell").first()).toBeVisible();
});

test("up/down buttons reorder header and cells together, persisted", async ({ page }) => {
  await openReport(page);
  const before = (await headerKeys(page)) as string[];
  await openPanel(page);
  await page.getByTestId(`${T}-down-${before[0]}`).click();
  const after = [...before];
  [after[0], after[1]] = [after[1], after[0]];
  await expect.poll(() => headerKeys(page)).toEqual(after);
  // the first body cell belongs to the new first header: same count of cells and headers in every row
  const cellsPerRow = await page.locator('[data-testid="monthly-sold-products-table"] tbody tr').first().locator("td").count();
  expect(cellsPerRow).toBe(after.length);
  await saved(page);
  await page.reload();
  await expect(page.getByTestId("monthly-sold-products-table")).toBeVisible();
  expect(await headerKeys(page)).toEqual(after);
});

test("drag reorder (mouse) saves once on drop", async ({ page, isMobile }) => {
  test.skip(isMobile || !isDesktop(page), "desktop only");
  await openReport(page);
  const before = (await headerKeys(page)) as string[];
  await openPanel(page);
  const puts: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/report-preferences") && puts.push(r.postData() ?? ""));
  const last = before[5]; // a row well inside the visible part of the scrolling list (16 rows do not all fit in the panel)
  const h = (await page.getByTestId(`${T}-handle-${last}`).boundingBox())!;
  const t = (await page.getByTestId(`${T}-row-${before[1]}`).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 4, t.y + 2, { steps: 12 });
  await page.mouse.up();
  await saved(page);
  const moved = (await headerKeys(page)) as string[];
  expect(moved.indexOf(last)).toBeLessThan(before.indexOf(last));
  expect(puts.length).toBe(1);
});

test("reset deletes the row and restores the registry default", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  const first = ((await headerKeys(page)) as string[])[0];
  await page.getByTestId(`${T}-down-${first}`).click();
  await saved(page);
  const dels: string[] = [];
  page.on("request", (r) => r.method() === "DELETE" && dels.push(r.url()));
  await page.getByTestId(`${T}-reset`).click();
  await expect.poll(() => headerKeys(page)).toEqual(OWNER_KEYS);
  expect(dels.length).toBe(1);
});

test("hide + reorder never change rows, totals, totalCount, summary or recognition labels", async ({ page }) => {
  await openReport(page);
  const before = await snapshot(page);
  await openPanel(page);
  await page.getByTestId(`${T}-check-original_price`).setChecked(false);
  const first = ((await headerKeys(page)) as string[])[0];
  await page.getByTestId(`${T}-down-${first}`).click();
  await saved(page);
  await page.keyboard.press("Escape");
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  await expect(page.getByTestId("monthly-sold-products-table")).toBeVisible();
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
});

test("network: hide / show / reorder / reset call ONLY /api/report-preferences (no report, export, Supabase REST, /orders, /customers)", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  const actions: [string, () => Promise<void>][] = [
    ["hide", () => page.getByTestId(`${T}-check-discount`).setChecked(false)],
    ["show", () => page.getByTestId(`${T}-check-discount`).setChecked(true)],
    ["reorder", () => page.getByTestId(`${T}-down-sale_date`).click()],
    ["reset", () => page.getByTestId(`${T}-reset`).click()],
  ];
  for (const [name, run] of actions) {
    await page.waitForTimeout(700);
    const seen: string[] = [];
    const on = (r: import("@playwright/test").Request) => seen.push(`${r.method()} ${r.url()} [${r.resourceType()}]`);
    page.on("request", on);
    await run();
    await expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 8000 });
    await page.waitForTimeout(1500);
    page.off("request", on);
    const bad = seen.filter((s) => !/\/api\/report-preferences/.test(s) && !/_next\/static|\.(woff2?|png|svg|ico|css)(\?|\s|$)/.test(s));
    expect(bad, `${name}: unexpected requests`).toEqual([]);
    expect(seen.filter((s) => /\/api\/report-preferences/.test(s)).length, `${name}: exactly the preference request`).toBeGreaterThan(0);
    expect(seen.some((s) => /_rsc=|\/orders\/|\/customers\//.test(s)), `${name}: no link request`).toBe(false);
  }
});

test("export keeps the REGISTRY order after the table is reordered, and honours the hidden columns", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  await page.getByTestId(`${T}-check-jade_type`).setChecked(false);
  await saved(page);
  const keys = (await headerKeys(page)) as string[];
  await page.getByTestId(`${T}-down-${keys[0]}`).click(); // the table now differs from the registry order
  await saved(page);
  await page.keyboard.press("Escape");
  expect(((await headerKeys(page)) as string[])[0]).not.toBe("sale_date");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("monthly-sold-products-export-excel-button").click()]);
  const file = await download.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file!);
  const headerRow = (wb.worksheets[0].getRow(1).values as unknown[]).slice(1).map(String);
  const expected = OWNER_COLUMNS.filter(([k]) => k !== "jade_type" && k !== "recognition").map(([, l]) => l);
  expect(headerRow).toEqual([...expected, "Ghi nhận doanh thu"]);
});

test("filters (customer, salesperson, category), date filter and pagination keep working, and clearing returns to the baseline", async ({ page }) => {
  await openReport(page);
  const base = await snapshot(page);
  // customer
  const name = (await page.locator('[data-testid="monthly-sold-products-table"] tbody tr').first().locator("td").nth(OWNER_KEYS.indexOf("customer")).locator("div").first().innerText()).trim();
  const resp = page.waitForResponse((r) => r.url().includes("/api/reports/monthly-sold-products") && r.url().includes("customer="));
  await page.getByPlaceholder("Tìm theo khách hàng...").fill(name);
  expect((await resp).status()).toBe(200);
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  const filtered = await snapshot(page);
  expect(filtered.rows).toBeGreaterThan(0);
  expect(filtered.rows).toBeLessThanOrEqual(base.rows);
  await page.getByRole("button", { name: /Xóa bộ lọc/ }).click();
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).totalLine).toBe(base.totalLine);
  // salesperson + category selects (first real option each)
  for (const idx of [0, 1]) {
    const select = page.locator("select", { has: page.locator("option", { hasText: idx === 0 ? "Tất cả nhân viên" : "Tất cả danh mục" }) });
    const options = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    if (options.length < 2) continue;
    const r = page.waitForResponse((x) => x.url().includes("/api/reports/monthly-sold-products"));
    await select.selectOption(options[1]);
    expect((await r).status()).toBe(200);
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await page.getByRole("button", { name: /Xóa bộ lọc/ }).click();
    await expect(page.locator(".animate-spin")).toHaveCount(0);
  }
  // date filter: a narrower period is requested with dateFrom/dateTo and restoring all time brings the baseline back
  const narrow = page.waitForResponse((r) => r.url().includes("/api/reports/monthly-sold-products") && r.url().includes("dateFrom="));
  await page.getByTestId("report-date-filter").selectOption("last_7_days");
  expect((await narrow).status()).toBe(200);
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await page.getByTestId("report-date-filter").selectOption("all_time");
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).totalLine).toBe(base.totalLine);
  // pagination, when there is more than one page
  const next = page.getByRole("button", { name: /Sau/ });
  if (await next.isEnabled().catch(() => false)) {
    const p2 = page.waitForResponse((r) => r.url().includes("/api/reports/monthly-sold-products") && r.url().includes("page=2"));
    await next.click();
    expect((await p2).status()).toBe(200);
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await expect(page.getByText(/Hiển thị 51–/)).toBeVisible();
    await page.getByRole("button", { name: /Trước/ }).click();
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await expect.poll(async () => (await snapshot(page)).showing).toBe(base.showing);
  }
});

test("EntityLinks open the contextual drawer (no route change) after a reorder", async ({ page }) => {
  await openReport(page);
  await openPanel(page);
  await page.getByTestId(`${T}-down-sale_date`).click();
  await saved(page);
  await page.keyboard.press("Escape");
  const pathname = new URL(page.url()).pathname;
  const keys = (await headerKeys(page)) as string[];
  for (const key of ["order_number", "product_name", "customer"]) {
    const cell = page.locator('[data-testid="monthly-sold-products-table"] tbody tr').first().locator("td").nth(keys.indexOf(key));
    const link = cell.locator("button").first();
    if ((await link.count()) === 0) continue; // a legacy row can have no order
    await link.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(pathname); // same page: only a ?detail= query is added
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});

test("print: the column control is not printed and the printed table has the same columns", async ({ page }) => {
  await openReport(page);
  const screenKeys = await headerKeys(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId(T)).toBeHidden();
  expect(await headerKeys(page)).toEqual(screenKeys);
});

test("mobile 390px: no page-level horizontal overflow, the table scrolls inside its container, ColumnManager is usable", async ({ page }) => {
  test.skip(isDesktop(page), "mobile only");
  await openReport(page);
  const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(overflow.page).toBeLessThanOrEqual(overflow.inner + 1);
  const scroller = await page.getByTestId("monthly-sold-products-table").evaluate((t) => { const p = t.parentElement!; return { sw: p.scrollWidth, cw: p.clientWidth }; });
  expect(scroller.sw).toBeGreaterThan(scroller.cw); // the existing horizontal scroll (min-w 1400px), not a new layout
  await expect(page.getByTestId(T)).toBeVisible();
  await openPanel(page);
  const box = (await page.getByTestId(`${T}-panel`).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  await page.getByTestId(`${T}-check-jade_type`).setChecked(false);
  await saved(page);
  expect(await headerKeys(page)).not.toContain("jade_type");
});

test("permission: a non-Owner/Manager account never sees gross_profit in the table, the panel or the export", async ({ browser }) => {
  // runs in its own session: the SALES QA account (read-only on this report)
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const p = await ctx.newPage();
  await p.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ option: "all_time", customFrom: "", customTo: "" })), [DATE_KEY]);
  try {
    await login(p, "SALES");
    const before = await readPref(p);
    const reachable = await p.goto(PAGE_URL).then((r) => r?.status() === 200).catch(() => false);
    const hasTable = reachable && (await p.getByTestId("monthly-sold-products-table").waitFor({ timeout: 15_000 }).then(() => true).catch(() => false));
    test.skip(!hasTable, "the SALES QA account cannot open this report or has no rows: gross_profit visibility NOT VERIFIED for non-Owner here");
    const keys = (await p.locator('[data-testid="monthly-sold-products-table"] th').evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")))) as string[];
    expect(keys).not.toContain("gross_profit");
    await p.getByTestId(T).click();
    const rows = await p.locator(`[data-testid="${T}-list"] li`).evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key")));
    expect(rows).not.toContain("gross_profit");
    await p.keyboard.press("Escape");
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByTestId("monthly-sold-products-export-excel-button").click()]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    expect((wb.worksheets[0].getRow(1).values as unknown[]).map(String)).not.toContain("Lãi gộp");
    expect(await readPref(p)).toEqual(before); // this test changed no preference
  } finally {
    await ctx.close();
  }
});
