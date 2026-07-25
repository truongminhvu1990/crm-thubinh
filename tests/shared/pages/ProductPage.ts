import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ProductPage extends BasePage {
  readonly searchInput = this.page.getByPlaceholder("Tìm theo tên, mã hoặc SKU...");
  readonly addButton = this.page.getByRole("button", { name: /thêm sản phẩm/i });
  readonly reloadButton = this.page.getByRole("button", { name: /làm mới/i });

  // Modal form fields - `id` attributes come straight from ProductForm.tsx.
  readonly productCodeInput = this.page.locator("#product-product_code");
  readonly productNameInput = this.page.locator("#product-product_name");
  readonly costPriceInput = this.page.locator("#product-cost_price");
  readonly salePriceInput = this.page.locator("#product-sale_price");
  readonly availableInput = this.page.locator("#product-available");
  readonly modalSaveButton = this.dialog().getByRole("button", { name: "Lưu" });
  readonly modalCancelButton = this.dialog().getByRole("button", { name: "Hủy" });

  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/products");
  }

  async expectOpened() {
    await this.expectLoaded(/\/products/, /Sản phẩm/);
  }

  async search(term: string) {
    await this.searchInput.fill(term);
  }

  async reload() {
    await this.reloadButton.click();
  }

  rowByName(name: string) {
    return this.page.getByRole("row", { name: new RegExp(this.escapeRegExp(name)) });
  }

  async openCreateModal() {
    await this.addButton.click();
    await expect(this.dialog(/Thêm sản phẩm mới/)).toBeVisible();
  }

  async openEditModal(name: string) {
    await this.rowByName(name).getByTitle("Chỉnh sửa").click();
    await expect(this.dialog(/Chỉnh sửa sản phẩm/)).toBeVisible();
  }

  async openDeleteConfirm(name: string) {
    await this.rowByName(name).getByTitle("Xóa").click();
    await expect(this.alertDialog(/Xóa sản phẩm\?/)).toBeVisible();
  }

  async fillRequired(productCode: string, productName: string) {
    await this.productCodeInput.fill(productCode);
    await this.productNameInput.fill(productName);
  }

  async save() {
    await this.modalSaveButton.click();
  }

  async cancel() {
    await this.modalCancelButton.click();
  }

  fieldError(message: string) {
    return this.page.getByText(message, { exact: true });
  }
}
