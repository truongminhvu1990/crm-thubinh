import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * QA Wave 2 - Orders. Covers all three screens the Business Flow spans:
 * `/orders` (list), `/orders/new` (creation - one scrolling screen per
 * app/orders/new/page.tsx: customer + sales owner + product cart in a
 * single form, no separate "Add Products" step), and `/orders/[id]`
 * (detail - items/payments/complete/lost/delete/reassign).
 *
 * Selectors are read from the current app/orders/**, components/order/**
 * source, not guessed. Two fragility notes, both deliberate (see
 * BasePage.fieldByLabel and tests/README.md's own "Known fragility"
 * precedent from Wave 1):
 *   - Cart-line/Add-Payment fields (Giá bán/Giảm giá/Số lượng/Số tiền/
 *     Ngày thanh toán/Ghi chú) have no `id` prop, so they're targeted by
 *     visible label text via `fieldByLabel()`, scoped per cart line or per
 *     modal so repeated labels (e.g. "Giảm giá" appears once per cart line
 *     AND once in the order summary) never collide.
 *   - The order summary (Tạm tính/Giảm giá/Tổng cộng) is targeted by its
 *     exact Tailwind class combination, since it has no test-id either -
 *     tied to app/orders/new/page.tsx's current markup.
 */
export class OrderPage extends BasePage {
  // --- List page (/orders) ---
  readonly newOrderButton = this.page.getByRole("link", { name: /tạo đơn hàng|thêm đơn hàng/i });
  readonly listSearchInput = this.page.getByPlaceholder("Tìm theo mã đơn hoặc tên/SĐT khách hàng...");
  readonly reloadButton = this.page.getByRole("button", { name: /làm mới/i });

  // --- Create page (/orders/new) ---
  readonly customerSearchInput = this.page.getByPlaceholder("Tìm theo tên hoặc số điện thoại...");
  /** The only <select> on this page (Người phụ trách). */
  readonly salesOwnerSelect = this.page.locator("select");
  readonly productSearchInput = this.page.getByPlaceholder("Tìm sản phẩm...");
  readonly saveOrderButton = this.page.getByRole("button", { name: "Lưu đơn hàng" });
  readonly cancelCreateButton = this.page.getByRole("button", { name: "Hủy" });
  /** app/orders/new/page.tsx's `{cart.length > 0 && (...)}` summary block -
   * targeted by its exact class combination (no test-id exists). */
  readonly orderSummary = this.page.locator(".mt-4.pt-4.border-t.border-border.space-y-1.text-sm");

  constructor(page: Page) {
    super(page);
  }

  // ---- Navigation ----

  async goto() {
    await super.goto("/orders");
  }

  async gotoNew() {
    await super.goto("/orders/new");
  }

  async gotoDetail(orderId: string) {
    await super.goto(`/orders/${orderId}`);
  }

  async expectOpened() {
    await this.expectLoaded(/\/orders/, /Đơn hàng/);
  }

  async expectNewOrderFormOpened() {
    await this.expectLoaded(/\/orders\/new/, /Tạo đơn hàng/);
  }

  // ---- List page ----

  async search(term: string) {
    await this.listSearchInput.fill(term);
  }

  async reload() {
    await this.reloadButton.click();
  }

  rowByOrderNumber(orderNumber: string) {
    return this.page.getByRole("row", { name: new RegExp(this.escapeRegExp(orderNumber)) });
  }

  // ---- Create page: Customer ----

  async searchCustomer(term: string) {
    await this.customerSearchInput.fill(term);
  }

  async selectCustomerByName(name: string) {
    await this.page.getByRole("button", { name: new RegExp(this.escapeRegExp(name)) }).first().click();
  }

  /** Picks whatever the first configured "salesperson" master-data option
   * is - Orders tests don't assert a specific value exists, only that
   * order.sales_owner ends up matching whatever was selected here. */
  async selectFirstAvailableSalesOwner(): Promise<string> {
    return this.selectFirstOption(this.salesOwnerSelect, "salesperson");
  }

