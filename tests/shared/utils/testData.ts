/**
 * Unique, throwaway test data for QA Wave 1 - every Create scenario uses
 * these instead of hardcoded names/codes/phones so tests can run alone,
 * in parallel, and repeatedly without colliding with each other or with
 * real data already in the Dev database.
 */
function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
}

export function qaCustomerName(): string {
  return `QA Customer ${uniqueSuffix()}`;
}

/** VN-style 10-digit mobile number (0 + 9 digits), unique per call. */
export function qaCustomerPhone(): string {
  const digits = uniqueSuffix().slice(-9).padStart(9, "0");
  return `0${digits}`;
}

export function qaProductName(): string {
  return `QA Product ${uniqueSuffix()}`;
}

export function qaProductCode(): string {
  return `QA-${uniqueSuffix()}`;
}

/**
 * QA Wave 2 (Orders) - customers.customer_code is NOT NULL/UNIQUE with no
 * DB default, so any customer created directly via the DB (as an Orders
 * test's precondition fixture, not the thing under test) needs one
 * supplied explicitly.
 */
export function qaCustomerCode(): string {
  return `QA-${uniqueSuffix()}`;
}
