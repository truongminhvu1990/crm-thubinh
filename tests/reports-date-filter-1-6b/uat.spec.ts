import { test, expect as baseExpect, Browser, BrowserContext, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";
import { pickDate } from "../reports-date-picker-1-6b1/pickDate";

/**
 * Phase 1.6B - Global Date Filter browser UAT. DEV backend only, READ-ONLY (navigation, GETs, typing in filter inputs;
 * a guard fails the run on any non-GET /api request). Run against a production build (`next start`).
 * Expected ranges are computed here INDEPENDENTLY of lib/dateFilter.ts (plain UTC calendar arithmetic from the
 * Vietnam-time date), so the app's own code is never used as its own oracle.
 */
const expect = baseExpect.configure({ timeout: 20_000 });
const BASE = process.env.QA_BASE_URL!;
const EVIDENCE = path.resolve("artifacts/uat-1-6b");
fs.mkdirSync(EVIDENCE, { recursive: true });
const STATE = path.join(EVIDENCE, ".state-owner.json");
const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const LS_KEY = "crm-thubinh:globalDateFilter";
const PRESET_LABELS = ["Hôm nay", "Hôm qua", "7 ngày qua", "Tuần này", "Tuần trước", "Tháng này", "Tháng trước", "Quý này", "Quý trước", "Năm này", "Năm trước", "Toàn thời gian", "Tùy chọn ngày…"];

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const { email, password } = credentialsFor("OWNER");
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.fillCredentials(email, password);
  const token = page.waitForResponse((r) => r.url().includes("/auth/v1/token"), { timeout: 60_000 });
  await lp.submit();
  await token;
  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

// ---- independent calendar oracle ------------------------------------------------------------------------------------
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
function vnToday(): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function expected(preset: string): [string, string] {
  const t = vnToday();
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
  const q = Math.floor(m / 3) * 3;
  switch (preset) {
    case "today": return [iso(t), iso(addDays(t, 1))];
    case "yesterday": return [iso(addDays(t, -1)), iso(t)];
    case "last_7_days": return [iso(addDays(t, -6)), iso(addDays(t, 1))];
    case "this_week": return [iso(monday), iso(addDays(monday, 7))];
    case "last_week": return [iso(addDays(monday, -7)), iso(monday)];
    case "this_month": return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 1)))];
    case "last_month": return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 1)))];
    case "this_quarter": return [iso(new Date(Date.UTC(y, q, 1))), iso(new Date(Date.UTC(y, q + 3, 1)))];
    case "last_quarter": return [iso(new Date(Date.UTC(y, q - 3, 1))), iso(new Date(Date.UTC(y, q, 1)))];
    case "this_year": return [`${y}-01-01`, `${y + 1}-01-01`];
    case "last_year": return [`${y - 1}-01-01`, `${y}-01-01`];
  }
  throw new Error("no oracle for " + preset);
}

// ---- harness --------------------------------------------------------------------------------------------------------
const writes: string[] = [];
interface Req { path: string; start: string | null; end: string | null; month: string | null }
async function open(browser: Browser, vp = DESKTOP, saved?: string | { option: string; from?: string; to?: string }) {
  const ctx: BrowserContext = await browser.newContext({ baseURL: BASE, storageState: STATE, locale: "en-US", ...vp });
  ctx.on("request", (r) => {
    const m = r.method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && /\/api\//.test(r.url())) writes.push(`${m} ${r.url()}`);
  });
  const page = await ctx.newPage();
  const reqs: Req[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/report-preferences")) return;
    reqs.push({ path: u.pathname, start: u.searchParams.get("start") ?? u.searchParams.get("dateFrom"), end: u.searchParams.get("end") ?? u.searchParams.get("dateTo"), month: u.searchParams.get("month") });
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  if (saved) {
    const v = typeof saved === "string" ? { option: saved } : saved;
    await page.addInitScript(([k, val]) => localStorage.setItem(k, val), [LS_KEY, JSON.stringify({ option: v.option, customFrom: v.from ?? "", customTo: v.to ?? "" })]);
  }
  return { ctx, page, reqs, errors };
}
const settle = async (page: Page, ms = 3500) => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
};
const select = (page: Page) => page.getByTestId("report-date-filter");
const periodRows = (reqs: Req[]) => reqs.filter((r) => r.start);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(EVIDENCE, `${name}.png`) });
const note = (type: string, description: string) => test.info().annotations.push({ type, description });

