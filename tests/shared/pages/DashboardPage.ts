import { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class DashboardPage extends BasePage {
  readonly heading1 = this.heading(/Dashboard CRM Cẩm Thạch Thu Bình/);
  readonly logoutButton = this.page.getByRole("button", { name: /đăng xuất/i });

  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/dashboard");
  }

  async expectOpened() {
    await this.expectLoaded(/\/dashboard/, /Dashboard CRM Cẩm Thạch Thu Bình/);
  }

  async logout() {
    await this.logoutButton.click();
  }
}
