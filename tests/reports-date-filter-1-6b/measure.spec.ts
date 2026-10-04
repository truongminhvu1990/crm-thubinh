import { test, Browser } from "@playwright/test";
import fs from "fs";
import path from "path";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

/**
 * Phase 1.6B - request-count measurement (READ-ONLY, Dev backend). Same script is run BEFORE (origin/main build) and AFTER
 * the change. For every period-based screen it records the /api requests issued while the page settles:
 *   S1  saved period = last_month, fresh load      -> how many requests, and how many used the DEFAULT (this month) period
 *   S2  nothing saved (default "Tháng này")        -> requests on first load
 *   S3  default, then switch preset to "Tháng trước" -> requests caused by the change itself
 */
const BASE = process.env.QA_BASE_URL!;
const OUT = process.env.MEASURE_OUT!;
const STATE = path.resolve(".state-measure.json");

const PAGES: { name: string; url: string }[] = [
  { name: "dashboard", url: "/dashboard" },
  { name: "reports-sales", url: "/reports/sales?metric=sold&view=orders" },
  { name: "reports-hub", url: "/reports" },
  { name: "money-profit", url: "/reports/money-profit" },
  { name: "sales-ledger", url: "/reports/sales-ledger" },
  { name: "commission-by-salesperson", url: "/reports/commission-by-salesperson" },
  { name: "reconciliation", url: "/reports/reconciliation" },
  { name: "monthly-sold-products", url: "/reports/monthly-sold-products" },
  { name: "payment-method", url: "/reports/payment-method" },
  { name: "commissions", url: "/commissions" },
  { name: "money-debt-ledger", url: "/money-debt-ledger" },
  // customer revenue reads customer_purchases straight from Supabase REST (counted below via the sale_date bound)
  { name: "customer-revenue", url: "/customers/b1000000-0000-0000-0000-000000000005" },
];

function vnMonthStarts() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m] = f.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return { thisStart: `${y}-${p2(m)}-01`, lastStart: `${py}-${p2(pm)}-01` };
}

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

interface Rec {
  total: number;
  byEndpoint: Record<string, number>;
  defaultPeriod: number;
  lastMonthPeriod: number;
  periodless: number;
}

async function measure(browser: Browser, url: string, saved: string | null, action?: "switch") {
  const { thisStart, lastStart } = vnMonthStarts();
  const ctx = await browser.newContext({ baseURL: BASE, storageState: STATE, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (saved) {
    await page.addInitScript((v) => localStorage.setItem("crm-thubinh:globalDateFilter", v), JSON.stringify({ option: saved, customFrom: "", customTo: "" }));
  }
  let rec: Rec = { total: 0, byEndpoint: {}, defaultPeriod: 0, lastMonthPeriod: 0, periodless: 0 };
  const reset = () => (rec = { total: 0, byEndpoint: {}, defaultPeriod: 0, lastMonthPeriod: 0, periodless: 0 });
  page.on("request", (r) => {
    const u = new URL(r.url());
    // Supabase REST read of customer_purchases with a sale_date lower bound = a period request of the Customer Revenue card
    const restBound = u.pathname.startsWith("/rest/v1/customer_purchases") ? /sale_date=gte\.(\d{4}-\d{2}-\d{2})/.exec(decodeURIComponent(u.search))?.[1] : undefined;
    if (restBound) {
      rec.total += 1;
      rec.byEndpoint["REST customer_purchases(period)"] = (rec.byEndpoint["REST customer_purchases(period)"] ?? 0) + 1;
      if (restBound === thisStart) rec.defaultPeriod += 1;
      else if (restBound === lastStart) rec.lastMonthPeriod += 1;
      return;
    }
    if (!u.pathname.startsWith("/api/")) return;
    if (u.pathname.startsWith("/api/report-preferences")) return; // column preferences are not period data
    rec.total += 1;
    rec.byEndpoint[u.pathname] = (rec.byEndpoint[u.pathname] ?? 0) + 1;
    const from = u.searchParams.get("start") ?? u.searchParams.get("dateFrom");
    if (!from) rec.periodless += 1;
    else if (from === thisStart) rec.defaultPeriod += 1;
    else if (from === lastStart) rec.lastMonthPeriod += 1;
  });
  await page.goto(url);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(5000);
  if (action === "switch") {
    reset();
    const sel = page.getByTestId("report-date-filter");
    if (await sel.count()) {
      await sel.selectOption("last_month");
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(5000);
    } else {
      rec.total = -1; // page has no global filter
    }
  }
  const out = rec;
  await ctx.close();
  return out;
}

const results: Record<string, unknown> = {};
test.afterAll(() => fs.writeFileSync(OUT, JSON.stringify(results, null, 1)));

for (const p of PAGES) {
  test(`measure ${p.name}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const s1 = await measure(browser, p.url, "last_month");
    const s2 = await measure(browser, p.url, null);
    const s3 = await measure(browser, p.url, null, "switch");
    results[p.name] = { S1_saved_last_month: s1, S2_default_first_load: s2, S3_switch_to_last_month: s3 };
  });
}
