import { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class PermissionPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/settings/permissions");
  }

  async gotoMatrix() {
    await super.goto("/settings/permissions/matrix");
  }

  async gotoRoles() {
    await super.goto("/settings/permissions/roles");
  }

  async gotoAuditLog() {
    await super.goto("/settings/permissions/audit");
  }

  async expectOpened() {
    await this.expectLoaded(/\/settings\/permissions/, /Phân quyền/);
  }
}
