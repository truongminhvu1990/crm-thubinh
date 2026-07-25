import { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class ReportPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/reports");
  }

  async expectOpened() {
    await this.expectLoaded(/\/reports/, /Báo cáo/);
  }

  statCard(label: string) {
    return this.page.getByText(label, { exact: false }).locator("..");
  }
}
