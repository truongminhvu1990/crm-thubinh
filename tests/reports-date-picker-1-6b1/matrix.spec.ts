import { test, expect as baseExpect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";
import { pickDate } from "./pickDate";

/**
 * Phase 1.6B.1 - DatePicker cross-browser matrix (READ-ONLY, Dev backend, production build).
 * Runs once per Playwright project (chromium desktop/mobile, WebKit desktop/mobile = Safari engine, Edge desktop).
 * Expected ranges are computed here independently of lib/dateFilter.ts.
 */
const expect = baseExpect.configure({ timeout: 20_000 });
const BASE = process.env.QA_BASE_URL || "http://localhost:3100";
const OUT = path.resolve("artifacts/uat-datepicker");
fs.mkdirSync(OUT, { recursive: true });
const URL_SALES = "/reports/sales?metric=sold&view=orders";
const LS_KEY = "crm-thubinh:globalDateFilter";

/** Only the options that make a context behave like the project's device (defaultBrowserType / channel belong to the launcher). */
function deviceOptions(info: import("@playwright/test").TestInfo) {
  const u = info.project.use as Record<string, unknown>;
  const pick: Record<string, unknown> = {};
  for (const k of ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "locale"]) if (u[k] !== undefined) pick[k] = u[k];
  return pick;
}

let storagePath = "";
test.beforeAll(async ({ browser }, info) => {
  test.setTimeout(150_000);
  storagePath = path.join(OUT, `.state-${info.project.name}.json`);
  const ctx = await browser.newContext({ baseURL: BASE, ...deviceOptions(info) });
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
  await ctx.storageState({ path: storagePath });
  await ctx.close();
});

// ---- independent oracle ---------------------------------------------------------------------------------------------
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
  switch (preset) {
    case "today": return [iso(t), iso(addDays(t, 1))];
    case "yesterday": return [iso(addDays(t, -1)), iso(t)];
    case "last_7_days": return [iso(addDays(t, -6)), iso(addDays(t, 1))];
    case "last_week": return [iso(addDays(monday, -7)), iso(monday)];
    case "this_month": return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 1)))];
    case "last_month": return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 1)))];
  }
  throw new Error(preset);
}

// ---- harness ---------------------------------------------------------------------------------------------------------
interface Req { path: string; start: string | null; end: string | null }
const writes: string[] = [];
async function openPage(browser: import("@playwright/test").Browser, info: import("@playwright/test").TestInfo, saved?: string) {
  const ctx = await browser.newContext({ baseURL: BASE, ...deviceOptions(info), storageState: storagePath });
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
    reqs.push({ path: u.pathname, start: u.searchParams.get("start") ?? u.searchParams.get("dateFrom"), end: u.searchParams.get("end") ?? u.searchParams.get("dateTo") });
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  // seed the saved period ONCE (a reload must see what the app itself stored, not the seed again)
  if (saved) await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [LS_KEY, JSON.stringify({ option: saved, customFrom: "", customTo: "" })]);
  return { ctx, page, reqs, errors };
}
const settle = async (page: Page, ms = 3000) => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
};
const select = (page: Page) => page.getByTestId("report-date-filter");
const soldReqs = (reqs: Req[]) => reqs.filter((r) => r.path === "/api/reports/overview/sold" && r.start);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const note = (type: string, description: string) => test.info().annotations.push({ type, description });

// ---------------------------------------------------------------------------------------------------------------------
test("A-K: Tùy chọn ngày… -> pick From and To visually -> dd/mm/yyyy -> Áp dụng = exactly one refresh -> reload keeps the period", async ({ browser }, info) => {
  const { ctx, page, reqs, errors } = await openPage(browser, info, "this_month");
  await page.goto(URL_SALES);
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await settle(page);

  const mark = reqs.length;
  await select(page).selectOption("custom"); // A
  const from = page.getByTestId("report-date-filter-from");
  const to = page.getByTestId("report-date-filter-to");
  const apply = page.getByTestId("report-date-filter-apply");
  await expect(from).toHaveAttribute("placeholder", "dd/mm/yyyy");

  await pickDate(page, "report-date-filter-from", "2026-08-05"); // B C D
  await expect(from).toHaveValue("05/08/2026");
  await pickDate(page, "report-date-filter-to", "2026-08-20"); // E F
  await expect(to).toHaveValue("20/08/2026"); // G
  await page.screenshot({ path: path.join(OUT, `${info.project.name}-custom-picked.png`) });
  expect(reqs.length - mark, "opening the calendar and choosing draft dates must not fetch anything").toBe(0);
  await expect(apply).toBeEnabled();

  await apply.click(); // H
  await settle(page, 3000);
  const sold = soldReqs(reqs.slice(mark));
  expect(sold.length, "I: exactly one refresh for the committed range").toBe(1);
  expect([sold[0].start, sold[0].end]).toEqual(["2026-08-05", "2026-08-21"]);

  const m2 = reqs.length; // count from BEFORE the reload so its own requests are included
  await page.reload(); // J
  await expect(select(page)).toHaveValue("custom", { timeout: 40_000 });
  await settle(page, 3000);
  await expect(from).toHaveValue("05/08/2026"); // K
  await expect(to).toHaveValue("20/08/2026");
  const after = soldReqs(reqs.slice(m2));
  expect(after.length).toBe(1);
  expect([after[0].start, after[0].end]).toEqual(["2026-08-05", "2026-08-21"]);
  expect(errors).toEqual([]);
  note("matrix-AK", `${info.project.name}: picked 05/08/2026 .. 20/08/2026 visually, 0 requests while drafting, 1 on Áp dụng, kept after reload`);
  await ctx.close();
});

