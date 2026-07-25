import { test, expect } from "../shared/fixtures";
import { CustomerPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  qaCustomerName,
  qaCustomerPhone,
  getCustomerByPhone,
  patchCustomer,
  deleteCustomerRow,
} from "../shared/utils";

/**
 * QA Wave 1 - Customers regression pack.
 *
 * Every test that creates a customer generates its own unique name/phone
 * (tests/shared/utils/testData.ts) and deletes it directly from the
 * database in a `finally` block - independent of whether the UI delete
 * flow under test succeeded, and independent of any other test.
 *
 * Column indices used below (e.g. `.locator("td").nth(2)`) follow
 * CustomerTable.tsx's fixed header order: Khách hàng(0), Liên hệ(1),
 * Loại(2), Trạng thái(3), Tags(4), Follow-up(5), Nguồn(6), Doanh thu(7),
 * Mua gần nhất(8), Thao tác(9). If that table is ever restructured, these
 * indices need to move with it.
 */
test.describe("Customers smoke pack", () => {
  test("Open customer list", async ({ page }) => {
    await loginAsOwner(page);
    const customers = new CustomerPage(page);
    await customers.goto();
    await waitForLoading(page);

    await customers.expectOpened();
  });

  test("Search finds a freshly created customer by phone", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getCustomerByPhone(phone);
      customerId = created?.id;

      const row = customers.rowByName(name);
      await customers.search(phone);
      await expect(row).toBeVisible();

      await customers.search("no-such-phone-xyz");
      await expect(row).toBeHidden();
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });

  test("Create customer persists to the database", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      await customers.search(phone);
      await expect(customers.rowByName(name)).toBeVisible();

      const dbRow = await getCustomerByPhone(phone);
      expect(dbRow).not.toBeNull();
      customerId = dbRow!.id;
      expect(dbRow!.full_name).toBe(name);
      expect(dbRow!.phone).toBe(phone);
      // addCustomer() defaults new rows to the first VIP Care pipeline
      // stage unless the caller sets one explicitly - part of "what
      // creating a customer does", not a separate module's business rule.
      expect(dbRow!.customer_status).toBe("New");
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });

  test("Edit customer updates the database", async ({ page }) => {
    const name = qaCustomerName();
    const updatedName = `${name} Updated`;
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getCustomerByPhone(phone);
      customerId = created?.id;

      await customers.search(phone);
      await customers.openEditModal(name);
      await customers.fullNameInput.fill(updatedName);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      await customers.search(phone);
      await expect(customers.rowByName(updatedName)).toBeVisible();

      const dbRow = await getCustomerByPhone(phone);
      expect(dbRow?.full_name).toBe(updatedName);
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });

  test("Delete customer removes it from the database", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getCustomerByPhone(phone);
      customerId = created?.id;
      expect(customerId).toBeTruthy();

      await customers.search(phone);
      await customers.openDeleteConfirm(name);
      await customers.confirmAlertDialog();
      await waitForLoading(page);

      await customers.search(phone);
      await expect(customers.rowByName(name)).toBeHidden();

      const dbRow = await getCustomerByPhone(phone);
      expect(dbRow).toBeNull();
      customerId = undefined; // already gone - nothing left to clean up
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });

  test("Validation blocks save when required fields are empty", async ({ page }) => {
    await loginAsOwner(page);
    const customers = new CustomerPage(page);
    await customers.goto();
    await waitForLoading(page);

    await customers.openCreateModal();
    await customers.save();

    await expect(customers.fieldError("Vui lòng nhập họ tên")).toBeVisible();
    await expect(customers.fieldError("Vui lòng nhập số điện thoại")).toBeVisible();
    await expect(customers.dialog()).toBeVisible();
  });

  test("Cancel discards the form without creating a customer", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();

    await loginAsOwner(page);
    const customers = new CustomerPage(page);
    await customers.goto();
    await waitForLoading(page);

    await customers.openCreateModal();
    await customers.fillRequired(name, phone);
    await customers.cancel();

    await expect(customers.dialog()).toBeHidden();
    const dbRow = await getCustomerByPhone(phone);
    expect(dbRow).toBeNull();
  });

  test("Reload re-fetches the list from the server", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getCustomerByPhone(phone);
      customerId = created?.id;

      await customers.reload();
      await waitForLoading(page);
      await customers.search(phone);
      await expect(customers.rowByName(name)).toBeVisible();
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });

  test("Follow-up badge reflects the customer's next follow-up date", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getCustomerByPhone(phone);
      customerId = created?.id;
      expect(customerId).toBeTruthy();

      await customers.search(phone);
      const followupCell = customers.rowByName(name).locator("td").nth(5);
      await expect(followupCell).toContainText("—");

      // Scheduling itself belongs to the Follow-up module (out of scope) -
      // this only sets the customer's own field to check the Customers
      // list renders it, via the DB directly rather than that module's UI.
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await patchCustomer(customerId!, { next_followup_date: tomorrow });

      await customers.reload();
      await waitForLoading(page);
      await customers.search(phone);
      await expect(followupCell).not.toContainText("—");
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });

  test("VIP badge shows once vip_level is VIP", async ({ page }) => {
    const name = qaCustomerName();
    const phone = qaCustomerPhone();
    let customerId: string | undefined;

    try {
      await loginAsOwner(page);
      const customers = new CustomerPage(page);
      await customers.goto();
      await waitForLoading(page);

      await customers.openCreateModal();
      await customers.fillRequired(name, phone);
      await customers.save();
      await expect(customers.dialog()).toBeHidden();
      await waitForLoading(page);

      const created = await getCustomerByPhone(phone);
      customerId = created?.id;
      expect(customerId).toBeTruthy();

      await customers.search(phone);
      const typeCell = customers.rowByName(name).locator("td").nth(2);
      await expect(typeCell).toContainText("Normal");

      // vip_level's selectable options are admin-configured master data
      // (Settings > Master Data > Customer Stage) - patching the DB
      // directly keeps this test deterministic regardless of what's
      // configured, since the badge's own rule is a literal "VIP" check.
      await patchCustomer(customerId!, { vip_level: "VIP" });

      await customers.reload();
      await waitForLoading(page);
      await customers.search(phone);
      await expect(typeCell).toContainText("VIP");
    } finally {
      if (customerId) await deleteCustomerRow(customerId);
    }
  });
});
