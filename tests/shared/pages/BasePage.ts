import { Page, Locator, expect } from "@playwright/test";

/**
 * Common behaviour shared by every page object: navigation and a heading
 * assertion used to confirm the right screen actually loaded.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string) {
    await this.page.goto(path);
  }

  heading(text: string | RegExp): Locator {
    return this.page.getByRole("heading", { name: text }).first();
  }

  async expectLoaded(path: RegExp, headingText: string | RegExp) {
    await expect(this.page).toHaveURL(path);
    await expect(this.heading(headingText)).toBeVisible();
  }

  /** Radix Dialog.Content (create/edit modals) - role="dialog". */
  dialog(name?: string | RegExp): Locator {
    return this.page.getByRole("dialog", name ? { name } : undefined);
  }

  /** Radix AlertDialog.Content (delete/duplicate confirmations) - role="alertdialog". */
  alertDialog(name?: string | RegExp): Locator {
    return this.page.getByRole("alertdialog", name ? { name } : undefined);
  }

  async confirmAlertDialog(label = "Xóa") {
    await this.alertDialog().getByRole("button", { name: label, exact: true }).click();
  }

  async cancelAlertDialog(label = "Hủy") {
    await this.alertDialog().getByRole("button", { name: label, exact: true }).click();
  }

  protected escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * QA Wave 2 - targets an Input/CurrencyInput/Select field
   * (components/ui/{Input,CurrencyInput,Select}.tsx) by its visible label
   * text, for the common case in this codebase where those components
   * render the label as a plain sibling `<label>` with no `htmlFor`/`id`
   * pairing (Playwright's `getByLabel()` doesn't resolve those - it only
   * works where a form explicitly passes an `id` prop, e.g.
   * ProductForm.tsx's `id="product-cost_price"`, which the cart-line and
   * Add Payment forms this page object covers don't). All three components
   * share the same wrapper shape: `<div className="w-full"><label>...
   * </label>...<input|select/></div>`. `container` scopes the search (one
   * cart line, one modal) so forms with several such fields don't collide.
   */
  fieldByLabel(container: Page | Locator, label: string | RegExp): Locator {
    return container
      .locator("div.w-full")
      .filter({ has: this.page.locator("label", { hasText: label }) })
      .locator("input, select");
  }
}