test("invalid / incomplete / reversed range stays a local draft: exact error text, Áp dụng disabled, no request", async ({ browser }, info) => {
  const { ctx, page, reqs } = await openPage(browser, info, "this_month");
  await page.goto(URL_SALES);
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await settle(page);
  const mark = reqs.length;
  await select(page).selectOption("custom");
  const apply = page.getByTestId("report-date-filter-apply");
  const error = page.getByTestId("report-date-filter-error");

  await pickDate(page, "report-date-filter-from", "2026-08-20");
  await pickDate(page, "report-date-filter-to", "2026-08-05"); // reversed
  await expect(error).toHaveText("Khoảng ngày không hợp lệ");
  await expect(apply).toBeDisabled();

  // incomplete: clear the To date through the calendar's own "Xóa"
  await page.getByTestId("report-date-filter-to").click();
  await page.getByTestId("date-calendar-clear").click();
  await expect(apply).toBeDisabled();
  await expect(error).toHaveText("Khoảng ngày không hợp lệ");

  if (!info.project.use.isMobile) {
    // typing stays supported on desktop; an impossible date is invalid
    await page.getByTestId("report-date-filter-to").fill("31/02/2026");
    await expect(page.getByTestId("report-date-filter-to")).toHaveAttribute("aria-invalid", "true");
    await expect(apply).toBeDisabled();
    await page.getByTestId("report-date-filter-to").fill("30/08/2026");
    await expect(page.getByTestId("report-date-filter-to")).toHaveValue("30/08/2026");
    await expect(apply).toBeEnabled();
  }
  expect(reqs.length - mark, "no request while the range is incomplete / invalid").toBe(0);
  await ctx.close();
});