const GLOBAL_PAGES = [
  "/dashboard",
  "/reports/sales?metric=sold&view=orders",
  "/reports",
  "/reports/money-profit",
  "/reports/sales-ledger",
  "/reports/commission-by-salesperson",
  "/reports/reconciliation",
  "/reports/monthly-sold-products",
  "/reports/payment-method",
  "/data-verification",
  "/commissions",
  "/money-debt-ledger",
  "/customers/b1000000-0000-0000-0000-000000000005",
];

// ---------------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] every period-based screen: "Kỳ báo cáo:" label + the 13 approved presets in order, no own date controls`, async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, vp);
    for (const url of GLOBAL_PAGES) {
      await page.goto(url);
      await expect(select(page)).toBeVisible({ timeout: 40_000 });
      await expect(page.getByText("Kỳ báo cáo:").first()).toBeVisible();
      const labels = await select(page).locator("option").allTextContents();
      expect(labels, url).toEqual(PRESET_LABELS);
      expect(await page.locator('input[type="month"]').count(), `${url}: no own month picker`).toBe(0);
      // (the customer detail page also hosts the customer profile's own date fields; only the report screens are checked)
      if (!url.startsWith("/customers/")) expect(await page.locator('input[type="date"]:not([aria-hidden="true"])').count(), `${url}: no visible native date input`).toBe(0);
      if (label === "mobile") expect(await noOverflow(page), `${url}: no horizontal overflow`).toBe(true);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test("[desktop] presets resolve to the locked ranges (Tháng này/trước, 7 ngày qua, Tuần trước, + all others) - request params vs independent oracle", async ({ browser }) => {
  const { ctx, page, reqs } = await open(browser);
  await page.goto("/reports/sales?metric=sold&view=orders");
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await settle(page);
  const table: Record<string, string> = {};
  for (const preset of ["today", "yesterday", "last_7_days", "this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year"]) {
    // switch to another preset first so selecting `preset` is always a real change
    await select(page).selectOption(preset === "this_month" ? "last_month" : "this_month");
    await settle(page, 1500);
    const before = reqs.length;
    await select(page).selectOption(preset);
    await settle(page, 2500);
    const sold = reqs.slice(before).filter((r) => r.path === "/api/reports/overview/sold" && r.start);
    const [s, e] = expected(preset);
    expect(sold.length, `${preset}: exactly one detail request for the sold metric`).toBe(1);
    expect([sold[0].start, sold[0].end], preset).toEqual([s, e]);
    table[preset] = `${s}..${e}`;
  }
  note("preset-ranges", JSON.stringify(table));
  // Toàn thời gian: no bound at all
  const before = reqs.length;
  await select(page).selectOption("all_time");
  await settle(page, 2500);
  const all = reqs.slice(before).filter((r) => r.path === "/api/reports/overview/sold");
  expect(all.length).toBe(1);
  expect(all[0].start).toBeNull();
  await ctx.close();
});

test("[desktop] custom range: draft only, no request until a valid range + Áp dụng; dd/mm/yyyy shown, yyyy-mm-dd sent; native calendar picker", async ({ browser }) => {
  const { ctx, page, reqs } = await open(browser);
  await page.goto("/reports/sales?metric=sold&view=orders");
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await settle(page);

  const mark = reqs.length;
  await select(page).selectOption("custom");
  const from = page.getByTestId("report-date-filter-from");
  const to = page.getByTestId("report-date-filter-to");
  const apply = page.getByTestId("report-date-filter-apply");
  await expect(from).toHaveAttribute("placeholder", "dd/mm/yyyy");
  await expect(apply).toBeDisabled().catch(() => undefined);

  // one end only -> nothing happens
  await from.fill("01/09/2026");
  await page.waitForTimeout(1500);
  await to.fill("1");
  await page.waitForTimeout(1500);
  // invalid / reversed / impossible -> Vietnamese error, no request, Áp dụng disabled
  await to.fill("31/02/2026");
  await expect(apply).toBeDisabled();
  await expect(page.getByTestId("report-date-filter-error")).toHaveText("Khoảng ngày không hợp lệ");
  await to.fill("30/08/2026");
  await expect(apply).toBeDisabled();
  await expect(page.getByTestId("report-date-filter-error")).toHaveText("Khoảng ngày không hợp lệ");
  expect(reqs.length - mark, "no API request while the range is being drafted / invalid").toBe(0);
  await shot(page, "desktop-custom-invalid");

  // valid range via typing + explicit apply -> exactly one request
  await to.fill("30/09/2026");
  await expect(apply).toBeEnabled();
  expect(reqs.length - mark, "still nothing before Áp dụng").toBe(0);
  await apply.click();
  await settle(page, 2500);
  const sold = reqs.slice(mark).filter((r) => r.path === "/api/reports/overview/sold");
  expect(sold.length).toBe(1);
  expect([sold[0].start, sold[0].end]).toEqual(["2026-09-01", "2026-10-01"]);

  // calendar (Phase 1.6B.1: in-page calendar, no native picker): choosing days updates the dd/mm/yyyy fields, no request
  await select(page).selectOption("custom");
  await expect(page.getByTestId("report-date-filter-from-picker")).toBeVisible();
  const beforePick = reqs.length;
  await pickDate(page, "report-date-filter-from", "2026-08-05");
  await expect(from).toHaveValue("05/08/2026");
  await pickDate(page, "report-date-filter-to", "2026-08-20");
  await expect(to).toHaveValue("20/08/2026");
  expect(reqs.length - beforePick, "choosing dates in the calendar never fetches").toBe(0);
  await expect(apply).toBeEnabled();
  const m2 = reqs.length;
  await apply.click();
  await settle(page, 2500);
  const sold2 = reqs.slice(m2).filter((r) => r.path === "/api/reports/overview/sold");
  expect(sold2.length).toBe(1);
  expect([sold2[0].start, sold2[0].end]).toEqual(["2026-08-05", "2026-08-21"]);
  await shot(page, "desktop-custom-applied");
  await ctx.close();
});

test("[mobile] custom range fits 390px and the picker button is tappable", async ({ browser }) => {
  const { ctx, page } = await open(browser, MOBILE);
  await page.goto("/reports/sales?metric=sold&view=orders");
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await select(page).selectOption("custom");
  await expect(page.getByTestId("report-date-filter-from")).toBeVisible();
  await pickDate(page, "report-date-filter-from", "2026-09-01");
  await pickDate(page, "report-date-filter-to", "2026-09-30");
  await expect(page.getByTestId("report-date-filter-from")).toHaveValue("01/09/2026");
  await expect(page.getByTestId("report-date-filter-to")).toHaveValue("30/09/2026");
  expect(await noOverflow(page)).toBe(true);
  await shot(page, "mobile-custom-range");
  await page.getByTestId("report-date-filter-apply").tap();
  await settle(page, 1500);
  await ctx.close();
});

// ---- saved period / ready / no duplicate requests --------------------------------------------------------------------
test("[desktop] saved period (Tháng trước): no request with the default period on first load, one request per source", async ({ browser }) => {
  const { thisStart } = { thisStart: expected("this_month")[0] };
  const lastStart = expected("last_month")[0];
  const summary: Record<string, unknown> = {};
  for (const url of GLOBAL_PAGES.filter((u) => u !== "/reports/sales-ledger" || true)) {
    const { ctx, page, reqs } = await open(browser, DESKTOP, "last_month");
    await page.goto(url);
    await settle(page, 4500);
    const withPeriod = periodRows(reqs);
    const wrongPeriod = withPeriod.filter((r) => r.start === thisStart);
    const perEndpoint = withPeriod.reduce<Record<string, number>>((a, r) => ((a[r.path] = (a[r.path] ?? 0) + 1), a), {});
    summary[url] = { periodRequests: withPeriod.length, defaultPeriodRequests: wrongPeriod.length, perEndpoint };
    expect(wrongPeriod, `${url}: no request for the default period`).toEqual([]);
    for (const [ep, n] of Object.entries(perEndpoint)) expect(n, `${url}: ${ep} requested once`).toBe(1);
    expect(withPeriod.every((r) => r.start === lastStart), `${url}: every period request is for Tháng trước`).toBe(true);
    await ctx.close();
  }
  note("saved-period-requests", JSON.stringify(summary));
});

test("[desktop] changing the period issues one request per source (no duplicates) and no month/own-period leftovers", async ({ browser }) => {
  const summary: Record<string, unknown> = {};
  for (const url of GLOBAL_PAGES.filter((u) => u !== "/data-verification" || true)) {
    const { ctx, page, reqs } = await open(browser);
    await page.goto(url);
    await settle(page, 3500);
    const mark = reqs.length;
    await select(page).selectOption("last_month");
    await settle(page, 4000);
    const after = periodRows(reqs.slice(mark));
    const perEndpoint = after.reduce<Record<string, number>>((a, r) => ((a[r.path] = (a[r.path] ?? 0) + 1), a), {});
    summary[url] = perEndpoint;
    for (const [ep, n] of Object.entries(perEndpoint)) expect(n, `${url}: ${ep} requested once on a period change`).toBe(1);
    expect(after.every((r) => r.start === expected("last_month")[0]), `${url}: all requests carry the new period`).toBe(true);
    expect(after.some((r) => r.month), `${url}: no legacy month parameter`).toBe(false);
    await ctx.close();
  }
  note("period-change-requests", JSON.stringify(summary));
});

test("[desktop] F5 keeps the chosen period (preset and custom); the label shows it", async ({ browser }) => {
  const { ctx, page, reqs } = await open(browser);
  await page.goto("/reports/sales?metric=sold&view=orders");
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await select(page).selectOption("last_month");
  await settle(page, 2500);
  await page.reload();
  await expect(select(page)).toHaveValue("last_month", { timeout: 40_000 });
  const mark = reqs.length;
  await settle(page, 3000);
  expect(periodRows(reqs.slice(mark)).every((r) => r.start === expected("last_month")[0])).toBe(true);

  // custom survives F5 too
  await select(page).selectOption("custom");
  await page.getByTestId("report-date-filter-from").fill("01/09/2026");
  await page.getByTestId("report-date-filter-to").fill("15/09/2026");
  await page.getByTestId("report-date-filter-apply").click();
  await settle(page, 2000);
  await page.reload();
  await expect(select(page)).toHaveValue("custom", { timeout: 40_000 });
  await expect(page.getByTestId("report-date-filter-from")).toHaveValue("01/09/2026");
  await expect(page.getByTestId("report-date-filter-to")).toHaveValue("15/09/2026");
  await ctx.close();
});

test("[desktop+mobile] opening/closing an Entity Drawer and Back/Forward never changes the period or the filter", async ({ browser }) => {
  for (const vp of [DESKTOP, MOBILE]) {
    // "Toàn thời gian" is saved so that Dev has sold orders to open (Tháng trước has none)
    const { ctx, page } = await open(browser, vp, "all_time");
    await page.goto("/reports/sales?metric=sold&view=orders");
    await expect(select(page)).toHaveValue("all_time", { timeout: 40_000 });
    await settle(page, 2500);
    const stored = () => page.evaluate((k) => localStorage.getItem(k), LS_KEY);
    const before = await stored();
    const link = page.locator('[data-testid="entity-link-order"]').first();
    await expect(link, "an order link is available to open").toBeVisible({ timeout: 30_000 });
    await link.click();
    await expect(page.getByTestId("entity-drawer")).toBeVisible();
    expect(await stored()).toBe(before);
    await expect(select(page)).toHaveValue("all_time");
    expect(new URL(page.url()).searchParams.get("metric")).toBe("sold");
    await page.getByRole("button", { name: "Đóng" }).click();
    await expect(page.getByTestId("entity-drawer")).toHaveCount(0);
    await page.goBack().catch(() => undefined);
    await page.goForward().catch(() => undefined);
    await page.waitForTimeout(1000);
    expect(await stored()).toBe(before);
    await expect(select(page)).toHaveValue("all_time");
    note("drawer-period", `${vp === MOBILE ? "mobile" : "desktop"}: stored period unchanged after open/close/Back/Forward: ${before}`);
    await ctx.close();
  }
});

test("[desktop] drill-down URL dates are VIEW context: the saved Global period is NOT overwritten, one fetch, banner + way back", async ({ browser }) => {
  const { ctx, page, reqs } = await open(browser, DESKTOP, "this_month");
  await page.goto("/reports/sales-ledger?dateFrom=2026-08-01&dateTo=2026-09-01");
  await expect(page.getByTestId("sales-ledger-drilldown-period")).toBeVisible({ timeout: 40_000 });
  await settle(page, 3500);
  const ledger = reqs.filter((r) => r.path === "/api/sales-ledger");
  expect(ledger.length, "exactly one ledger fetch (no default-period fetch first)").toBe(1);
  expect([ledger[0].start, ledger[0].end]).toEqual(["2026-08-01", "2026-09-01"]);
  await expect(page.getByTestId("sales-ledger-drilldown-period")).toContainText("01/08/2026 → 31/08/2026");
  // the saved global period is untouched (still the default, never switched to a custom range)
  const stored = await page.evaluate((k) => localStorage.getItem(k), LS_KEY);
  const opt = stored ? JSON.parse(stored).option : "this_month";
  expect(opt).toBe("this_month");
  await expect(select(page)).toHaveValue("this_month");
  await shot(page, "desktop-drilldown-view-context");

  // F5 keeps the drill-down view (URL is the context) and still does not touch the saved period
  await page.reload();
  await expect(page.getByTestId("sales-ledger-drilldown-period")).toBeVisible({ timeout: 40_000 });
  expect(await page.evaluate((k) => (localStorage.getItem(k) ? JSON.parse(localStorage.getItem(k)!).option : "this_month"), LS_KEY)).toBe("this_month");

  // picking another period hands control back to the filter
  const mark = reqs.length;
  await select(page).selectOption("today");
  await settle(page, 3000);
  await expect(page.getByTestId("sales-ledger-drilldown-period")).toHaveCount(0);
  const after = reqs.slice(mark).filter((r) => r.path === "/api/sales-ledger");
  expect(after.length).toBe(1);
  expect(after[0].start).toBe(expected("today")[0]);
  await ctx.close();
});

test("[desktop] current-state screens say 'Trạng thái hiện tại' and never show a report period", async ({ browser }) => {
  const { ctx, page } = await open(browser, DESKTOP, "last_month");
  for (const url of ["/reports/supplier-balance", "/reports/commission-aging", "/reports/customer-receivable", "/reports/inventory"]) {
    await page.goto(url);
    await settle(page, 2500);
    const text = await page.locator("main").innerText();
    // Inventory predates this phase and already states it in its own words ("Dữ liệu tồn kho hiện tại — không phụ thuộc bộ lọc ngày").
    if (url === "/reports/inventory") expect(text, url).toContain("không phụ thuộc bộ lọc ngày");
    else expect(text, url).toContain("Trạng thái hiện tại");
    expect(text, `${url}: no Global period label`).not.toMatch(/Đang xem:\s*Tháng \d/);
    expect(await select(page).count(), `${url}: no Global Date Filter`).toBe(0);
    if (url === "/reports/customer-receivable") expect(text).toContain("không dùng Kỳ báo cáo chung");
  }
  await ctx.close();
});

test("[desktop] no flash of the previous period's data while the new period loads", async ({ browser }) => {
  const { ctx, page } = await open(browser, DESKTOP, "all_time");
  await page.goto("/reports/sales?metric=sold&view=orders");
  await expect(select(page)).toHaveValue("all_time", { timeout: 40_000 });
  await settle(page, 3000);
  const mainText = await page.locator("main").innerText();
  const amounts = [...mainText.matchAll(/\d{1,3}(?:\.\d{3})+\s?₫/g)].map((m) => m[0]);
  expect(amounts.length, "all-time page shows at least one large amount").toBeGreaterThan(0);
  const old = amounts[0];
  // hold the next period's requests, then watch the page while they are in flight
  await page.route(/\/api\/(reports\/overview|dashboard\/overview)/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await select(page).selectOption("today");
  let stale = 0;
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(200);
    if ((await page.locator("main").innerText()).includes(old)) stale += 1;
  }
  note("flash-check", `old amount ${old} seen ${stale}/12 samples while the new period was loading`);
  expect(stale, "the previous period's amount must not stay on screen while the new one loads").toBe(0);
  await ctx.close();
});

test("[desktop] Monthly Sold Products + Payment Method follow the Global filter; MSP expenses refetch once", async ({ browser }) => {
  const { ctx, page, reqs } = await open(browser, DESKTOP, "last_month");
  await page.goto("/reports/monthly-sold-products");
  await settle(page, 4000);
  const [s, e] = expected("last_month");
  const msp = reqs.filter((r) => r.path === "/api/reports/monthly-sold-products");
  const exp = reqs.filter((r) => r.path === "/api/reports/operating-expenses");
  expect(msp.length).toBe(1);
  expect(exp.length).toBe(1);
  expect([msp[0].start, msp[0].end]).toEqual([s, e]);
  expect([exp[0].start, exp[0].end]).toEqual([s, e]);
  await page.goto("/reports/payment-method");
  await settle(page, 3500);
  const pm = reqs.filter((r) => r.path === "/api/reports/payment-method");
  expect(pm.length).toBe(1);
  expect([pm[0].start, pm[0].end]).toEqual([s, e]);
  expect(pm[0].month).toBeNull();
  await ctx.close();
});

test("[desktop] other screens keep dd/mm/yyyy + native calendar on their own date fields", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  for (const [url, testid] of [["/reports/customer-receivable", "customer-receivable-date-from-input"]] as const) {
    await page.goto(url);
    const input = page.getByTestId(testid);
    await expect(input).toBeVisible({ timeout: 40_000 });
    await expect(input).toHaveAttribute("placeholder", "dd/mm/yyyy");
    await expect(page.getByTestId(`${testid}-picker`)).toBeVisible();
    await input.fill("05/09/2026");
    await expect(input).toHaveValue("05/09/2026");
  }
  await ctx.close();
});

