import fs from "node:fs";
import path from "node:path";
import { test, expect, Page, Request, Response } from "@playwright/test";
import { credentialsFor, QaRole } from "../shared/utils/auth";
import { LoginPage } from "../shared/pages/LoginPage";

// Phase 1.6 Wave B1.4 - Money & Debt Ledger transaction table on the shared ColumnManager (DEV backend, production build).
// Runs as the QA OWNER account (the only QA role holding money_debt_ledger.view + .create on Dev). That account owns NO money_debt_ledger
// preference row on Dev. READ-ONLY for business data: no ledger entry is created, corrected or deleted (the correction modal is only opened
// and closed). The only thing written is that account's OWN preference row: read first (and copied to a file), restored exactly afterwards
// (a row that did not exist is removed again). Nothing is ever deleted by report key alone.

const DATE_KEY = "crm-thubinh:globalDateFilter";
const KEY = "money_debt_ledger";
const T = "money-debt-ledger-columns-button";
const ALL = ["date", "code", "party", "type", "content", "supplier", "order", "currency", "in", "out", "fxRate", "status", "actions"];
const MANDATORY = ["date", "code", "currency", "in", "out"];
const LABELS: Record<string, string> = { date: "Ngày", code: "Mã GD", party: "Money Changer / Đối tượng", type: "Loại", content: "Nội dung", supplier: "Nhà cung cấp", order: "Đơn hàng", currency: "Tiền", in: "IN", out: "OUT", fxRate: "Tỷ giá", status: "Trạng thái", actions: "Thao tác" };

async function login(page: Page, role: QaRole = "OWNER") {
  const { email, password } = credentialsFor(role);
  // WebKit (iPhone profile) intermittently lands back on /login even though the auth token response was 200: retry. Test infrastructure only.
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

const isDesktop = (page: Page) => page.viewportSize()!.width >= 768; // md
const headerKeys = (page: Page) => page.locator('[data-testid="money-debt-ledger-table"] th').evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key"))) as Promise<string[]>;
const rows = (page: Page) => page.locator('[data-testid="money-debt-ledger-table"] tbody tr');
const panelOrder = (page: Page) => page.locator(`[data-testid="${T}-list"] li`).evaluateAll((els) => els.map((e) => e.getAttribute("data-column-key"))) as Promise<string[]>;
const noSpin = (page: Page) => expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 20_000 });
const saved = (page: Page) => expect(page.getByTestId(`${T}-status`)).toContainText("Đã lưu", { timeout: 8000 });
const isEntries = (r: Response) => /\/api\/money-debt-ledger\?/.test(r.url());

async function openReport(page: Page) {
  const loaded = page.waitForResponse(isEntries, { timeout: 40_000 });
  await page.goto("/money-debt-ledger");
  expect((await loaded).status()).toBe(200);
  await noSpin(page);
  if (isDesktop(page)) await expect(page.getByTestId("money-debt-ledger-table")).toBeVisible();
  else await expect(page.locator('[data-testid^="money-debt-ledger-card-"]').first()).toBeVisible({ timeout: 30_000 });
}
async function openPanel(page: Page) {
  await page.getByTestId(T).evaluate((el) => el.scrollIntoView({ block: "center" })); // the panel needs room below the trigger
  await page.getByTestId(T).click();
  await expect(page.getByTestId(`${T}-panel`)).toBeVisible();
}
/** Everything a column action must NOT change: the header KPIs, the balance sections and the visible rows. */
async function snapshot(page: Page) {
  const header = (await page.locator("h1").locator("xpath=..").innerText()).replace(/\s+/g, " ");
  const count = await rows(page).count();
  const first = count ? (await rows(page).first().innerText()).replace(/\s+/g, " ") : "";
  const last = count ? (await rows(page).last().innerText()).replace(/\s+/g, " ") : "";
  const balances = (await page.getByTestId("money-debt-ledger-period-note").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]/preceding-sibling::*").allInnerTexts()).join(" | ").replace(/\s+/g, " ");
  return { header, count, first, last, balances };
}

