import type { Page, Route } from "@playwright/test";
import { test, expect } from "../shared/fixtures";
import { ProductPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  expectRevenue,
  expectInventoryUpdated,
  qaProductName,
  qaProductCode,
  getProductByCode,
  deleteProductRow,
  type ExpectedDiagnostics,
} from "../shared/utils";
import { SERVER_ERROR_DIAGNOSTICS, NETWORK_FAILURE_DIAGNOSTICS } from "./productsLoadDiagnostics";

/**
 * QA Wave 1 - Products regression pack.
 *
 * Every test that creates a product generates its own unique code/name
 * (tests/shared/utils/testData.ts) and deletes it directly from the
 * database in a `finally` block - independent of whether the UI delete
 * flow under test succeeded, and independent of any other test.
 *
 * Column indices used below (e.g. `.locator("td").nth(2)`) follow
 * ProductTable.tsx's fixed header order: Sản phẩm(0), Danh mục(1), Giá
 * bán(2), Tồn kho(3), Trạng thái(4), Lô hàng(5), Thao tác(6). If that
 * table is ever restructured, these indices need to move with it.
 */
test.describe("Products smoke pack", () => {
  test("Open product list", async ({ page }) => {
    await loginAsOwner(page);
    const products = new ProductPage(page);
    await products.goto();
    await waitForLoading(page);

    await products.expectOpened();
  });

  test("Search finds a freshly created product by code", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getProductByCode(code);
      productId = created?.id;

      const row = products.rowByName(name);
      await products.search(code);
      await expect(row).toBeVisible();

      await products.search("no-such-code-xyz");
      await expect(row).toBeHidden();
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Create product persists to the database", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      await products.search(code);
      await expect(products.rowByName(name)).toBeVisible();

      const dbRow = await getProductByCode(code);
      expect(dbRow).not.toBeNull();
      productId = dbRow!.id;
      expect(dbRow!.product_name).toBe(name);
      expect(dbRow!.product_code).toBe(code);
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Edit product updates the database", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    const updatedName = `${name} Updated`;
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getProductByCode(code);
      productId = created?.id;

      await products.search(code);
      await products.openEditModal(name);
      await products.productNameInput.fill(updatedName);
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      await products.search(code);
      await expect(products.rowByName(updatedName)).toBeVisible();

      const dbRow = await getProductByCode(code);
      expect(dbRow?.product_name).toBe(updatedName);
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Delete product removes it from the database", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getProductByCode(code);
      productId = created?.id;
      expect(productId).toBeTruthy();

      await products.search(code);
      await products.openDeleteConfirm(name);
      await products.confirmAlertDialog();
      await waitForLoading(page);

      await products.search(code);
      await expect(products.rowByName(name)).toBeHidden();

      const dbRow = await getProductByCode(code);
      expect(dbRow).toBeNull();
      productId = undefined; // already gone - nothing left to clean up
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Selling price is saved and displayed correctly", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    const salePrice = 1_500_000;
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.salePriceInput.fill(String(salePrice));
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const dbRow = await getProductByCode(code);
      productId = dbRow?.id;
      expect(dbRow?.sale_price).toBe(salePrice);

      await products.search(code);
      const priceCell = products.rowByName(name).locator("td").nth(2);
      await expectRevenue(priceCell, salePrice);
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Cost price is saved to the database", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    const costPrice = 900_000;
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.costPriceInput.fill(String(costPrice));
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const dbRow = await getProductByCode(code);
      productId = dbRow?.id;
      // Cost price is deliberately not shown in the product list UI
      // (it's margin data) - the database is the only source of truth
      // to check here, which is exactly why this check exists.
      expect(dbRow?.cost_price).toBe(costPrice);
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Initial inventory quantity is saved and displayed", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    const available = 7;
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.availableInput.fill(String(available));
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const dbRow = await getProductByCode(code);
      productId = dbRow?.id;
      expect(dbRow?.available).toBe(available);

      await products.search(code);
      const inventoryCell = products.rowByName(name).locator("td").nth(3);
      await expectInventoryUpdated(inventoryCell, available);
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });

  test("Validation blocks save when required fields are empty", async ({ page }) => {
    await loginAsOwner(page);
    const products = new ProductPage(page);
    await products.goto();
    await waitForLoading(page);

    await products.openCreateModal();
    await products.save();

    await expect(products.fieldError("Vui lòng nhập mã sản phẩm")).toBeVisible();
    await expect(products.fieldError("Vui lòng nhập tên sản phẩm")).toBeVisible();
    await expect(products.dialog()).toBeVisible();
  });

  test("Reload re-fetches the list from the server", async ({ page }) => {
    const code = qaProductCode();
    const name = qaProductName();
    let productId: string | undefined;

    try {
      await loginAsOwner(page);
      const products = new ProductPage(page);
      await products.goto();
      await waitForLoading(page);

      await products.openCreateModal();
      await products.fillRequired(code, name);
      await products.save();
      await expect(products.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getProductByCode(code);
      productId = created?.id;

      await products.reload();
      await waitForLoading(page);
      await products.search(code);
      await expect(products.rowByName(name)).toBeVisible();
    } finally {
      if (productId) await deleteProductRow(productId);
    }
  });
});