test("zz. Safety: UAT issued no write requests", async () => {
  expect(writes).toEqual([]);
});

// ---- Commissions / Money & Debt Ledger / Customer Revenue now follow the Global Date Filter ------------------------------
test("[desktop] Commissions + Money & Debt Ledger: inclusive-end APIs get the Global period (end-1 day), once, nothing before ready", async ({ browser }) => {
  const [s, e] = expected("last_month");
  const inclusiveEnd = iso(addDays(new Date(`${e}T00:00:00Z`), -1));
  for (const [url, ep] of [["/commissions", "/api/commissions"], ["/money-debt-ledger", "/api/money-debt-ledger"]] as const) {
    const { ctx, page, reqs } = await open(browser, DESKTOP, "last_month");
    await page.goto(url);
    await settle(page, 4500);
    const list = reqs.filter((r) => r.path === ep);
    expect(list.length, `${url}: one list request with a saved period`).toBe(1);
    expect([list[0].start, list[0].end], url).toEqual([s, inclusiveEnd]);
    expect(reqs.filter((r) => r.start === expected("this_month")[0]).length, `${url}: no default-period request`).toBe(0);

    const mark = reqs.length;
    await select(page).selectOption("last_7_days");
    await settle(page, 3500);
    const after = reqs.slice(mark).filter((r) => r.path === ep);
    const [s7, e7] = expected("last_7_days");
    expect(after.length, `${url}: one request on a period change`).toBe(1);
    expect([after[0].start, after[0].end]).toEqual([s7, iso(addDays(new Date(`${e7}T00:00:00Z`), -1))]);
    if (url === "/money-debt-ledger") {
      expect(reqs.slice(mark).filter((r) => r.path === "/api/money-debt-ledger/balance").length, "balances are period-independent: not refetched").toBe(0);
      await expect(page.getByTestId("money-debt-ledger-period-note")).toContainText("trạng thái hiện tại");
    }
    // all time -> no bound at all
    const m2 = reqs.length;
    await select(page).selectOption("all_time");
    await settle(page, 3000);
    const all = reqs.slice(m2).filter((r) => r.path === ep);
    expect(all.length).toBe(1);
    expect(all[0].start).toBeNull();
    await ctx.close();
  }
});