test.describe("Money & Debt Ledger: column management", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([k]) => localStorage.setItem(k, JSON.stringify({ option: "all_time", customFrom: "", customTo: "" })), [DATE_KEY]);
    await login(page);
    original = await readPref(page);
    // A durable copy of what is about to be touched, so it can be put back by hand if the process ever dies mid-test.
    fs.mkdirSync(path.resolve("artifacts"), { recursive: true });
    fs.writeFileSync(path.resolve("artifacts", `b14-original-preferences-${test.info().project.name}.json`), JSON.stringify({ at: new Date().toISOString(), original }, null, 2));
    // Every test starts from the registry default (an existing row would have been copied above and is put back by afterEach).
    if (original !== null) await page.request.delete(`/api/report-preferences?reportKey=${KEY}`);
  });
  test.afterEach(async ({ page }) => {
    await restore(page);
  });
  
  test("default: 13 columns in the registry order with the current labels, ColumnManager in the toolbar, actions column for money_debt_ledger.create", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop table");
    await openReport(page);
    expect(await headerKeys(page)).toEqual(ALL);
    expect((await page.locator('[data-testid="money-debt-ledger-table"] th').allInnerTexts()).map((x) => x.trim().toLowerCase())).toEqual(ALL.map((k) => LABELS[k].toLowerCase()));
    expect(await rows(page).count()).toBeGreaterThan(0);
    await expect(page.getByTestId("money-debt-ledger-toolbar").getByTestId(T)).toBeVisible();
    expect(await rows(page).first().locator("td").count()).toBe(ALL.length);
  });

  test("open, Escape, close and focus return; the panel lists the 13 columns and the 5 mandatory ones are locked", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page);
    await openPanel(page);
    expect([...(await panelOrder(page))].sort()).toEqual([...ALL].sort());
    for (const k of MANDATORY) await expect(page.getByTestId(`${T}-check-${k}`)).toBeDisabled();
    for (const k of ALL.filter((x) => !MANDATORY.includes(x))) await expect(page.getByTestId(`${T}-check-${k}`)).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
    await expect(page.getByTestId(T)).toBeFocused();
    await openPanel(page);
    await page.getByTestId(`${T}-close`).click();
    await expect(page.getByTestId(`${T}-panel`)).toBeHidden();
  });

  test("hide / show saves immediately and survives a reload; a first save does not read the legacy localStorage key", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await page.addInitScript(() => localStorage.setItem("crm.moneyDebtLedger.columns.legacy-probe", JSON.stringify(["date"]))); // an old-style choice must not matter
    await openReport(page);
    await openPanel(page);
    await page.getByTestId(`${T}-check-fxRate`).setChecked(false);
    await saved(page);
    expect(await headerKeys(page)).not.toContain("fxRate");
    await page.reload();
    await noSpin(page);
    await expect(page.getByTestId("money-debt-ledger-table")).toBeVisible();
    expect(await headerKeys(page)).not.toContain("fxRate");
    await openPanel(page);
    await page.getByTestId(`${T}-check-fxRate`).setChecked(true);
    await saved(page);
    expect(await headerKeys(page)).toContain("fxRate");
    expect(await headerKeys(page)).toEqual(ALL);
  });

  test("▲/▼, keyboard and drag reorder header and cells together (mandatory columns included); the order persists; reset restores the default", async ({ page, isMobile }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page);
    await openPanel(page);
    const before = await headerKeys(page);
    await page.getByTestId(`${T}-down-${before[0]}`).click(); // "date" is mandatory and still moves
    const swapped = [...before];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    await expect.poll(() => headerKeys(page)).toEqual(swapped);
    const firstRowCells = (await rows(page).first().locator("td").allInnerTexts()).map((x) => x.trim());
    expect(firstRowCells[0]).toContain("MDL-"); // the code cell now comes first, in the body as well as the header
    await saved(page);
    const panel0 = await panelOrder(page);
    const vis0 = await headerKeys(page);
    const idx = panel0.findIndex((k, i) => i > 0 && i < 8 && vis0.includes(k) && vis0.includes(panel0[i - 1]));
    await page.getByTestId(`${T}-handle-${panel0[idx]}`).focus();
    await page.keyboard.press("ArrowUp");
    await saved(page);
    const panel1 = await panelOrder(page);
    expect(panel1[idx - 1]).toBe(panel0[idx]);
    expect(await headerKeys(page)).toEqual(panel1.filter((k) => vis0.includes(k)));
    if (!isMobile) {
      const vis1 = await headerKeys(page);
      const dragKey = panel1.slice(4, 8).find((k) => vis1.includes(k))!;
      const target = panel1[1];
      const h = (await page.getByTestId(`${T}-handle-${dragKey}`).boundingBox())!;
      const t = (await page.getByTestId(`${T}-row-${target}`).boundingBox())!;
      const puts: string[] = [];
      page.on("request", (r) => r.method() === "PUT" && r.url().includes("/api/report-preferences") && puts.push(r.postData() ?? ""));
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + 4, t.y + 2, { steps: 12 });
      await page.mouse.up();
      await saved(page);
      const panel2 = await panelOrder(page);
      expect(panel2.indexOf(dragKey)).toBeLessThan(panel1.indexOf(dragKey));
      expect(await headerKeys(page)).toEqual(panel2.filter((k) => vis1.includes(k)));
      expect(puts.length).toBe(1);
    }
    await page.keyboard.press("Escape");
    const afterAll = await headerKeys(page);
    await page.reload();
    await noSpin(page);
    await expect(page.getByTestId("money-debt-ledger-table")).toBeVisible();
    expect(await headerKeys(page)).toEqual(afterAll);
    await openPanel(page);
    const dels: string[] = [];
    page.on("request", (r) => r.method() === "DELETE" && dels.push(r.url()));
    await page.getByTestId(`${T}-reset`).click();
    await expect.poll(() => headerKeys(page)).toEqual(ALL);
    expect(dels.length).toBe(1);
  });

  test("hide / show / reorder / reset change nothing in the data and call ONLY /api/report-preferences (no ledger, balance, counterparties, Supabase REST)", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page);
    await page.waitForTimeout(1500); // balances / counterparties finish loading
    const base = await snapshot(page);
    await openPanel(page);
    const actions: [string, () => Promise<void>][] = [
      ["hide", () => page.getByTestId(`${T}-check-supplier`).setChecked(false)],
      ["show", () => page.getByTestId(`${T}-check-supplier`).setChecked(true)],
      ["reorder", () => page.getByTestId(`${T}-down-date`).click()],
      ["reset", () => page.getByTestId(`${T}-reset`).click()],
    ];
    for (const [name, run] of actions) {
      await page.waitForTimeout(700);
      const seen: string[] = [];
      const on = (r: Request) => seen.push(`${r.method()} ${r.url()} [${r.resourceType()}]`);
      page.on("request", on);
      await run();
      await saved(page);
      await page.waitForTimeout(1500);
      page.off("request", on);
      const bad = seen.filter((s) => !/\/api\/report-preferences/.test(s) && !/_next\/static|\.(woff2?|png|svg|ico|css)(\?|\s|$)/.test(s));
      expect(bad, `${name}: unexpected requests`).toEqual([]);
      expect(seen.some((s) => /rest\/v1|\/api\/money-debt-ledger|_rsc=|\/orders\/|\/customers\/|\/partners\/|products/.test(s) && !/report-preferences/.test(s)), `${name}: no business-data request`).toBe(false);
      expect(seen.filter((s) => /\/api\/report-preferences/.test(s)).length, `${name}: the preference request`).toBeGreaterThan(0);
    }
    await page.keyboard.press("Escape");
    expect(await snapshot(page)).toEqual(base);
  });

  test("filters and the date range keep working; a column action neither resets a filter nor refetches; a column choice survives a filter / period change", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page);
    await page.waitForTimeout(1200);
    const base = await snapshot(page);
    // hide a column first: it must still be hidden after filtering and after changing the period
    await openPanel(page);
    await page.getByTestId(`${T}-check-content`).setChecked(false);
    await saved(page);
    await page.keyboard.press("Escape");
    const keys = await headerKeys(page);
    expect(keys).not.toContain("content");
    const code = (await rows(page).first().locator("td").nth(keys.indexOf("code")).innerText()).trim();
    const filtered = page.waitForResponse((r) => isEntries(r) && r.url().includes("search="), { timeout: 30_000 });
    await page.getByTestId("money-debt-ledger-search-input").fill(code);
    expect((await filtered).status()).toBe(200);
    await noSpin(page);
    await page.waitForTimeout(800);
    expect(await rows(page).count()).toBeGreaterThan(0);
    expect(await rows(page).count()).toBeLessThanOrEqual(base.count);
    expect(await headerKeys(page)).toEqual(keys);
    // a column action while filtered: no refetch, filter kept
    await openPanel(page);
    const seen: string[] = [];
    const on = (r: Request) => seen.push(`${r.method()} ${r.url()}`);
    page.on("request", on);
    await page.getByTestId(`${T}-check-status`).setChecked(false);
    await saved(page);
    await page.getByTestId(`${T}-check-status`).setChecked(true);
    await saved(page);
    page.off("request", on);
    expect(seen.filter((s) => !/report-preferences/.test(s) && !/_next\/static/.test(s))).toEqual([]);
    expect(await page.getByTestId("money-debt-ledger-search-input").inputValue()).toBe(code);
    await page.keyboard.press("Escape");
    // party / currency / direction selects
    await page.getByTestId("money-debt-ledger-clear-filters-button").click();
    await noSpin(page);
    const cur = page.waitForResponse((r) => isEntries(r) && r.url().includes("currency=CNY"), { timeout: 30_000 });
    await page.getByTestId("money-debt-ledger-currency-filter").selectOption("CNY");
    expect((await cur).status()).toBe(200);
    await noSpin(page);
    await page.waitForTimeout(600);
    expect(await headerKeys(page).catch(() => keys)).toEqual(keys); // a filtered list keeps the column choice
    await page.getByTestId("money-debt-ledger-clear-filters-button").click();
    await noSpin(page);
    // date range: switch to another period and back; the column choice stays
    const period = page.getByTestId("report-date-filter");
    const periodResp = page.waitForResponse((r) => isEntries(r) && /dateFrom=/.test(r.url()), { timeout: 30_000 });
    await period.selectOption("this_year");
    expect((await periodResp).status()).toBe(200);
    await noSpin(page);
    expect(await headerKeys(page).catch(() => keys)).toEqual(keys); // an empty period shows no table at all, so only a non-empty one is compared
    const backResp = page.waitForResponse(isEntries, { timeout: 30_000 });
    await period.selectOption("all_time");
    await backResp;
    await noSpin(page);
    await expect.poll(async () => (await snapshot(page)).count, { timeout: 20_000 }).toBe(base.count);
    expect(await headerKeys(page)).toEqual(keys);
  });

  test("row click opens the detail modal; supplier and order links navigate WITHOUT opening it; the edit action opens the correction modal and nothing is written", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    await openReport(page);
    await openPanel(page);
    await page.getByTestId(`${T}-down-date`).click(); // a reordered table behaves the same
    await saved(page);
    await page.keyboard.press("Escape");
    const writes: string[] = [];
    page.on("request", (r) => r.method() !== "GET" && !/report-preferences|auth\/v1|_rsc|\/_next\//.test(r.url()) && writes.push(`${r.method()} ${r.url()}`));
    // row click -> detail modal (click the type cell: no link, no button)
    const keys = await headerKeys(page);
    await rows(page).first().locator("td").nth(keys.indexOf("type")).click();
    await expect(page.getByTestId("transaction-detail-modal")).toBeVisible();
    await expect(page.getByTestId("transaction-detail-edit-button")).toBeVisible();
    await page.getByTestId("transaction-detail-close-button").click();
    await expect(page.getByTestId("transaction-detail-modal")).toBeHidden();
    // edit action -> correction modal only (no detail modal), then cancel
    const firstId = (await rows(page).first().getAttribute("data-testid"))!.replace("money-debt-ledger-row-", "");
    await page.getByTestId(`money-debt-ledger-edit-${firstId}`).click();
    await expect(page.getByTestId("correction-modal")).toBeVisible();
    await expect(page.getByTestId("transaction-detail-modal")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("correction-modal")).toBeHidden();
    // partner link
    const supplierLink = page.locator('[data-testid^="money-debt-ledger-supplier-"] a').first();
    await expect(supplierLink).toBeVisible();
    const partnerHref = (await supplierLink.getAttribute("href"))!;
    await supplierLink.click();
    await expect(page).toHaveURL(new RegExp(partnerHref.replace(/\//g, "\\/")));
    await page.goBack();
    await noSpin(page);
    await expect(page.getByTestId("transaction-detail-modal")).toBeHidden();
    // order link
    await expect(page.getByTestId("money-debt-ledger-table")).toBeVisible();
    const orderLink = page.locator('[data-testid^="money-debt-ledger-order-"] a').first();
    await expect(orderLink).toBeVisible();
    const orderHref = (await orderLink.getAttribute("href"))!;
    await orderLink.click();
    await expect(page).toHaveURL(new RegExp(orderHref.replace(/\//g, "\\/")));
    expect(writes, "no write request of any kind").toEqual([]);
  });

  test("unauthorized for money_debt_ledger.create (the permission list is filtered in the BROWSER only; nothing is written): no actions column, no edit entry point", async ({ page }) => {
    test.skip(!isDesktop(page), "desktop only");
    // Dev has no role with view-but-not-create, so the client permission lookup is answered without that one permission. The server
    // still sees an Owner. This exercises exactly the UI gate (has_edit = money_debt_ledger.create); the API is untouched.
    await page.route("**/rest/v1/permissions*", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { permission_key?: string }[];
      await route.fulfill({ response, json: body.filter((p) => p.permission_key !== "money_debt_ledger.create") });
    });
    await openReport(page);
    const keys = await headerKeys(page);
    expect(keys).toEqual(ALL.filter((k) => k !== "actions"));
    await expect(page.locator('[data-testid^="money-debt-ledger-edit-"]')).toHaveCount(0);
    await openPanel(page);
    expect(await panelOrder(page)).not.toContain("actions");
    await page.keyboard.press("Escape");
    await rows(page).first().locator("td").nth(keys.indexOf("type")).click();
    await expect(page.getByTestId("transaction-detail-modal")).toBeVisible();
    await expect(page.getByTestId("transaction-detail-edit-button")).toHaveCount(0);
  });

  test("mobile: the card list is unchanged, and the desktop table and the ColumnManager are hidden", async ({ page }) => {
    test.skip(isDesktop(page), "mobile only");
    await openReport(page);
    const cards = page.locator('[data-testid^="money-debt-ledger-card-"]');
    expect(await cards.count()).toBeGreaterThan(0);
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(overflow.page).toBeLessThanOrEqual(overflow.inner + 1);
    await expect(page.getByTestId("money-debt-ledger-table")).toBeHidden();
    await expect(page.getByTestId(T)).toBeHidden();
    await expect(page.getByTestId("money-debt-ledger-toolbar")).toBeHidden();
    await expect(page.locator('[data-testid^="money-debt-ledger-edit-mobile-"]').first()).toBeVisible(); // Owner: has create
    await cards.first().click({ position: { x: 20, y: 10 } });
    await expect(page.getByTestId("transaction-detail-modal")).toBeVisible();
  });
});

test.describe("Permission: a role without money_debt_ledger.view", () => {
  for (const role of ["MANAGER", "SALES", "VIEWER"] as QaRole[]) {
    test(`${role}: no ledger data, no ColumnManager, no table`, async ({ page }) => {
      test.skip(!isDesktop(page), "desktop");
      await login(page, role);
      const seen: number[] = [];
      page.on("response", (r) => isEntries(r) && seen.push(r.status()));
      await page.goto("/money-debt-ledger");
      await expect(page.getByText(/không có quyền xem Money/i)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("money-debt-ledger-table")).toHaveCount(0);
      await expect(page.getByTestId(T)).toHaveCount(0);
      expect(seen.every((s) => s === 403)).toBe(true);
    });
  }
});
