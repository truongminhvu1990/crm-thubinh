import type { Page } from "@playwright/test";
import { test, expect } from "../shared/fixtures";
import { ProductPage } from "../shared/pages";
import {
  credentialsFor,
  waitForLoading,
  qaProductCode,
  qaProductName,
  createTestProduct,
  getProductByCode,
  getProductById,
  deleteProductRow,
} from "../shared/utils";

/**
 * Ni-Chột-Dày (PO spec 2026-10-04) - Vòng/Nhẫn + Available require all three
 * values, entered in ONE text input ("54.5-9.4-6.6"), stored as three numeric
 * columns. Runs on Chromium by default; QA_CROSS_BROWSER=1 adds Firefox and
 * WebKit (the engines that mangled the old type="number" field differently).
 *
 * Vòng products are seeded straight into the DB (Dev master data has no
 * "Vòng" category row to pick in the create modal, but the edit modal always
 * offers the product's own stored category) - Nhẫn is created via the UI.
 */
const SAMPLES: [string, [number, number, number]][] = [
  ["54-10-10", [54, 10, 10]],
  ["54.5-9.4-6.6", [54.5, 9.4, 6.6]],
  ["55-5.1-5.2", [55, 5.1, 5.2]],
  ["54.5-9-6", [54.5, 9, 6]],
];

const dimensionInput = (page: Page) => page.locator("#product-dimension");

/**
 * Session-injection login (same QA_OWNER credentials, same Supabase Auth
 * password grant as the UI form). The shared loginAsOwner() drives the login
 * form and then waits for router.push("/dashboard"); against a local
 * `next start` that push is served from the client router cache's earlier
 * prefetched 307 (/dashboard -> /login) and never lands, so the form flow
 * can't be used here. The cookie format is @supabase/ssr's
 * ("base64-" + base64url(session JSON)), which proxy.ts validates with
 * auth.getUser() exactly as for a real login.
 */
async function loginAsOwner(page: Page) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { email, password } = credentialsFor("OWNER");
  const res = await page.request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anon },
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const session = await res.json();
  const ref = new URL(url).hostname.split(".")[0];
  const base = new URL(process.env.QA_BASE_URL || "http://localhost:3000");
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      domain: base.hostname,
      path: "/",
    },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  // Same reason as the shared helper: let the dashboard's own stats fetch settle
  // before navigating away, or the aborted fetch shows up as a console error.
  await waitForLoading(page);
}

/**
 * Clicks "Lưu" on the Products LIST page and resolves only after the
 * post-save list refresh has fully settled.
 *
 * app/products/page.tsx's performSaveProduct() closes the modal first and
 * then `await loadProducts()` (GET /api/products). The dialog turning hidden
 * therefore does NOT mean the save flow is finished: navigating away right
 * then aborts that in-flight fetch, the page's own catch block logs
 * console.error(e), and the shared console-error fixture (correctly) fails
 * the test. Waiting for the specific refresh response - registered BEFORE
 * the click so it cannot be missed - plus the app's own loading-complete
 * signal removes the race without hiding any console error.
 */
async function saveAndWaitForListRefresh(page: Page, products: ProductPage) {
  const listRefresh = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/products"
  );
  await products.save();
  await expect(products.dialog()).toBeHidden();
  const response = await listRefresh;
  await response.finished(); // body fully received, so the app's res.json() cannot be cut off
  await waitForLoading(page); // the page's own isLoading=false (spinner gone)
}

async function openEdit(page: Page, name: string, code: string) {
  const products = new ProductPage(page);
  await products.goto();
  await waitForLoading(page);
  await products.search(code);
  await products.openEditModal(name);
  return products;
}

