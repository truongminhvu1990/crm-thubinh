import { test, expect as baseExpect, Browser, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { credentialsFor } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

/**
 * Phase 1.6 Wave A closure - retest of the two Dev-mode flakes, against a PRODUCTION BUILD pointed at Dev.
 * READ-ONLY (navigation + GET only).
 *  1. mobile 390 Inventory: open drawer, rapid Back, Back, re-open - 10x
 *  2. mobile 390 Monthly Sold Products: change period, open Product/Customer/Order drawer, reload - 10x
 */
const expect = baseExpect.configure({ timeout: 20_000 });
const BASE = process.env.QA_BASE_URL!;
const OUT = path.resolve("artifacts/uat-phase-1-6");
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, ".state-flake.json");
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const RUNS = Number(process.env.FLAKE_RUNS ?? 10);

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
  expect((await token).ok()).toBe(true);
  // Production build: the shell's <Link> prefetches of /dashboard were answered 307->/login before sign-in, and the
  // client router replays that cached redirect for ~30 s. A full navigation sidesteps the cache (test-side only).
  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

interface Net {
  url: string;
  status: number;
  ms: number;
  contentType: string;
}
async function instrument(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: BASE, storageState: STATE, locale: "en-US", ...MOBILE });
  const page = await ctx.newPage();
  const net: Net[] = [];
  const errors: string[] = [];
  const started = new Map<string, number>();
  page.on("request", (r) => started.set(r.url() + "#" + r.method(), Date.now()));
  page.on("response", (r) => {
    if (!r.url().includes("/api/")) return;
    const t0 = started.get(r.url() + "#" + r.request().method()) ?? Date.now();
    net.push({ url: r.url().replace(BASE, "").slice(0, 110), status: r.status(), ms: Date.now() - t0, contentType: r.headers()["content-type"] ?? "" });
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text().slice(0, 160));
  });
  return { ctx, page, net, errors };
}
const drawer = (page: Page) => page.getByTestId("entity-drawer");
/** Waits until the drawer shows real content (not "Đang tải…") and returns how long that took. */
async function loaded(page: Page, title: string): Promise<{ ms: number; stuck: boolean }> {
  const t0 = Date.now();
  try {
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByRole("dialog").locator("h2")).toHaveText(title); // the NEW entity has committed (not the previous panel)
    await expect(page.getByTestId("drawer-loading")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("drawer-error")).toHaveCount(0, { timeout: 1_000 });
    return { ms: Date.now() - t0, stuck: false };
  } catch {
    return { ms: Date.now() - t0, stuck: (await page.getByTestId("drawer-loading").count()) > 0 };
  }
}
const summarize = (net: Net[]) => ({
  statuses: net.reduce<Record<string, number>>((a, n) => ((a[String(n.status)] = (a[String(n.status)] ?? 0) + 1), a), {}),
  maxMs: Math.max(0, ...net.map((n) => n.ms)),
  detailMaxMs: Math.max(0, ...net.filter((n) => n.url.includes("/api/reports/detail/")).map((n) => n.ms)),
  html: net.filter((n) => n.contentType.includes("html")).map((n) => n.url),
  bad: net.filter((n) => n.status >= 400).map((n) => `${n.status} ${n.url}`),
});

const results: Record<string, unknown[]> = { inventory: [], msp: [] };
test.afterAll(() => fs.writeFileSync(path.join(OUT, "flake-results.json"), JSON.stringify(results, null, 1)));

test.describe.configure({ timeout: 900_000 });

