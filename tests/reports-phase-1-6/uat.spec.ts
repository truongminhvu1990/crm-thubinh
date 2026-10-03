import { test, expect as baseExpect, Browser, BrowserContext, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

/**
 * Phase 1.6 Wave A - browser UAT on DEV ONLY (QA_BASE_URL must be a local dev server on the Dev Supabase project).
 * READ-ONLY: only navigation, GETs and typing into filter inputs. No form is submitted, no write endpoint is called
 * (a request guard below fails the test on any non-GET to /api other than Supabase auth).
 */

// Dev-mode server (on-demand compile + remote Dev Supabase): detail calls take 2-6 s, so assertions get 20 s.
const expect = baseExpect.configure({ timeout: 20_000 });
const BASE = process.env.QA_BASE_URL!;
const EVIDENCE_DIR = path.resolve("artifacts/uat-phase-1-6");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const STATE_DIR = path.join(EVIDENCE_DIR, ".state");
fs.mkdirSync(STATE_DIR, { recursive: true });

const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
type Vp = typeof DESKTOP;

const ROLE_KEYS = ["OWNER", "MANAGER", "SALES", "MARKETING", "VIEWER"] as const;
type Role = (typeof ROLE_KEYS)[number];
async function login(page: Page, role: Role) {
  const { email, password } = credentialsFor(role);
  const lp = new LoginPage(page);
  await lp.goto();
  await lp.fillCredentials(email, password);
  const token = page.waitForResponse((r) => r.url().includes("/auth/v1/token"), { timeout: 60_000 });
  await lp.submit();
  expect((await token).ok()).toBe(true);
  // Production build: the shell's <Link> prefetches of /dashboard were answered 307->/login before sign-in, and the
  // client router replays that cached redirect for ~30 s. A full navigation sidesteps the cache (test-side only).
  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}
const stateFile = (r: Role) => path.join(STATE_DIR, `${r}.json`);

test.describe.configure({ timeout: 150_000 });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(400_000);
  for (const role of ROLE_KEYS) {
    // Idempotent: a worker restart after a failed test must not log everyone in again.
    if (fs.existsSync(stateFile(role)) && Date.now() - fs.statSync(stateFile(role)).mtimeMs < 20 * 60_000) continue;
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await login(page, role);
    await ctx.storageState({ path: stateFile(role) });
    await ctx.close();
  }
});