test("keyboard + Escape + outside click", async ({ browser }, info) => {
  const { ctx, page } = await openPage(browser, info, "this_month");
  await page.goto(URL_SALES);
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await select(page).selectOption("custom");
  const cal = page.getByTestId("date-calendar");
  const picker = page.getByTestId("report-date-filter-from-picker");
  const activeDate = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-date") ?? null);
  const monthLabel = () => cal.getByTestId("date-calendar-month").innerText();

  await picker.click(); // opens and moves focus into the grid
  await expect(cal).toBeVisible();
  const start = await activeDate();
  expect(start, "focus is on a day cell").toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await page.keyboard.press("ArrowRight");
  const next = await activeDate();
  expect(next).not.toBe(start);
  expect(Date.parse(`${next}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)).toBe(86_400_000);
  await page.keyboard.press("ArrowDown");
  expect(Date.parse(`${await activeDate()}T00:00:00Z`) - Date.parse(`${next}T00:00:00Z`)).toBe(7 * 86_400_000);
  const label = await monthLabel();
  await page.keyboard.press("PageDown");
  expect(await monthLabel()).not.toBe(label);

  // Enter selects the highlighted day, closes the calendar and returns focus to the field
  const chosen = await activeDate();
  await page.keyboard.press("Enter");
  await expect(cal).toBeHidden();
  const [yy, mm, dd] = chosen!.split("-");
  await expect(page.getByTestId("report-date-filter-from")).toHaveValue(`${dd}/${mm}/${yy}`);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("report-date-filter-from");

  // Escape closes (and returns focus to the field)
  await picker.click();
  await expect(cal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cal).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("report-date-filter-from");

  // outside click closes
  await picker.click();
  await expect(cal).toBeVisible();
  await page.locator("h1").first().click();
  await expect(cal).toBeHidden();
  await ctx.close();
});

test("presets: Hôm nay, Hôm qua, 7 ngày qua, Tuần trước, Tháng này, Tháng trước = one request, locked ranges", async ({ browser }, info) => {
  const { ctx, page, reqs } = await openPage(browser, info, "all_time");
  await page.goto(URL_SALES);
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await settle(page);
  const seen: string[] = [];
  for (const [value, preset] of [["today", "today"], ["yesterday", "yesterday"], ["last_7_days", "last_7_days"], ["last_week", "last_week"], ["this_month", "this_month"], ["last_month", "last_month"]] as const) {
    await select(page).selectOption("all_time");
    await settle(page, 1200);
    const mark = reqs.length;
    await select(page).selectOption(value);
    await settle(page, 2200);
    const sold = soldReqs(reqs.slice(mark));
    const [s, e] = expected(preset);
    expect(sold.length, `${preset}: one request`).toBe(1);
    expect([sold[0].start, sold[0].end], preset).toEqual([s, e]);
    seen.push(`${preset}=${s}..${e}`);
  }
  note("matrix-presets", `${info.project.name}: ${seen.join(" ")}`);
  await ctx.close();
});

test("layout: the calendar stays inside the viewport, no horizontal overflow (both fields)", async ({ browser }, info) => {
  const { ctx, page } = await openPage(browser, info, "this_month");
  await page.goto(URL_SALES);
  await expect(select(page)).toBeVisible({ timeout: 40_000 });
  await select(page).selectOption("custom");
  for (const field of ["report-date-filter-from", "report-date-filter-to"]) {
    await page.getByTestId(field).click();
    const cal = page.getByTestId("date-calendar");
    await expect(cal).toBeVisible();
    const box = (await cal.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x, `${field}: left edge on screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${field}: right edge on screen`).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y, `${field}: top edge on screen`).toBeGreaterThanOrEqual(0);
    expect(await noOverflow(page), `${field}: no horizontal overflow`).toBe(true);
    await page.screenshot({ path: path.join(OUT, `${info.project.name}-${field}-calendar.png`) });
    await page.keyboard.press("Escape");
    await expect(cal).toBeHidden();
  }
  await ctx.close();
});

test("DatePicker inside a Radix dialog (expense form): calendar opens in the dialog, Escape closes ONLY the calendar, a day can be picked; nothing is saved", async ({ browser }, info) => {
  const { ctx, page, reqs } = await openPage(browser, info, "this_month");
  await page.goto("/reports/monthly-sold-products");
  await expect(page.getByTestId("expense-add-button")).toBeVisible({ timeout: 40_000 });
  await settle(page);
  await page.getByTestId("expense-add-button").click();
  const field = page.getByTestId("expense-date-input");
  await expect(field).toBeVisible();
  const mark = reqs.length;
  await page.getByTestId("expense-date-input-picker").click();
  const cal = page.getByTestId("date-calendar");
  await expect(cal).toBeVisible();
  await page.keyboard.press("Escape"); // must close the calendar and NOT the surrounding dialog
  await expect(cal).toBeHidden();
  await expect(field).toBeVisible();
  await pickDate(page, "expense-date-input", "2026-08-15");
  await expect(field).toHaveValue("15/08/2026");
  expect(reqs.length - mark, "no request from using the calendar inside the dialog").toBe(0);
  await page.keyboard.press("Escape"); // now the dialog itself closes
  await expect(field).toBeHidden();
  await ctx.close();
});

test("Customer Receivable keeps its OWN date filter (current-state page, not the Global period): calendar picks a day, one request with dateFrom", async ({ browser }, info) => {
  const { ctx, page, reqs } = await openPage(browser, info, "last_month");
  await page.goto("/reports/customer-receivable");
  await expect(page.getByTestId("customer-receivable-date-from-input")).toBeVisible({ timeout: 40_000 });
  await settle(page);
  expect(await select(page).count(), "no Global Date Filter on a current-state page").toBe(0);
  const mark = reqs.length;
  await pickDate(page, "customer-receivable-date-from-input", "2026-09-05");
  await expect(page.getByTestId("customer-receivable-date-from-input")).toHaveValue("05/09/2026");
  await settle(page, 2500);
  const list = reqs.slice(mark).filter((r) => r.path.includes("customer-receivable"));
  expect(list.length).toBe(1);
  expect(list[0].start).toBe("2026-09-05");
  await ctx.close();
});

test("zz. Safety: no write requests were issued", async () => {
  expect(writes).toEqual([]);
});