test(`[mobile] Inventory drawer: open, rapid Back/Back, re-open x${RUNS}`, async ({ browser }) => {
  const probe = await instrument(browser);
  const held = ((await (await probe.page.request.get("/api/reports/overview/held-inventory", { timeout: 60_000 })).json()).rows as {
    holding_order: { order_number: string } | null;
  }[]).find((r) => r.holding_order)!;
  await probe.ctx.close();

  for (let i = 1; i <= RUNS; i += 1) {
    const { ctx, page, net, errors } = await instrument(browser);
    const run: Record<string, unknown> = { run: i };
    let pass = true;
    try {
      await page.goto("/reports/inventory?view=held");
      const row = page.locator("tr", { hasText: held.holding_order!.order_number }).first();
      await expect(row).toBeVisible();
      await row.locator('[data-testid="entity-link-inventory"]').first().click(); // A: inventory
      run.openInventory = await loaded(page, "Chi tiết tồn kho");
      await drawer(page).getByTestId("drawer-holding-order").locator('[data-testid="entity-link-order"]').click(); // B: order
      run.openOrder = await loaded(page, "Chi tiết đơn hàng");
      await drawer(page).locator('[data-testid="entity-link-customer"]').first().click(); // C: customer
      run.openCustomer = await loaded(page, "Chi tiết khách hàng");
      const urlSeq = [page.url().split("detail=")[1]];
      await page.goBack(); // rapid: no wait between the two Backs (the flaky condition)
      await page.goBack();
      run.afterBackBack = await loaded(page, "Chi tiết tồn kho");
      urlSeq.push(page.url().split("detail=")[1]);
      await expect(drawer(page)).toContainText("Chi tiết tồn kho");
      run.urlSeq = urlSeq.map((u) => (u ?? "").slice(0, 20));
      await drawer(page).getByRole("button", { name: "Đóng" }).click();
      await expect(drawer(page)).toHaveCount(0);
      await row.locator('[data-testid="entity-link-inventory"]').first().click(); // re-open
      run.reopen = await loaded(page, "Chi tiết tồn kho");
      for (const k of ["openInventory", "openOrder", "openCustomer", "afterBackBack", "reopen"]) if ((run[k] as { stuck: boolean }).stuck) pass = false;
    } catch (e) {
      pass = false;
      run.exception = String(e).slice(0, 200);
    }
    const s = summarize(net);
    run.net = s;
    run.errors = errors;
    run.pass = pass && s.html.length === 0 && s.bad.length === 0 && errors.length === 0;
    results.inventory.push(run);
    await ctx.close();
  }
  const failed = results.inventory.filter((r) => !(r as { pass: boolean }).pass);
  expect(failed, JSON.stringify(failed).slice(0, 1500)).toEqual([]);
});

test(`[mobile] Monthly Sold Products: change period, open drawers, reload x${RUNS}`, async ({ browser }) => {
  for (let i = 1; i <= RUNS; i += 1) {
    const { ctx, page, net, errors } = await instrument(browser);
    const run: Record<string, unknown> = { run: i };
    let pass = true;
    try {
      await page.goto("/reports/monthly-sold-products");
      const inputs = page.locator('input[placeholder="dd/mm/yyyy"]');
      await expect(inputs.first()).toBeVisible();
      // change the period (alternate two different starts so the filter really changes)
      const from = i % 2 ? "01/01/2020" : "01/08/2026";
      const req = page.waitForResponse((r) => r.url().includes("/api/reports/monthly-sold-products") && r.url().includes(`dateFrom=${from.split("/").reverse().join("-")}`), { timeout: 30_000 });
      await inputs.nth(0).fill(from);
      const resp = await req;
      run.periodResponse = { status: resp.status(), contentType: resp.headers()["content-type"] };
      const table = page.getByTestId("monthly-sold-products-table");
      await expect(table).toBeVisible();
      const kinds = ["product", "customer", "order"] as const;
      for (const k of kinds) {
        const l = table.locator(`[data-testid="entity-link-${k}"]`).first();
        await expect(l).toBeVisible();
        await l.click();
        const r = await loaded(page, k === "product" ? "Chi tiết sản phẩm" : k === "customer" ? "Chi tiết khách hàng" : "Chi tiết đơn hàng");
        run[`open_${k}`] = r;
        if (r.stuck) pass = false;
        if (k === "order") {
          const url = page.url();
          await page.reload();
          const rr = await loaded(page, "Chi tiết đơn hàng");
          run.reload = { ...rr, sameUrl: page.url() === url };
          if (rr.stuck || page.url() !== url) pass = false;
        }
        await drawer(page).getByRole("button", { name: "Đóng" }).click();
        await expect(drawer(page)).toHaveCount(0);
      }
    } catch (e) {
      pass = false;
      run.exception = String(e).slice(0, 200);
    }
    const s = summarize(net);
    run.net = s;
    run.errors = errors;
    run.pass = pass && s.html.length === 0 && s.bad.length === 0 && errors.length === 0;
    results.msp.push(run);
    await ctx.close();
  }
  const failed = results.msp.filter((r) => !(r as { pass: boolean }).pass);
  expect(failed, JSON.stringify(failed).slice(0, 1500)).toEqual([]);
});
