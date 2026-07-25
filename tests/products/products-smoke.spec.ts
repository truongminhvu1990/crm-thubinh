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
} from "../shared/utils";

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