test("[desktop] Customer Revenue follows the Global period: one REST request per period, none for the default, label shown", async ({ browser }) => {
  const { ctx, page } = await open(browser, DESKTOP, "last_month");
  const bounds: (string | null)[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/rest/v1/customer_purchases") && r.method() === "GET" && decodeURIComponent(u.search).includes("customer_id=eq.")) {
      bounds.push(/sale_date=gte\.(\d{4}-\d{2}-\d{2})/.exec(decodeURIComponent(u.search))?.[1] ?? null);
    }
  });
  await page.goto("/customers/b1000000-0000-0000-0000-000000000005");
  await expect(page.getByTestId("customer-revenue-period")).toContainText("Tháng", { timeout: 40_000 });
  await settle(page, 3500);
  const revenueReqs = bounds.filter((b) => b !== undefined);
  expect(revenueReqs.filter((b) => b === expected("this_month")[0]), "no default-period request").toEqual([]);
  expect(revenueReqs.filter((b) => b === expected("last_month")[0]).length, "one request for Tháng trước").toBe(1);

  const mark = bounds.length;
  await select(page).selectOption("all_time");
  await settle(page, 3000);
  expect(bounds.slice(mark), "all time = one request, no lower bound").toEqual([null]);
  await expect(page.getByTestId("customer-revenue-total")).not.toHaveText("—", { timeout: 20_000 });
  await ctx.close();
});

