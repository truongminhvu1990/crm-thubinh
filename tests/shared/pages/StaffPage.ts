import { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class StaffPage extends BasePage {
  readonly addButton = this.page.getByRole("button", { name: /thêm nhân viên/i });

  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/settings/staff");
  }

  async gotoDetail(staffId: string) {
    await super.goto(`/settings/staff/${staffId}`);
  }

  async expectOpened() {
    await this.expectLoaded(/\/settings\/staff/, /Nhân viên/);
  }

  rowByName(name: string) {
    return this.page.getByRole("row", { name: new RegExp(name) });
  }
}
