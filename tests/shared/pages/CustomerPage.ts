import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class CustomerPage extends BasePage {
  readonly searchInput = this.page.getByPlaceholder(
    "Tìm theo tên, mã hoặc số điện thoại..."
  );
  readonly addButton = this.page.getByRole("button", { name: "Thêm khách" });
  readonly reloadButton = this.page.getByRole("button", { name: /làm mới/i });

  // Modal form fields - `id` attributes come straight from CustomerForm.tsx.
  readonly fullNameInput = this.page.locator("#customer-full_name");
  readonly phoneInput = this.page.locator("#customer-phone");
  readonly modalSaveButton = this.dialog().getByRole("button", { name: "Lưu" });
  readonly modalCancelButton = this.dialog().getByRole("button", { name: "Hủy" });

  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/customers");
  }

  async expectOpened() {
    await this.expectLoaded(/\/customers/, /Khách hàng/);
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
    await expect(this.dialog(/Thêm khách hàng mới/)).toBeVisible();
  }

  async openEditModal(name: string) {
    await this.rowByName(name).getByTitle("Chỉnh sửa").click();
    await expect(this.dialog(/Chỉnh sửa khách hàng/)).toBeVisible();
  }

  async openDeleteConfirm(name: string) {
    await this.rowByName(name).getByTitle("Xóa").click();
    await expect(this.alertDialog(/Xóa khách hàng\?/)).toBeVisible();
  }

  async fillRequired(fullName: string, phone: string) {
    await this.fullNameInput.fill(fullName);
    await this.phoneInput.fill(phone);
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