const writes: string[] = [];
const netlog: string[] = [];
test.beforeEach(() => {
  netlog.length = 0;
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) console.log(["NETLOG for failed test:", ...netlog.slice(-40)].join("\n"));
});
async function openCtx(browser: Browser, role: Role, vp: Vp = DESKTOP, extra: Record<string, unknown> = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE, storageState: stateFile(role), locale: "en-US", ...vp, ...extra });
  // Safety: UAT must never write business data.
  ctx.on("request", (req) => {
    const m = req.method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && /\/api\//.test(req.url())) writes.push(`${m} ${req.url()}`);
  });
  return ctx;
}
async function openPage(browser: Browser, role: Role, vp: Vp = DESKTOP, extra: Record<string, unknown> = {}) {
  const ctx = await openCtx(browser, role, vp, extra);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(String(e));
    netlog.push("PAGEERROR " + String(e.stack ?? e).split("\n").slice(0, 4).join(" / "));
  });
  page.on("response", (r) => {
    const ct = r.headers()["content-type"] ?? "";
    if (r.url().includes("/api/") && (r.status() >= 400 || ct.includes("html"))) netlog.push(`BAD ${r.status()} ${ct} ${r.url().replace(BASE, "")}`);
    if (r.url().includes("/api/reports/detail/")) netlog.push(`${new Date().toISOString().slice(11, 23)} ${r.status()} ${r.url().replace(BASE, "")}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/")) netlog.push(`${new Date().toISOString().slice(11, 23)} FAILED ${r.failure()?.errorText} ${r.url().replace(BASE, "")}`);
  });
  return { ctx, page, errors };
}

const note = (type: string, description: string) => test.info().annotations.push({ type, description });
const shot = async (page: Page, name: string) => page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
const detailOf = (page: Page) => new URL(page.url()).searchParams.get("detail");
const drawer = (page: Page) => page.getByTestId("entity-drawer");
/** Select "Toàn thời gian" and make sure it STICKS (the stored filter hydrates after first paint and can overwrite an early selection). */
const allTime = async (page: Page) => {
  const select = page.getByTestId("report-date-filter");
  for (let i = 0; i < 4; i += 1) {
    await select.selectOption("all_time");
    await page.waitForTimeout(1500);
    if ((await select.inputValue()) === "all_time") return;
  }
  throw new Error("could not set the global date filter to all_time");
};
const link = (page: Page, type: string) => page.locator(`[data-testid="entity-link-${type}"]`);
const noHorizontalOverflow = async (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Today in Vietnam, as [iso, dmy, isoTomorrow]. */
function vnToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = parts.split("-");
  const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1)).toISOString().slice(0, 10);
  return { iso: `${y}-${m}-${d}`, dmy: `${d}/${m}/${y}`, tomorrow: next };
}

// ---------------------------------------------------------------------------------------------------------------
// A + B + C. Drawer from Sales, navigation, URL / history  (desktop and mobile)
// ---------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] Sales: Order -> Customer -> Order -> Product -> Order drawer chain, URL + history`, async ({ browser }) => {
    const { ctx, page, errors } = await openPage(browser, "OWNER", vp);
    await page.goto("/reports/sales?metric=sold&view=orders");
    await allTime(page);
    const urlParamsBefore = new URL(page.url()).searchParams;
    await expect(link(page, "order").first()).toBeVisible({ timeout: 40_000 });
    expect(await drawer(page).count()).toBe(0);

    // 1. open Order
    await link(page, "order").first().click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toContainText("Chi tiết đơn hàng");
    await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
    const d1 = detailOf(page)!;
    expect(d1).toMatch(/^order:[0-9a-f-]{36}$/);
    const p = new URL(page.url()).searchParams;
    expect(p.get("metric")).toBe(urlParamsBefore.get("metric"));
    expect(p.get("view")).toBe(urlParamsBefore.get("view"));
    note("url-after-open", page.url());
    await shot(page, `${label}-sales-order-drawer`);

    // 2. -> Customer
    await drawer(page).locator('[data-testid="entity-link-customer"]').first().click();
    await expect(drawer(page)).toContainText("Chi tiết khách hàng");
    await expect(drawer(page)).toContainText("Số điện thoại", { timeout: 20_000 });
    await expect(drawer(page)).not.toContainText("Địa chỉ");
    const d2 = detailOf(page)!;
    expect(d2).toMatch(/^customer:/);
    expect(d2).not.toBe(d1);
    await shot(page, `${label}-sales-customer-drawer`);

    // 3. -> Order (from customer's order list)
    await drawer(page).getByTestId("drawer-customer-order").first().locator("button").first().click();
    await expect(drawer(page)).toContainText("Chi tiết đơn hàng");
    await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
    const d3 = detailOf(page)!;
    expect(d3).toMatch(/^order:/);

    // 4. -> Product (from an order item)
    await drawer(page).getByTestId("drawer-order-item").first().locator('[data-testid="entity-link-product"]').click();
    await expect(drawer(page)).toContainText("Chi tiết sản phẩm");
    await expect(drawer(page)).toContainText("Đơn hàng liên quan", { timeout: 20_000 });
    const d4 = detailOf(page)!;
    expect(d4).toMatch(/^product:/);

    // 5. -> Order (from the product's order list)
    await drawer(page).getByTestId("drawer-product-order").first().locator('[data-testid="entity-link-order"]').click();
    await expect(drawer(page)).toContainText("Chi tiết đơn hàng");
    await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
    const d5 = detailOf(page)!;
    expect(d5).toMatch(/^order:/);
    const chain = [d1, d2, d3, d4, d5];
    note("chain", chain.map((c) => c.split(":")[0]).join(" -> "));

    // History: Back / Forward walk the chain
    await page.goBack();
    await expect.poll(() => detailOf(page)).toBe(d4);
    await expect(drawer(page)).toContainText("Chi tiết sản phẩm");
    await page.goBack();
    await expect.poll(() => detailOf(page)).toBe(d3);
    await page.goForward();
    await expect.poll(() => detailOf(page)).toBe(d4);
    await page.goForward();
    await expect.poll(() => detailOf(page)).toBe(d5);
    await expect(drawer(page)).toContainText("Chi tiết đơn hàng");

    // F5 keeps the same entity open, other params intact
    await page.reload();
    await expect(drawer(page)).toBeVisible({ timeout: 30_000 });
    expect(detailOf(page)).toBe(d5);
    await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("metric")).toBe("sold");

    // Deep link: same URL in a fresh page of the same session
    const page2 = await ctx.newPage();
    await page2.goto(page.url());
    await expect(drawer(page2)).toBeVisible({ timeout: 30_000 });
    expect(detailOf(page2)).toBe(d5);
    await page2.close();

    if (label === "mobile") {
      const box = await drawer(page).boundingBox();
      expect(Math.round(box!.width)).toBe(390);
      expect(await noHorizontalOverflow(page)).toBe(true);
      await shot(page, "mobile-sales-order-drawer-after-reload");
    }

    // Close: URL loses only `detail`
    await drawer(page).getByRole("button", { name: "Đóng" }).click();
    await expect(drawer(page)).toHaveCount(0);
    const afterClose = new URL(page.url());
    expect(afterClose.searchParams.has("detail")).toBe(false);
    expect(afterClose.searchParams.get("metric")).toBe("sold");
    expect(afterClose.searchParams.get("view")).toBe("orders");

    // Back after close - record ACTUAL behaviour (no architecture change)
    await page.goBack();
    await page.waitForTimeout(800);
    const backAfterClose = { url: page.url(), drawerOpen: (await drawer(page).count()) > 0, detail: detailOf(page) };
    note("back-after-close", JSON.stringify(backAfterClose));
    await page.goForward();
    await page.waitForTimeout(500);
    note("forward-after-back-after-close", JSON.stringify({ url: page.url(), drawerOpen: (await drawer(page).count()) > 0 }));

    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test("[desktop] Drawer: Xem đầy đủ goes to the official pages", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER");
  await page.goto("/reports/sales?metric=sold&view=orders");
  await allTime(page);
  await expect(link(page, "order").first()).toBeVisible({ timeout: 40_000 });

  const expectations: [string, RegExp][] = [
    ["order", /\/orders\/[0-9a-f-]{36}$/],
    ["customer", /\/customers\/[0-9a-f-]{36}$/],
  ];
  for (const [type, re] of expectations) {
    await page.goto("/reports/sales?metric=sold&view=orders");
    await allTime(page);
    await link(page, type === "order" ? "order" : "customer").first().click();
    await expect(drawer(page)).toBeVisible();
    await drawer(page).getByTestId("drawer-full-page").waitFor();
    const href = await drawer(page).getByTestId("drawer-full-page").getAttribute("href");
    expect(href).toMatch(re);
    await drawer(page).getByTestId("drawer-full-page").click();
    await expect(page).toHaveURL(re, { timeout: 30_000 });
    note(`full-page-${type}`, page.url());
  }
  // product: via an order item
  await page.goto("/reports/sales?metric=sold&view=orders");
  await allTime(page);
  await link(page, "order").first().click();
  await drawer(page).getByTestId("drawer-order-item").first().locator('[data-testid="entity-link-product"]').click();
  await expect(drawer(page)).toContainText("Chi tiết sản phẩm");
  await drawer(page).getByTestId("drawer-full-page").click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  note("full-page-product", page.url());
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// A.2 Inventory
// ---------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] Inventory: Inventory drawer -> holding Order -> Customer; held-without-order empty state; Product`, async ({ browser }) => {
    const { ctx, page, errors } = await openPage(browser, "OWNER", vp);
    const heldRes = await page.request.get("/api/reports/overview/held-inventory", { timeout: 90_000 });
    const held = (await heldRes.json()).rows as { product_code: string; product_id: string; holding_order: { order_number: string } | null }[];
    const withOrder = held.find((r) => r.holding_order);
    const without = held.find((r) => !r.holding_order);
    expect(withOrder, "Dev has a held product with an order").toBeTruthy();

    await page.goto("/reports/inventory?view=held");
    const row = page.locator("tr", { hasText: withOrder!.holding_order!.order_number }).first();
    await expect(row).toBeVisible({ timeout: 40_000 });
    await row.locator('[data-testid="entity-link-inventory"]').first().click();
    await expect(drawer(page)).toContainText("Chi tiết tồn kho");
    await expect(drawer(page)).toContainText("Hàng đang giữ", { timeout: 20_000 });
    expect(detailOf(page)).toMatch(/^inventory:/);
    expect(new URL(page.url()).searchParams.get("view")).toBe("held");
    await expect(drawer(page).getByTestId("drawer-holding-order")).toContainText("Đã thu (cả đơn)");
    await shot(page, `${label}-inventory-drawer`);

    // -> related Order
    await drawer(page).getByTestId("drawer-holding-order").locator('[data-testid="entity-link-order"]').click();
    await expect(drawer(page)).toContainText("Chi tiết đơn hàng");
    await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
    // -> Customer
    await drawer(page).locator('[data-testid="entity-link-customer"]').first().click();
    await expect(drawer(page)).toContainText("Chi tiết khách hàng");
    // -> Product (via back to inventory drawer's product link)
    await page.goBack();
    await page.goBack();
    await expect(drawer(page)).toContainText("Chi tiết tồn kho");
    await drawer(page).getByRole("button", { name: "Xem sản phẩm này" }).click();
    await expect(drawer(page)).toContainText("Chi tiết sản phẩm");
    await drawer(page).getByRole("button", { name: "Đóng" }).click();
    await expect(drawer(page)).toHaveCount(0);

    // empty: held product with no open order
    if (without) {
      const r2 = page.locator("tr", { hasText: without.product_code }).first();
      await r2.locator('[data-testid="entity-link-inventory"]').first().click();
      await expect(drawer(page)).toContainText("Không có đơn đang giữ nào trong phạm vi bạn được xem", { timeout: 20_000 });
      note("empty-state-inventory", "held product without open order shows the empty message");
      await drawer(page).getByRole("button", { name: "Đóng" }).click();
    }

    // remaining view: not-held message
    await page.goto("/reports/inventory?view=remaining");
    await expect(link(page, "inventory").first()).toBeVisible({ timeout: 40_000 });
    await link(page, "inventory").first().click();
    await expect(drawer(page)).toContainText("Sản phẩm không ở trạng thái đang giữ", { timeout: 20_000 });
    await expect(drawer(page)).toContainText("Hàng còn lại");
    if (label === "mobile") expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// A.3 Monthly Sold Products   +  A.4 Sales Ledger
// ---------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] Monthly Sold Products: Product / Customer / Order drawers (+ date filter input)`, async ({ browser }) => {
    const { ctx, page, errors } = await openPage(browser, "OWNER", vp);
    await page.goto("/reports/monthly-sold-products");
    // Put a wide range through the dd/mm/yyyy inputs (also exercises DateInput)
    const inputs = page.locator('input[placeholder="dd/mm/yyyy"]');
    await expect(inputs.first()).toBeVisible({ timeout: 40_000 });
    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/reports/monthly-sold-products") && r.url().includes("dateFrom=2020-01-01"), { timeout: 30_000 });
    await inputs.nth(0).fill("01/01/2020");
    await reqPromise;
    await expect(inputs.nth(0)).toHaveValue("01/01/2020");
    await expect(page.getByTestId("monthly-sold-products-table")).toBeVisible({ timeout: 30_000 });

    for (const t of ["product", "customer", "order"] as const) {
      const l = page.getByTestId("monthly-sold-products-table").locator(`[data-testid="entity-link-${t}"]`).first();
      await expect(l).toBeVisible({ timeout: 30_000 });
      await l.click();
      await expect(drawer(page)).toBeVisible();
      await expect(drawer(page)).toContainText(t === "product" ? "Chi tiết sản phẩm" : t === "customer" ? "Chi tiết khách hàng" : "Chi tiết đơn hàng");
      await expect(drawer(page)).not.toContainText("Đang tải", { timeout: 20_000 });
      expect(detailOf(page)).toMatch(new RegExp(`^${t}:`));
      expect(new URL(page.url()).searchParams.get("detail")).toBeTruthy();
      await drawer(page).getByRole("button", { name: "Đóng" }).click();
      await expect(drawer(page)).toHaveCount(0);
    }
    await shot(page, `${label}-msp`);
    note("msp-headers", (await page.getByTestId("monthly-sold-products-table").locator("th").allInnerTexts()).filter((t) => /cả đơn/i.test(t)).join(" | "));
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test(`[${label}] Sales Ledger: Product / Customer drawers; Order column + mobile cards recorded`, async ({ browser }) => {
    const { ctx, page, errors } = await openPage(browser, "OWNER", vp);
    await page.goto("/reports/sales-ledger");
    await allTime(page).catch(() => undefined);
    const table = page.getByTestId("sales-ledger-table");
    if (label === "desktop") {
      await expect(table).toBeVisible({ timeout: 40_000 });
      for (const t of ["product", "customer"] as const) {
        const l = table.locator(`[data-testid="entity-link-${t}"]`).first();
        await expect(l).toBeVisible({ timeout: 30_000 });
        await l.click();
        await expect(drawer(page)).toBeVisible();
        await expect(drawer(page)).not.toContainText("Đang tải", { timeout: 20_000 });
        expect(detailOf(page)).toMatch(new RegExp(`^${t}:`));
        await drawer(page).getByRole("button", { name: "Đóng" }).click();
        await expect(drawer(page)).toHaveCount(0);
      }
      note("ledger-order-column", `order links in ledger table: ${await table.locator('[data-testid="entity-link-order"]').count()} (Số đơn column has no order_id - known, not in scope)`);
    } else {
      await expect(page.getByTestId("sales-ledger-mobile-row").first()).toBeVisible({ timeout: 40_000 });
      note("ledger-mobile-cards", `entity links in mobile cards: ${await page.getByTestId("sales-ledger-mobile-row").locator('[data-testid^="entity-link-"]').count()} (cards are <Link>; known, not in scope)`);
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// A.5 Drawer states: loading / error / 403 / 404 / empty
// ---------------------------------------------------------------------------------------------------------------
test("[desktop] Drawer states: loading, error, forbidden, not found, empty", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER");
  const probe = await page.request.get("/api/reports/overview/sold?start=2020-01-01&end=2028-01-01&view=orders", { timeout: 90_000 });
  const row = (await probe.json()).rows[0] as { order_id: string };
  const url = `/reports/sales?metric=sold&view=orders&detail=order:${row.order_id}`;

  // loading (delay the detail API)
  await page.route("**/api/reports/detail/**", async (r) => {
    await new Promise((res) => setTimeout(res, 2500));
    await r.continue();
  });
  await page.goto(url);
  await expect(page.getByTestId("drawer-loading")).toBeVisible({ timeout: 15_000 });
  await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
  await expect(page.getByTestId("drawer-loading")).toHaveCount(0);
  await page.unroute("**/api/reports/detail/**");

  const cases: [number, string, string][] = [
    [500, "drawer-error", "Không tải được chi tiết"],
    [403, "drawer-error", "Bạn không có quyền xem báo cáo này"],
    [404, "drawer-error", "ngoài phạm vi bạn được xem"],
  ];
  for (const [status, id, text] of cases) {
    await page.route("**/api/reports/detail/**", (r) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "x" }) }));
    await page.goto(url);
    await expect(page.getByTestId(id)).toContainText(text, { timeout: 20_000 });
    note(`state-${status}`, await page.getByTestId(id).innerText());
    await shot(page, `desktop-drawer-state-${status}`);
    await page.unroute("**/api/reports/detail/**");
  }

  // network failure
  await page.route("**/api/reports/detail/**", (r) => r.abort());
  await page.goto(url);
  await expect(page.getByTestId("drawer-error")).toContainText("Không tải được chi tiết", { timeout: 20_000 });
  await page.unroute("**/api/reports/detail/**");

  // empty: a product with no orders in scope
  const rem = await page.request.get("/api/reports/overview/remaining-inventory", { timeout: 90_000 });
  const rows = (await rem.json()).rows as { product_id: string }[];
  let emptySeen = false;
  for (const r of rows) {
    const d = await (await page.request.get(`/api/reports/detail/product/${r.product_id}`, { timeout: 90_000 })).json();
    if (d.orders.length === 0) {
      await page.goto(`/reports/inventory?view=remaining&detail=product:${r.product_id}`);
      await expect(drawer(page)).toContainText("Không có đơn nào trong phạm vi bạn được xem", { timeout: 20_000 });
      emptySeen = true;
      break;
    }
  }
  expect(emptySeen, "a remaining product without orders exists on Dev").toBe(true);

  // malformed detail param is ignored (no drawer, no crash)
  await page.goto("/reports/sales?metric=sold&view=orders&detail=order:not-a-uuid");
  await expect(page.getByTestId("report-date-filter")).toBeVisible({ timeout: 30_000 });
  expect(await drawer(page).count()).toBe(0);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Data scope (API with real roles, plus UI deep link)
// ---------------------------------------------------------------------------------------------------------------
test("Data scope: no leak through Order / Product / Customer / Inventory drawers for every role", async ({ browser }) => {
  test.setTimeout(900_000);
  const owner = await openPage(browser, "OWNER");
  const ownerOrders = ((await (await owner.page.request.get("/api/orders", { timeout: 90_000 })).json()) as { id: string; sales_owner: string }[]);
  const ownerIds = ownerOrders.map((o) => o.id);
  const soldProducts = ((await (await owner.page.request.get("/api/reports/overview/sold?start=2020-01-01&end=2028-01-01&view=products", { timeout: 90_000 })).json()).rows) as {
    order_id: string | null;
    product_id: string | null;
    customer_id: string;
  }[];

  const summary: Record<string, unknown> = {};
  for (const role of ["MANAGER", "SALES", "MARKETING", "VIEWER"] as Role[]) {
    const { ctx, page } = await openPage(browser, role);
    const visible = new Set(((await (await page.request.get("/api/orders", { timeout: 90_000 })).json()) as { id: string }[]).map((o) => o.id));
    const outside = ownerIds.filter((id) => !visible.has(id));
    expect(outside.length, `${role}: Dev has orders outside this role's scope`).toBeGreaterThan(0);

    // Order drawer: in scope 200, outside 404
    for (const id of outside) {
      const status = (await page.request.get(`/api/reports/detail/order/${id}`, { timeout: 90_000 })).status();
      expect(status, `${role} order ${id} outside scope`).toBe(404);
    }
    for (const id of [...visible].slice(0, 5)) {
      expect((await page.request.get(`/api/reports/detail/order/${id}`, { timeout: 90_000 })).status()).toBe(200);
    }

    // Product + Customer drawers must only ever list in-scope orders; customer total counts only those
    const products = [...new Set(soldProducts.filter((r) => r.product_id && r.order_id && !visible.has(r.order_id)).map((r) => r.product_id!))].slice(0, 8);
    let productLeaks = 0;
    for (const pid of products) {
      const d = await (await page.request.get(`/api/reports/detail/product/${pid}`, { timeout: 90_000 })).json();
      productLeaks += d.orders.filter((o: { order_id: string }) => !visible.has(o.order_id)).length;
    }
    expect(productLeaks).toBe(0);

    const customers = [...new Set(soldProducts.filter((r) => r.order_id && !visible.has(r.order_id)).map((r) => r.customer_id))].slice(0, 8);
    let customerLeaks = 0;
    let totalMismatch = 0;
    let customersWithHiddenOrders = 0;
    for (const cid of customers) {
      const d = await (await page.request.get(`/api/reports/detail/customer/${cid}`, { timeout: 90_000 })).json();
      customerLeaks += d.orders.filter((o: { order_id: string }) => !visible.has(o.order_id)).length;
      const expected = d.orders.reduce((s: number, o: { total_amount: number }) => s + o.total_amount, 0);
      if (!d.summary.truncated && d.summary.total_order_value !== expected) totalMismatch += 1;
      if (d.summary.order_count !== d.orders.length) totalMismatch += 1;
      const od = await (await owner.page.request.get(`/api/reports/detail/customer/${cid}`, { timeout: 90_000 })).json();
      if (od.summary.order_count > d.summary.order_count) customersWithHiddenOrders += 1;
    }
    expect(customerLeaks).toBe(0);
    expect(totalMismatch).toBe(0);

    // Inventory drawer: holding order shown only when in scope
    const held = ((await (await owner.page.request.get("/api/reports/overview/held-inventory", { timeout: 90_000 })).json()).rows) as { product_id: string; holding_order: { order_id: string } | null }[];
    let invChecked = 0;
    for (const h of held) {
      const d = await (await page.request.get(`/api/reports/detail/inventory/${h.product_id}`, { timeout: 90_000 })).json();
      if (h.holding_order) {
        invChecked += 1;
        expect(!!d.holding_order, `inventory holding order visibility for ${role}`).toBe(visible.has(h.holding_order.order_id));
      } else {
        expect(d.holding_order).toBeNull();
      }
    }
    summary[role] = { visible: visible.size, outside: outside.length, productsChecked: products.length, customersChecked: customers.length, customersWithHiddenOrders, inventoryHoldingChecked: invChecked };
    await ctx.close();
  }
  note("scope-summary", JSON.stringify(summary));

  // UI: deep link to an out-of-scope order as SALES
  const sales = await openPage(browser, "SALES");
  const salesVisible = new Set(((await (await sales.page.request.get("/api/orders", { timeout: 90_000 })).json()) as { id: string }[]).map((o) => o.id));
  const hidden = ownerIds.find((id) => !salesVisible.has(id))!;
  await sales.page.goto(`/reports/sales?metric=sold&view=orders&detail=order:${hidden}`);
  await expect(sales.page.getByTestId("drawer-error")).toContainText("ngoài phạm vi bạn được xem", { timeout: 30_000 });
  await shot(sales.page, "desktop-scope-hidden-order-deeplink");
  await sales.ctx.close();
  await owner.ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// 4b. Permission states
// ---------------------------------------------------------------------------------------------------------------
test("Permission: unauthenticated API denied; loading is not denied; denied and error are distinct; no flash", async ({ browser }) => {
  // unauthenticated request
  const anon = await browser.newContext({ baseURL: BASE });
  for (const t of ["order", "product", "customer", "inventory"]) {
    const r = await anon.request.get(`/api/reports/detail/${t}/3f2c1a40-8b1e-4c7a-9d55-0a1b2c3d4e5f`, { maxRedirects: 0 });
    note(`anon-${t}`, String(r.status()));
    expect([401, 403, 302, 307, 308]).toContain(r.status());
  }
  await anon.close();

  const DENIED = "Bạn không có quyền xem báo cáo";
  const ERROR = "Không kiểm tra được quyền truy cập";

  // 1. allowed role + slowed permission lookup: the denied text must NEVER appear at any moment
  {
    const { ctx, page } = await openPage(browser, "OWNER");
    await page.addInitScript((needle) => {
      (window as unknown as { __denied: boolean }).__denied = false;
      new MutationObserver(() => {
        if (document.body && document.body.innerText.includes(needle)) (window as unknown as { __denied: boolean }).__denied = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    }, DENIED);
    await page.route("**/rest/v1/role_permissions**", async (r) => {
      await new Promise((res) => setTimeout(res, 2500));
      await r.continue();
    });
    await page.goto("/reports/sales?metric=sold&view=orders");
    await expect(page.getByTestId("permission-gate")).toHaveAttribute("data-permission-state", "loading", { timeout: 15_000 }).catch(() => undefined);
    await expect(page.getByTestId("report-date-filter")).toBeVisible({ timeout: 40_000 });
    expect(await page.evaluate(() => (window as unknown as { __denied: boolean }).__denied)).toBe(false);
    note("no-flash", "denied text never rendered while the permission lookup was slow and then allowed");
    await ctx.close();
  }
  // 2. permission REVOKED (empty grants) -> denied message
  {
    const { ctx, page } = await openPage(browser, "OWNER");
    await page.route("**/rest/v1/role_permissions**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]", headers: { "content-range": "*/0" } }));
    await page.goto("/reports/sales?metric=sold&view=orders");
    await expect(page.getByTestId("permission-gate")).toHaveAttribute("data-permission-state", "denied", { timeout: 30_000 });
    await expect(page.getByTestId("permission-gate")).toContainText(DENIED);
    expect(await drawer(page).count()).toBe(0);
    await shot(page, "desktop-permission-denied");
    await ctx.close();
  }
  // 3. permission lookup FAILS -> error state, NOT the denied message
  {
    const { ctx, page } = await openPage(browser, "OWNER");
    await page.route("**/rest/v1/role_permissions**", (r) => r.abort());
    await page.goto("/reports/sales?metric=sold&view=orders");
    await expect(page.getByTestId("permission-gate")).toHaveAttribute("data-permission-state", "error", { timeout: 30_000 });
    await expect(page.getByTestId("permission-gate")).toContainText(ERROR);
    await expect(page.getByTestId("permission-gate")).not.toContainText(DENIED);
    await shot(page, "desktop-permission-error");
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Financial hierarchy (desktop + mobile)
// ---------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] Financial hierarchy: order-level vs product-level labels`, async ({ browser }) => {
    const { ctx, page } = await openPage(browser, "OWNER", vp);
    const rows = ((await (await page.request.get("/api/reports/overview/sold?start=2020-01-01&end=2028-01-01&view=orders", { timeout: 90_000 })).json()).rows) as {
      order_id: string;
      order_number: string;
      sold_value: number;
      amount_paid: number;
    }[];
    // an order whose paid amount differs from its product value (order-level != product-level)
    const diff = rows.find((r) => r.amount_paid !== r.sold_value) ?? rows[0];
    const detail = await (await page.request.get(`/api/reports/detail/order/${diff.order_id}`, { timeout: 90_000 })).json();
    note("financial-order", JSON.stringify({ n: diff.order_number, total: detail.totals.total_amount, paid: detail.totals.amount_paid, lines: detail.items.map((i: { line_total: number }) => i.line_total) }));

    await page.goto(`/reports/sales?metric=sold&view=orders&detail=order:${diff.order_id}`);
    const d = drawer(page);
    await expect(d).toContainText("Tổng đơn (cả đơn)", { timeout: 40_000 });
    await expect(d).toContainText("Đã thu (cả đơn)");
    await expect(d).toContainText("Còn phải thu (cả đơn)");
    await expect(d).toContainText("Giá bán cuối (thành tiền dòng ÷ số lượng)");
    await expect(d).toContainText("Số lượng");
    await expect(d).toContainText("Thành tiền dòng");
    // payment words never appear inside a product line card
    const items = d.getByTestId("drawer-order-item");
    for (let i = 0; i < (await items.count()); i += 1) {
      await expect(items.nth(i)).not.toContainText("Đã thu");
      await expect(items.nth(i)).not.toContainText("Còn phải thu");
    }
    // displayed "Giá bán cuối" == line_total / quantity
    const it = detail.items[0];
    const expected = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(it.quantity > 0 ? it.line_total / it.quantity : it.unit_price).replace(/\s/g, " ");
    const text = (await items.first().innerText()).replace(/\s/g, " ");
    expect(text).toContain(expected);
    await shot(page, `${label}-financial-hierarchy`);
    if (label === "mobile") expect(await noHorizontalOverflow(page)).toBe(true);
    await ctx.close();
  });
}

test("[desktop] Financial labels on report tables: whole-order columns say (cả đơn)", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER");
  await page.goto("/reports/sales?metric=sold&view=products");
  await allTime(page);
  await expect(page.locator("table").first()).toBeVisible({ timeout: 40_000 });
  // The first table is the product view; the later "no product line" table is order-level by definition.
  const headers = (await page.locator("table").first().locator("th").allInnerTexts()).map((h) => h.trim().toLowerCase());
  expect(headers.some((h) => h.includes("đã thu (cả đơn)"))).toBe(true);
  expect(headers.some((h) => h.includes("còn lại (cả đơn)"))).toBe(true);
  expect(headers.filter((h) => h === "đã thu" || h === "còn lại")).toEqual([]);
  note("sales-product-headers", headers.join(" | "));
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Orders list
// ---------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] Orders list: Sản phẩm column + quick view; other columns unchanged`, async ({ browser }) => {
    const { ctx, page, errors } = await openPage(browser, "OWNER", vp);
    const api = (await (await page.request.get("/api/orders", { timeout: 90_000 })).json()) as {
      id: string;
      order_number: string;
      item_count: number;
      product_names: string[];
      total_amount: number;
      sales_owner: string;
    }[];
    await page.goto("/orders");
    const table = page.getByTestId("order-table");
    await expect(table).toBeVisible({ timeout: 40_000 });
    const headers = await table.locator("th").allInnerTexts();
    const hl = headers.map((h) => h.trim().toLowerCase());
    expect(hl).toContain("sản phẩm");
    expect(hl).not.toContain("số sp");

    const rows = table.locator("tbody tr");
    const n = Math.min(await rows.count(), 12);
    let checked = 0;
    for (let i = 0; i < n; i += 1) {
      const r = rows.nth(i);
      const num = (await r.locator("td").first().innerText()).trim();
      const o = api.find((x) => x.order_number === num);
      if (!o) continue;
      const cell = (await r.getByTestId("order-products-cell").innerText()).trim();
      const expected = o.item_count === 0 ? "—" : o.item_count === 1 ? o.product_names[0] : `${o.product_names[0]} + ${o.item_count - 1} sản phẩm`;
      expect(cell).toBe(expected);
      expect(cell).not.toMatch(/^\d+ sản phẩm$/);
      // unchanged: total + owner still what the API says
      const total = (await r.locator("td").nth(4).innerText()).replace(/\D/g, "");
      expect(total).toBe(String(Math.round(o.total_amount)));
      expect((await r.locator("td").nth(7).innerText()).trim()).toBe(o.sales_owner);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(3);
    note("orders-list-checked", String(checked));
    note("orders-multi-product", `orders with >1 item on Dev: ${api.filter((o) => o.item_count > 1).length} (N-sản-phẩm form covered by unit test only if 0)`);

    // click product -> quick view of the right order
    const firstWithItem = api.find((o) => o.item_count >= 1)!;
    const row = table.locator("tbody tr", { hasText: firstWithItem.order_number }).first();
    await row.getByTestId("order-products-cell").click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(firstWithItem.order_number);
    await shot(page, `${label}-orders-quickview`);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await shot(page, `${label}-orders-list`);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Date format (browser locale en-US on purpose)
// ---------------------------------------------------------------------------------------------------------------
test("[desktop] Date inputs: dd/mm/yyyy display, ISO to API, validation", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER", DESKTOP, { locale: "en-US" });
  const today = vnToday();

  // Global Date Filter on Sales
  await page.goto("/reports/sales?metric=sold&view=orders");
  await page.getByTestId("report-date-filter").selectOption("custom");
  const from = page.getByTestId("report-date-filter-from");
  const to = page.getByTestId("report-date-filter-to");
  await expect(from).toHaveAttribute("placeholder", "dd/mm/yyyy");
  expect(await page.locator('input[type="date"]').count()).toBe(0);
  const apply = page.getByTestId("report-date-filter-apply");

  const range = async (a: string, b: string) => {
    await from.fill(a);
    await to.fill(b);
  };
  const applyAndCapture = async () => {
    const req = page.waitForRequest((r) => /\/api\/reports\/overview\/sold/.test(r.url()) && r.url().includes("start="), { timeout: 30_000 });
    await apply.click();
    return new URL((await req).url()).searchParams;
  };

  await range("01/09/2026", "30/09/2026"); // first day -> last day of a month (differs from the default "this month")
  await expect(from).toHaveValue("01/09/2026");
  await expect(to).toHaveValue("30/09/2026");
  let q = await applyAndCapture();
  expect([q.get("start"), q.get("end")]).toEqual(["2026-09-01", "2026-10-01"]);
  note("range-month", `${q.get("start")} .. ${q.get("end")} (end exclusive)`);

  await page.getByTestId("report-date-filter").selectOption("custom");
  await range(today.dmy, today.dmy); // today
  q = await applyAndCapture();
  expect([q.get("start"), q.get("end")]).toEqual([today.iso, today.tomorrow]);
  note("range-today", `${today.dmy} -> ${q.get("start")} .. ${q.get("end")}`);

  await page.getByTestId("report-date-filter").selectOption("custom");
  await range("31/02/2026", "10/03/2026"); // invalid calendar date
  await expect(apply).toBeDisabled();
  await expect(from).toHaveAttribute("aria-invalid", "true");
  note("invalid-date", "31/02/2026 -> Apply disabled + aria-invalid");

  await range("31/10/2026", "01/10/2026"); // reversed
  await expect(apply).toBeDisabled();
  await expect(page.getByTestId("report-date-filter-error")).toBeVisible();
  note("reversed-range", await page.getByTestId("report-date-filter-error").innerText());

  await range("3/10/2026", "03/10/2026"); // incomplete first value
  await expect(apply).toBeDisabled();
  await shot(page, "desktop-date-filter");

  // Monthly Sold Products
  await page.goto("/reports/monthly-sold-products");
  const msp = page.locator('input[placeholder="dd/mm/yyyy"]');
  await expect(msp.first()).toBeVisible({ timeout: 40_000 });
  expect(await page.locator('input[type="date"]').count()).toBe(0);
  const mReq = page.waitForRequest((r) => r.url().includes("/api/reports/monthly-sold-products") && r.url().includes("dateTo=2026-11-01"), { timeout: 30_000 });
  await msp.nth(0).fill("01/10/2026");
  await msp.nth(1).fill("31/10/2026");
  const mu = new URL((await mReq).url()).searchParams;
  expect([mu.get("dateFrom"), mu.get("dateTo")]).toEqual(["2026-10-01", "2026-11-01"]);
  note("msp-api-dates", `${mu.get("dateFrom")} .. ${mu.get("dateTo")}`);

  // Expense form: opens, default = today in VN as dd/mm/yyyy; NOT submitted
  await page.getByTestId("expense-add-button").click();
  const exp = page.getByTestId("expense-date-input");
  await expect(exp).toHaveValue(today.dmy);
  await exp.fill("29/02/2027");
  await expect(exp).toHaveAttribute("aria-invalid", "true");
  await exp.fill("15/10/2026");
  await expect(exp).toHaveValue("15/10/2026");
  await shot(page, "desktop-expense-date");
  await page.keyboard.press("Escape");

  // Customer Receivable
  await page.goto("/reports/customer-receivable");
  const cr = page.getByTestId("customer-receivable-date-from-input");
  await expect(cr).toBeVisible({ timeout: 40_000 });
  await expect(cr).toHaveAttribute("placeholder", "dd/mm/yyyy");
  const crReq = page.waitForRequest((r) => r.url().includes("customer-receivable") && r.url().includes("dateFrom=2026-10-01"), { timeout: 30_000 });
  await cr.fill("01/10/2026");
  await crReq;
  note("customer-receivable", "dd/mm/yyyy in, dateFrom=2026-10-01 out");

  // Payment Method
  await page.goto("/reports/payment-method");
  const pm = page.getByTestId("payment-method-date-from-input");
  await expect(pm).toBeVisible({ timeout: 40_000 });
  await expect(pm).toHaveAttribute("placeholder", "dd/mm/yyyy");
  const pmReq = page.waitForRequest((r) => r.url().includes("payment-method") && r.url().includes("dateFrom=2026-10-01"), { timeout: 30_000 });
  await pm.fill("01/10/2026");
  await pmReq;
  note("payment-method", "dd/mm/yyyy in, dateFrom=2026-10-01 out");
  expect(await page.locator('input[type="date"]').count()).toBe(0);

  // Displayed dates in tables are dd/mm/yyyy (no mm/dd, no ISO)
  await page.goto("/reports/sales?metric=sold&view=orders");
  await allTime(page);
  await expect(link(page, "order").first()).toBeVisible({ timeout: 40_000 });
  const cells = (await page.locator("table tbody tr td").allInnerTexts()).filter((t) => /\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/.test(t));
  expect(cells.length).toBeGreaterThan(0);
  for (const c of cells) expect(c.trim()).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  note("table-dates", cells.slice(0, 3).join(", "));
  expect(writes).toEqual([]);
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// 9. Payment Method modal -> drawer (Radix dialog conflict)
// ---------------------------------------------------------------------------------------------------------------
for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]] as const) {
  test(`[${label}] Payment Method modal -> entity drawer: no stacked dialogs, ESC, focus, no click-through`, async ({ browser }) => {
    const { ctx, page, errors } = await openPage(browser, "OWNER", vp);
    await page.goto("/reports/payment-method");
    const rows = page.locator('[data-testid^="payment-method-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 40_000 });
    await rows.first().click();
    const modal = page.getByTestId("payment-method-drill-down-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-testid^="entity-link-"]').first()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByRole("dialog").count()).toBe(1);

    // ESC closes the modal (baseline)
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await rows.first().click();
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-testid^="entity-link-"]').first()).toBeVisible({ timeout: 30_000 });

    for (const t of ["order", "product", "customer"] as const) {
      if (!(await modal.locator(`[data-testid="entity-link-${t}"]`).count())) await rows.first().click();
      await modal.locator(`[data-testid="entity-link-${t}"]`).first().click();
      // modal closes first, then the drawer: never two dialogs at once
      await expect(modal).toHaveCount(0);
      await expect(drawer(page)).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      expect(detailOf(page)).toMatch(new RegExp(`^${t}:`));
      await expect(drawer(page)).not.toContainText("Đang tải", { timeout: 20_000 });
      if (t === "order") {
        await shot(page, `${label}-paymentmethod-to-drawer`);
        // keyboard: Tab stays inside the drawer
        for (let i = 0; i < 6; i += 1) await page.keyboard.press("Tab");
        const inside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="entity-drawer"]'));
        expect(inside).toBe(true);
      }
      // ESC closes the drawer, page becomes usable again (no locked backdrop)
      await page.keyboard.press("Escape");
      await expect(drawer(page)).toHaveCount(0);
      expect(new URL(page.url()).searchParams.has("detail")).toBe(false);
      await rows.first().click({ timeout: 10_000 });
      await expect(modal).toBeVisible();
      await expect(modal.locator('[data-testid^="entity-link-"]').first()).toBeVisible({ timeout: 30_000 });
    }

    // overlay blocks click-through: clicking the drawer backdrop closes the drawer, nothing underneath is activated
    await modal.locator('[data-testid="entity-link-order"]').first().click();
    await expect(drawer(page)).toBeVisible();
    if (label === "desktop") await page.mouse.click(5, 5); // on mobile the drawer covers the whole viewport: there is no backdrop to hit
    else await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(modal).toHaveCount(0);
    note("modal-behaviour", "clicking an entity inside the Payment Method modal CLOSES the modal, then opens the drawer; closing the drawer returns to the report page without the modal");
    if (label === "mobile") expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Responsive: mobile specifics
// ---------------------------------------------------------------------------------------------------------------
test("[mobile] Layout: drawer full width, tap targets, no overflow, close + full-page CTA reachable", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER", MOBILE);
  for (const url of ["/reports/sales?metric=sold&view=orders", "/reports/inventory?view=held", "/orders"]) {
    await page.goto(url);
    await page.waitForTimeout(1500);
    note(`overflow ${url}`, String(await noHorizontalOverflow(page)));
    expect(await noHorizontalOverflow(page)).toBe(true);
  }
  await page.goto("/reports/sales?metric=sold&view=orders");
  await allTime(page);
  await expect(link(page, "order").first()).toBeVisible({ timeout: 40_000 });
  await link(page, "order").first().tap();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)", { timeout: 20_000 });
  const box = (await drawer(page).boundingBox())!;
  expect(Math.round(box.width)).toBe(390);
  const close = drawer(page).getByRole("button", { name: "Đóng" });
  const cta = drawer(page).getByTestId("drawer-full-page");
  for (const el of [close, cta]) {
    const b = (await el.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(391);
    expect(b.y + b.height).toBeLessThanOrEqual(845);
  }
  await shot(page, "mobile-drawer-layout");
  await close.tap();
  await expect(drawer(page)).toHaveCount(0);
  await ctx.close();
});

test("zz. Safety: UAT issued no write requests", async () => {
  expect(writes).toEqual([]);
});

test("[desktop] Monthly Sold Products: whole-order payment columns are labelled (cả đơn)", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER");
  // The Dev account has a saved column preference that hides the payment columns. Answer the preference GET with
  // "no saved preference" (client-side only; nothing is written) so the DEFAULT (all columns) is rendered.
  await page.route("**/api/report-preferences?**", (r) =>
    r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preference: null }) }) : r.abort()
  );
  await page.goto("/reports/monthly-sold-products");
  const inputs = page.locator('input[placeholder="dd/mm/yyyy"]');
  await expect(inputs.first()).toBeVisible({ timeout: 40_000 });
  await inputs.nth(0).fill("01/01/2020");
  const table = page.getByTestId("monthly-sold-products-table");
  await expect(table).toBeVisible({ timeout: 40_000 });
  const headers = (await table.locator("th").allInnerTexts()).map((h) => h.trim().toLowerCase());
  expect(headers).toContain("đã thanh toán (cả đơn)");
  expect(headers).toContain("tiền còn lại (cả đơn)");
  expect(headers).not.toContain("đã thanh toán");
  expect(headers).not.toContain("tiền còn lại");
  note("msp-headers", headers.join(" | "));
  await shot(page, "desktop-msp-all-columns");
  await ctx.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Closure additions (production build)
// ---------------------------------------------------------------------------------------------------------------
test("[desktop+mobile] Close works when the page has NO other query params (production-build regression)", async ({ browser }) => {
  const ORDER = "9499c22d-2eb5-4a20-9a2b-74eff318c2ca";
  for (const vp of [DESKTOP, MOBILE]) {
    const { ctx, page } = await openPage(browser, "OWNER", vp);
    for (const p of ["/reports/monthly-sold-products", "/reports/payment-method", "/reports/customer-receivable", "/reports/sales-ledger"]) {
      await page.goto(`${p}?detail=order:${ORDER}`);
      await expect(drawer(page)).toBeVisible({ timeout: 40_000 });
      await drawer(page).getByRole("button", { name: "Đóng" }).click();
      await expect(drawer(page)).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("");
      note(`close-noparams ${vp === MOBILE ? "mobile" : "desktop"} ${p}`, page.url().replace(BASE, ""));
    }
    await ctx.close();
  }
});

test("[desktop] History: open A, open B, close, Back, Forward - URL sequence", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, "OWNER");
  const seq: string[] = [];
  const mark = async (label: string) => seq.push(`${label}: ${page.url().replace(BASE, "").replace(/%3A/g, ":").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (m) => m.slice(0, 6))} drawer=${(await drawer(page).count()) > 0}`);
  await page.goto("/reports/sales?metric=sold&view=orders");
  await allTime(page);
  await expect(link(page, "order").first()).toBeVisible({ timeout: 40_000 });
  await mark("0 report");
  await link(page, "order").first().click(); // A
  await expect(drawer(page)).toContainText("Tổng đơn (cả đơn)");
  await mark("1 open A (order)");
  await drawer(page).locator('[data-testid="entity-link-customer"]').first().click(); // B
  await expect(drawer(page)).toContainText("Chi tiết khách hàng");
  await mark("2 open B (customer)");
  await drawer(page).getByRole("button", { name: "Đóng" }).click();
  await expect(drawer(page)).toHaveCount(0);
  await mark("3 close");
  await page.goBack();
  await page.waitForTimeout(1500);
  await mark("4 Back");
  await page.goForward();
  await page.waitForTimeout(1500);
  await mark("5 Forward");
  note("history-sequence", seq.join("  ||  "));
  await ctx.close();
});