/**
 * Load-state pack: stubs GET /api/products so no product is created or
 * read from the database. The stub answers by mode, not by request count,
 * so the doubled mount request React Strict Mode causes in `next dev`
 * cannot change which response a test gets.
 */
test.describe("Products list load states", () => {
  const fakeProduct = {
    id: "qa-load-state-product",
    product_code: "QA-LOAD-STATE",
    product_name: "QA Load State Product",
    status: "Available",
    available: 1,
  };
  const emptyState = (page: Page) => page.getByText("Chưa có sản phẩm nào");

  // What GET /api/products returns when its query fails. The page only reads the status, never this body.
  const PRODUCTS_QUERY_FAILED_BODY = {
    error: { code: "PRODUCTS_QUERY_FAILED", message: "Không tải được danh sách sản phẩm." },
  };

  type ProductsApiMode = "list" | "empty" | "server-error" | "network-failure";

  /** Returns `setMode` to change what every later request receives. */
  async function stubProductsApi(page: Page, initialMode: ProductsApiMode) {
    let mode = initialMode;
    await page.route("**/api/products", (route: Route) => {
      switch (mode) {
        case "list":
          return route.fulfill({ json: [fakeProduct] });
        case "empty":
          return route.fulfill({ json: [] });
        case "server-error":
          return route.fulfill({ status: 500, json: PRODUCTS_QUERY_FAILED_BODY });
        case "network-failure":
          return route.abort("failed");
      }
    });
    return {
      setMode: (next: ProductsApiMode) => {
        mode = next;
      },
    };
  }

  for (const [label, failureMode, diagnostics] of [
    ["HTTP 500", "server-error", SERVER_ERROR_DIAGNOSTICS],
    ["network failure", "network-failure", NETWORK_FAILURE_DIAGNOSTICS],
  ] as const) {
    test(`First load fails (${label}): error shown, no empty state`, async ({ page, expectedDiagnostics }) => {
      expectedDiagnostics.expect(diagnostics);
      await loginAsOwner(page);
      await stubProductsApi(page, failureMode);
      const products = new ProductPage(page);
      await products.goto();

      await expect(page.getByTestId("product-load-error")).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: "Không tải được danh sách sản phẩm" })).toBeVisible();
      await expect(emptyState(page)).toBeHidden();
    });
  }

  test("First load fails, then reload succeeds: error clears and data shows", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(SERVER_ERROR_DIAGNOSTICS);
    await loginAsOwner(page);
    const api = await stubProductsApi(page, "server-error");
    const products = new ProductPage(page);
    await products.goto();
    await expect(page.getByTestId("product-load-error")).toBeVisible();

    api.setMode("list");
    await products.reload();

    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();
    await expect(page.getByTestId("product-load-error")).toBeHidden();
    await expect(page.getByTestId("product-reload-error")).toBeHidden();
  });

  test("Reload fails after data loaded: old list kept, warning shown", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(SERVER_ERROR_DIAGNOSTICS);
    await loginAsOwner(page);
    const api = await stubProductsApi(page, "list");
    const products = new ProductPage(page);
    await products.goto();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();

    api.setMode("server-error");
    await products.reload();

    await expect(page.getByTestId("product-reload-error")).toBeVisible();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();
    await expect(page.getByTestId("product-load-error")).toBeHidden();
  });

  test("Successful load with no products shows the empty state, not an error", async ({ page }) => {
    await loginAsOwner(page);
    await stubProductsApi(page, "empty");
    const products = new ProductPage(page);
    await products.goto();

    await expect(emptyState(page)).toBeVisible();
    await expect(page.getByTestId("product-load-error")).toBeHidden();
    await expect(page.getByTestId("product-reload-error")).toBeHidden();
  });

  // --- Save / delete succeed but the list refresh after them fails -----------------------------------------------
  // Products are written from the browser straight to Supabase REST (lib/product.service.ts), not through
  // /api/products, so these tests stub the REST endpoints too. The stub never lets a request through once it is
  // active: unknown reads get an empty list, and any write it does not recognise is aborted and recorded.

  const PG_ERROR = { code: "42501", message: "QA stub: write rejected", details: null, hint: null };
  const CREATED_PRODUCT_ID = "qa-write-created-product";
  type RestMode = "ok" | "write-fails";

  /**
   * Install BEFORE login, call `activate()` after it. Until then reads pass through (the app's own sign-in
   * traffic) and every write is aborted and recorded; after it nothing reaches the network at all.
   * `writes` lists the stubbed writes that were served, `blocked` the writes that matched no stub.
   */
  async function stubSupabaseRest(page: Page, mode: RestMode) {
    const writes: string[] = [];
    const blocked: string[] = [];
    let active = false;

    await page.route(/\/rest\/v1\//, (route: Route) => {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());
      const table = url.pathname.split("/rest/v1/")[1] ?? "";
      const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";

      if (!active) {
        if (isRead) return route.fallback();
        blocked.push(`${method} ${table}`);
        return route.abort();
      }

      if (method === "GET") {
        // deleteProduct's history check on the product itself (select batch_id,status,returned_at ... id=eq.<id>)
        if (table === "products" && url.searchParams.get("select")?.includes("batch_id")) {
          return route.fulfill({ json: [{ batch_id: null, status: "Available", returned_at: null }] });
        }
        // duplicate checks, the history checks on other tables, master data options: nothing found
        return route.fulfill({ json: [] });
      }
      if (method === "OPTIONS") return route.fulfill({ status: 204 });

      if (method === "POST" && table === "products") {
        writes.push("POST products");
        if (mode === "write-fails") return route.fulfill({ status: 400, json: PG_ERROR });
        return route.fulfill({ status: 201, json: { id: CREATED_PRODUCT_ID, ...request.postDataJSON() } });
      }
      if (method === "DELETE" && table === "products" && url.searchParams.get("id") === `eq.${fakeProduct.id}`) {
        writes.push("DELETE products");
        if (mode === "write-fails") return route.fulfill({ status: 400, json: PG_ERROR });
        return route.fulfill({ status: 204 });
      }

      blocked.push(`${method} ${table}`);
      return route.abort();
    });

    return {
      activate: () => {
        active = true;
      },
      writes,
      blocked,
    };
  }

  // Console output the failing-write tests provoke on purpose: Chromium's report of the 400 and the app's own logging.
  const WRITE_REJECTED_RESOURCE = {
    text: /^Failed to load resource: the server responded with a status of 400/,
    url: /\/rest\/v1\/products(\?|$)/,
  };
  // app/products/page.tsx's own console.error(error) prints the stub's PostgREST error object, which is all of this text.
  const STUB_ERROR_LOGGED = { text: /^\{code: 42501, message: QA stub: write rejected, details: null, hint: null\}$/ };
  const SAVE_WRITE_FAILURE_DIAGNOSTICS: ExpectedDiagnostics = {
    consoleErrors: [WRITE_REJECTED_RESOURCE, { text: /^Error adding product:/ }, STUB_ERROR_LOGGED],
  };
  const DELETE_WRITE_FAILURE_DIAGNOSTICS: ExpectedDiagnostics = {
    consoleErrors: [WRITE_REJECTED_RESOURCE, { text: /^Error deleting product:/ }, STUB_ERROR_LOGGED],
  };

  const writeNotice = (page: Page) => page.getByTestId("product-write-refresh-error");

  async function createProductWhileRefreshFails(page: Page) {
    const rest = await stubSupabaseRest(page, "ok");
    await loginAsOwner(page);
    const api = await stubProductsApi(page, "list");
    rest.activate();
    const products = new ProductPage(page);
    await products.goto();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();

    api.setMode("server-error");
    await products.openCreateModal();
    await products.fillRequired("QA-WRITE-SAVE", "QA Write Save Product");
    await products.save();
    return { rest, api, products };
  }

  test("Save succeeds but the refresh fails: says the product was saved, keeps the old list", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(SERVER_ERROR_DIAGNOSTICS);
    const { rest, products } = await createProductWhileRefreshFails(page);

    await expect(products.dialog()).toBeHidden();
    await expect(writeNotice(page)).toBeVisible();
    await expect(writeNotice(page)).toContainText("Đã lưu sản phẩm thành công nhưng chưa làm mới được danh sách");
    await expect(writeNotice(page)).toContainText("chưa phản ánh thay đổi gần nhất");
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();
    await expect(page.getByTestId("product-reload-error")).toBeHidden();
    await expect(page.getByTestId("product-load-error")).toBeHidden();

    expect(rest.writes).toEqual(["POST products"]);
    expect(rest.blocked).toEqual([]);
  });

  test("Delete succeeds but the refresh fails: says the product was deleted, keeps the old list", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(SERVER_ERROR_DIAGNOSTICS);
    const rest = await stubSupabaseRest(page, "ok");
    await loginAsOwner(page);
    const api = await stubProductsApi(page, "list");
    rest.activate();
    const products = new ProductPage(page);
    await products.goto();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();

    api.setMode("server-error");
    await products.openDeleteConfirm(fakeProduct.product_name);
    await products.confirmAlertDialog();

    await expect(writeNotice(page)).toBeVisible();
    await expect(writeNotice(page)).toContainText("Đã xóa sản phẩm thành công nhưng chưa làm mới được danh sách");
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();
    await expect(page.getByTestId("product-reload-error")).toBeHidden();

    expect(rest.writes).toEqual(["DELETE products"]);
    expect(rest.blocked).toEqual([]);
  });

  test("A later successful refresh clears the save notice and shows the list again", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(SERVER_ERROR_DIAGNOSTICS);
    const { rest, api, products } = await createProductWhileRefreshFails(page);
    await expect(writeNotice(page)).toBeVisible();

    api.setMode("list");
    await products.reload();

    await expect(writeNotice(page)).toBeHidden();
    await expect(page.getByTestId("product-reload-error")).toBeHidden();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();
    expect(rest.writes).toEqual(["POST products"]);
    expect(rest.blocked).toEqual([]);
  });

  test("Save fails: the existing save error shows and no 'saved' notice appears", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(SAVE_WRITE_FAILURE_DIAGNOSTICS);
    const rest = await stubSupabaseRest(page, "write-fails");
    await loginAsOwner(page);
    await stubProductsApi(page, "list");
    rest.activate();
    const products = new ProductPage(page);
    await products.goto();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();

    await products.openCreateModal();
    await products.fillRequired("QA-WRITE-SAVE", "QA Write Save Product");
    await products.save();

    await expect(products.dialog()).toContainText("Lỗi khi lưu sản phẩm");
    await expect(writeNotice(page)).toBeHidden();
    expect(rest.writes).toEqual(["POST products"]);
    expect(rest.blocked).toEqual([]);
  });

  test("Delete fails: the existing delete error shows and no 'deleted' notice appears", async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(DELETE_WRITE_FAILURE_DIAGNOSTICS);
    const rest = await stubSupabaseRest(page, "write-fails");
    await loginAsOwner(page);
    await stubProductsApi(page, "list");
    rest.activate();
    const products = new ProductPage(page);
    await products.goto();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();

    const dialogMessage = page.waitForEvent("dialog").then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await products.openDeleteConfirm(fakeProduct.product_name);
    await products.confirmAlertDialog();

    expect(await dialogMessage).toContain("QA stub: write rejected");
    await expect(writeNotice(page)).toBeHidden();
    await expect(products.rowByName(fakeProduct.product_name)).toBeVisible();
    expect(rest.writes).toEqual(["DELETE products"]);
    expect(rest.blocked).toEqual([]);
  });
});
