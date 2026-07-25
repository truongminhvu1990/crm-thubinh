import { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class SalesLedgerPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/reports/sales-ledger");
  }

  async gotoDetail(saleId: string) {
    await super.goto(`/reports/sales-ledger/${saleId}`);
  }

  async expectOpened() {
    await this.expectLoaded(/\/reports\/sales-ledger/, /Sổ bán hàng/);
  }

  rowByOrderNumber(orderNumber: string) {
    return this.page.getByRole("row", { name: new RegExp(orderNumber) });
  }
}