  private async selectFirstOption(select: Locator, masterDataCategory: string): Promise<string> {
    const options = select.locator("option");
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const value = await options.nth(i).getAttribute("value");
      if (value) {
        const label = ((await options.nth(i).textContent()) || value).trim();
        await select.selectOption(value);
        return label;
      }
    }
    throw new Error(
      `No "${masterDataCategory}" master-data option is configured in this environment - Orders cannot exercise this flow without one.`
    );
  }

  // ---- Create page: Product cart ----

  async searchProduct(term: string) {
    await this.productSearchInput.fill(term);
  }

  async addProductToCart(productName: string) {
    await this.page.getByRole("button", { name: new RegExp(this.escapeRegExp(productName)) }).first().click();
  }

  /** The cart line card for a given product (`<div className="border ...">`
   * per product in the cart) - scoped so per-line fields can be targeted
   * unambiguously even with multiple lines in the cart. */
  cartLine(productName: string): Locator {
    return this.page.locator("div.border.border-border.rounded-lg.p-3").filter({ hasText: productName });
  }

  async removeCartLine(productName: string) {
    await this.cartLine(productName).getByRole("button", { name: "Xóa sản phẩm" }).click();
  }

  async setCartLineSalePrice(productName: string, price: number) {
    await this.fieldByLabel(this.cartLine(productName), "Giá bán").fill(String(price));
  }

  async setCartLineDiscount(productName: string, discount: number) {
    await this.fieldByLabel(this.cartLine(productName), "Giảm giá").fill(String(discount));
  }

  async setCartLineQuantity(productName: string, quantity: number) {
    await this.fieldByLabel(this.cartLine(productName), "Số lượng").fill(String(quantity));
  }

  async saveOrder() {
    await this.saveOrderButton.click();
  }

  async cancelCreate() {
    await this.cancelCreateButton.click();
  }

  fieldError(message: string) {
    return this.page.getByText(message, { exact: true });
  }

  /** Order summary's "Tạm tính"/"Giảm giá"/"Tổng cộng" value cell (the
   * second <span> in each row - the first is the label). */
  summaryValue(rowLabel: "Tạm tính" | "Giảm giá" | "Tổng cộng"): Locator {
    return this.orderSummary.locator("div", { hasText: rowLabel }).locator("span").last();
  }

  // ---- Detail page: items ----

  itemRowByProductName(productName: string) {
    return this.page.getByRole("row", { name: new RegExp(this.escapeRegExp(productName)) });
  }

  readonly detailProductSearchInput = this.page.getByPlaceholder("Tìm sản phẩm để thêm...");

  async searchProductOnDetail(term: string) {
    await this.detailProductSearchInput.fill(term);
  }

  async addProductOnDetail(productName: string) {
    await this.page.getByRole("button", { name: new RegExp(this.escapeRegExp(productName)) }).first().click();
  }

  async removeItemRow(productName: string) {
    await this.itemRowByProductName(productName).getByRole("button", { name: "Xóa sản phẩm" }).click();
  }

  // ---- Detail page: order date / note (editable while Draft/Reserved) ----

  readonly orderDateInput = this.page.locator('input[type="date"]').first();
  readonly saveDetailsButton = this.page.getByRole("button", { name: "Lưu thay đổi" });

  /** The order-level "Ghi chú" field (Chỉnh sửa đơn hàng card) - only
   * unambiguous while the Add Payment modal (which has its own, differently
   * scoped "Ghi chú" field) is closed. */
  get noteInput(): Locator {
    return this.fieldByLabel(this.page, "Ghi chú");
  }

  // ---- Detail page: payments ----

  readonly addPaymentButton = this.page.getByRole("button", { name: "Thêm thanh toán" });

  async openAddPaymentModal() {
    await this.addPaymentButton.click();
    await expect(this.dialog(/Thêm thanh toán/)).toBeVisible();
  }

  async fillPaymentAmount(amount: number) {
    await this.fieldByLabel(this.dialog(), "Số tiền").fill(String(amount));
  }

  async selectFirstAvailablePaymentMethod(): Promise<string> {
    const select = this.fieldByLabel(this.dialog(), "Phương thức");
    return this.selectFirstOption(select, "payment_method");
  }

  async fillPaymentNote(note: string) {
    await this.fieldByLabel(this.dialog(), "Ghi chú").fill(note);
  }

  readonly paymentDateInput = this.dialog().locator('input[type="date"]');

  async savePayment() {
    await this.dialog().getByRole("button", { name: "Lưu" }).click();
  }

  async cancelPayment() {
    await this.dialog().getByRole("button", { name: "Hủy" }).click();
  }

  paymentRowByMethod(method: string) {
    return this.page.getByRole("row", { name: new RegExp(this.escapeRegExp(method)) });
  }

  // ---- Detail page: complete / lost / delete ----

  readonly completeButton = this.page.getByRole("button", { name: "Hoàn thành đơn" });
  readonly markLostButton = this.page.getByRole("button", { name: "Đánh dấu Lost" });
  readonly deleteDraftButton = this.page.getByRole("button", { name: "Xóa đơn nháp" });

  async complete() {
    await this.completeButton.click();
  }

  /** Opens the Mark Lost modal (title "Đánh dấu đơn hàng Lost"), picks
   * whatever the first configured Lost Reason option is, and confirms -
   * mirrors selectFirstAvailableSalesOwner()'s "don't assume a specific
   * value exists" reasoning. */
  async markOrderLost(): Promise<string> {
    await this.markLostButton.click();
    const lostDialog = this.dialog(/Đánh dấu đơn hàng Lost/);
    await expect(lostDialog).toBeVisible();

    const reasonSelect = this.fieldByLabel(lostDialog, "Lý do");
    const reason = await this.selectFirstOption(reasonSelect, "lost reason");

    await lostDialog.getByRole("button", { name: "Đánh dấu Lost" }).click();
    return reason;
  }

  async deleteDraft() {
    await this.deleteDraftButton.click();
  }
}
