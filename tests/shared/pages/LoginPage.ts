import { Page } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly emailInput = this.page.getByPlaceholder("Nhập email của bạn");
  readonly passwordInput = this.page.getByPlaceholder("Nhập mật khẩu");
  readonly submitButton = this.page.getByRole("button", { name: /đăng nhập/i });
  readonly errorMessage = this.page.getByText(
    /Email hoặc mật khẩu không chính xác|Có lỗi xảy ra/
  );

  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await super.goto("/login");
  }

  async fillCredentials(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  /** Full login flow: navigate, fill, submit. Does not assert the outcome. */
  async login(email: string, password: string) {
    await this.goto();
    await this.fillCredentials(email, password);
    await this.submit();
  }
}