// 1x1 transparent PNG.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Ni-Chột-Dày", () => {
  // The Products list renders thumbnails served by Supabase Storage (Cloudflare
  // CDN). Firefox logs a console *error* for the CDN's third-party `__cf_bm`
  // cookie ("rejected for invalid domain") - a browser/network artifact, not an
  // application error, but the shared console-error fixture counts it. Product
  // images are not under test here, so those image requests (and only those)
  // are answered locally. Every other console error still fails the test.
  test.beforeEach(async ({ page }) => {
    await page.route(/\/storage\/v1\/object\/public\/product-images\//, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
    );
  });

  test("Vòng/Available: text input, old size hidden, typed value preserved verbatim", async ({ page }) => {
    const p = await createTestProduct({ category: "Vòng", status: "Available", size: 17.5 });
    try {
      await loginAsOwner(page);
      await openEdit(page, p.product_name, p.product_code);

      const input = dimensionInput(page);
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute("type", "text");
      await expect(page.getByText("Ni tay-Chột-Dày (mm)", { exact: true })).toBeVisible();
      await expect(page.getByTestId("product-dimension-helper")).toHaveText(
        "Ni-Chột-Dày, đơn vị mm. Dùng dấu chấm cho số thập phân."
      );
      await expect(input).toHaveAttribute("placeholder", "54.5-9.4-6.6");
      await expect(page.locator("#product-size")).toHaveCount(0); // legacy size hidden for Vòng

      for (const [text] of SAMPLES) {
        await input.fill("");
        await input.pressSequentially(text); // real keystrokes, not a programmatic set
        await expect(input).toHaveValue(text);
      }
    } finally {
      await deleteProductRow(p.id!);
    }
  });

  test("Vòng/Available: incomplete or malformed values are rejected, nothing is saved", async ({ page }) => {
    const p = await createTestProduct({ category: "Vòng", status: "Available" });
    try {
      await loginAsOwner(page);
      const products = await openEdit(page, p.product_name, p.product_code);
      const input = dimensionInput(page);

      for (const bad of ["", "54.5", "54.5-9.4", "54.5--6", "54.5-9-6-1", "a-b-c", "1e3-9-6", "54.55-9-6", "54.5-9.42-6", "54,5-9-6"]) {
        await input.fill(bad);
        await products.save();
        await expect(products.dialog()).toBeVisible(); // modal stays open
        await expect(page.locator("p.text-destructive").first()).toBeVisible();
      }
      const row = await getProductById(p.id!);
      expect(row?.dimension_ni_mm ?? null).toBeNull();
      expect(row?.dimension_chot_mm ?? null).toBeNull();
      expect(row?.dimension_day_mm ?? null).toBeNull();
    } finally {
      await deleteProductRow(p.id!);
    }
  });

  for (const [text, [ni, chot, day]] of SAMPLES) {
    test(`Vòng/Available: ${text} saves, reloads, edits again, and displays`, async ({ page }) => {
      const p = await createTestProduct({ category: "Vòng", status: "Available", size: 17.5 });
      try {
        await loginAsOwner(page);
        const products = await openEdit(page, p.product_name, p.product_code);
        await dimensionInput(page).fill(text);
        await saveAndWaitForListRefresh(page, products);

        const saved = await getProductById(p.id!);
        expect([saved?.dimension_ni_mm, saved?.dimension_chot_mm, saved?.dimension_day_mm].map(Number)).toEqual([ni, chot, day]);
        expect(Number(saved?.size)).toBe(17.5); // legacy size untouched, not copied into Ni

        // Detail page shows the canonical string built from the three numbers.
        await page.goto(`/products/${p.id}`);
        await waitForLoading(page);
        await expect(page.getByText("Ni tay-Chột-Dày (mm)", { exact: true })).toBeVisible();
        await expect(page.getByTestId("product-dimension-display")).toHaveText(text);

        // Reload -> edit -> save again: still exact.
        await page.reload();
        await waitForLoading(page);
        await page.getByRole("button", { name: /chỉnh sửa/i }).first().click();
        await expect(dimensionInput(page)).toHaveValue(text);
        await page.getByRole("dialog").getByRole("button", { name: "Lưu" }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
        const again = await getProductById(p.id!);
        expect([again?.dimension_ni_mm, again?.dimension_chot_mm, again?.dimension_day_mm].map(Number)).toEqual([ni, chot, day]);
      } finally {
        await deleteProductRow(p.id!);
      }
    });
  }

  test("Nhẫn/Available created through the UI: label, validation, save", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    let id: string | undefined;
    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);
      await products.openCreateModal();
      await products.fillRequired(code, name);
      await page.getByTestId("product-category-select").selectOption("Nhẫn");
      await page.getByTestId("product-status-select").selectOption("Available");

      await expect(page.getByText("Ni nhẫn-Chột-Dày (mm)", { exact: true })).toBeVisible();
      await expect(page.locator("#product-size")).toHaveCount(0);

      await products.save(); // required, empty
      await expect(products.dialog()).toBeVisible();
      await expect(page.getByText(/bắt buộc với sản phẩm Đang bán/)).toBeVisible();

      await dimensionInput(page).fill("54.5-9");
      await products.save();
      await expect(products.dialog()).toBeVisible();

      await dimensionInput(page).fill("54.5-9-6");
      await products.save();
      await expect(products.dialog()).toBeHidden();

      const created = await getProductByCode(code);
      id = created?.id;
      expect([created?.dimension_ni_mm, created?.dimension_chot_mm, created?.dimension_day_mm].map(Number)).toEqual([54.5, 9, 6]);
    } finally {
      if (id) await deleteProductRow(id);
    }
  });

  test("Vòng/non-Available (Paused): dimension is optional; product saves without it", async ({ page }) => {
    const p = await createTestProduct({ category: "Vòng", status: "Paused" });
    try {
      await loginAsOwner(page);
      const products = await openEdit(page, p.product_name, p.product_code);
      await expect(dimensionInput(page)).toBeVisible();
      await products.save();
      await expect(products.dialog()).toBeHidden();
      const row = await getProductById(p.id!);
      expect(row?.dimension_ni_mm ?? null).toBeNull();
    } finally {
      await deleteProductRow(p.id!);
    }
  });

  test("Other category (Dây chuyền): no dimension field, old numeric size field is unchanged", async ({ page }) => {
    const p = await createTestProduct({ category: "Dây chuyền", status: "Available", size: 40 });
    try {
      await loginAsOwner(page);
      const products = await openEdit(page, p.product_name, p.product_code);
      await expect(page.locator("#product-dimension")).toHaveCount(0);
      const size = page.locator("#product-size");
      await expect(size).toBeVisible();
      await expect(size).toHaveAttribute("type", "number");
      await products.save(); // no dimension requirement
      await expect(products.dialog()).toBeHidden();
      const row = await getProductById(p.id!);
      expect(Number(row?.size)).toBe(40);
      expect(row?.dimension_ni_mm ?? null).toBeNull();
    } finally {
      await deleteProductRow(p.id!);
    }
  });

  test("Existing Available Vòng with no dimension cannot be saved until completed (no backfill)", async ({ page }) => {
    const p = await createTestProduct({ category: "Vòng", status: "Available", size: 54 });
    try {
      const before = await getProductById(p.id!);
      expect(before?.dimension_ni_mm ?? null).toBeNull(); // size 54 was NOT mapped into Ni
      await loginAsOwner(page);
      const products = await openEdit(page, p.product_name, p.product_code);
      await products.save();
      await expect(products.dialog()).toBeVisible();
      await expect(page.getByText(/bắt buộc với sản phẩm Đang bán/)).toBeVisible();
    } finally {
      await deleteProductRow(p.id!);
    }
  });
});