test("[desktop] values: Commissions shows exactly what the API returns for the Global period (all time and Tháng trước)", async ({ browser }) => {
  const { ctx, page } = await open(browser, DESKTOP, "last_month");
  for (const preset of ["last_month", "all_time"]) {
    const resp = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/commissions" && r.request().method() === "GET", { timeout: 40_000 });
    if (preset === "last_month") await page.goto("/commissions");
    else await select(page).selectOption("all_time");
    const rows = (await (await resp).json()) as unknown[];
    await expect(page.getByText(`${rows.length} bản ghi hoa hồng`)).toBeVisible({ timeout: 20_000 });
    note(`commissions-values-${preset}`, `${rows.length} rows shown = API`);
  }
  await ctx.close();
});

// ---- regression: stale response must never overwrite the newer period ------------------------------------------------------
test("[desktop] a slow response for the previous period never overwrites the newer period (MSP, Sales Ledger, Commissions)", async ({ browser }) => {
  const thisStart = expected("this_month")[0];
  const cases: { url: string; api: string; text: (n: number) => string; count: (json: unknown) => number }[] = [
    { url: "/reports/monthly-sold-products", api: "/api/reports/monthly-sold-products", text: (n) => `${n} sản phẩm trong khoảng thời gian đã chọn`, count: (j) => (j as { totalCount: number }).totalCount },
    { url: "/reports/sales-ledger", api: "/api/sales-ledger", text: (n) => `${n} giao dịch trong kỳ đã chọn`, count: (j) => (j as { totalCount: number }).totalCount },
    { url: "/commissions", api: "/api/commissions", text: (n) => `${n} bản ghi hoa hồng`, count: (j) => (j as unknown[]).length },
  ];
  for (const c of cases) {
    const { ctx, page } = await open(browser, DESKTOP); // default period: Tháng này
    // the Tháng này request is held back so the all-time answer arrives FIRST and the stale answer LAST
    await page.route(`**${c.api}?**`, async (route) => {
      if (new URL(route.request().url()).searchParams.get("dateFrom") === thisStart) await new Promise((r) => setTimeout(r, 4500));
      await route.continue();
    });
    const allTimeResp = page.waitForResponse((r) => new URL(r.url()).pathname === c.api && !new URL(r.url()).searchParams.get("dateFrom") && r.request().method() === "GET", { timeout: 60_000 });
    await page.goto(c.url);
    await expect(select(page)).toBeVisible({ timeout: 40_000 });
    await select(page).selectOption("all_time");
    const n = c.count(await (await allTimeResp).json());
    expect(n, `${c.url}: all-time has data on Dev`).toBeGreaterThan(0);
    await page.waitForTimeout(7000); // the held Tháng này answer has arrived by now
    await expect(page.getByText(c.text(n)), `${c.url}: still shows the all-time result`).toBeVisible();
    note(`stale-guard ${c.url}`, `all-time=${n} stays on screen after the late Tháng này response`);
    await ctx.close();
  }
});
