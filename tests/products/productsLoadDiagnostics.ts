import type { ExpectedDiagnostics } from "../shared/utils/diagnostics";

// Diagnostics the "Products list load states" tests provoke on purpose (see autoDiagnostics in
// tests/shared/fixtures.ts). Each test declares only what its own stub causes; the fixture fails the test if any of
// it does not occur, and still fails on every other console error or 5xx. Kept apart from the spec so that
// diagnostics.partition.unit.ts can check these exact rules against unrelated errors.
export const PRODUCTS_API = /\/api\/products$/;

// app/products/page.tsx logs through console.error(error), so the source of those messages is the page bundle and no
// URL can be required. The stack must pass through loadProducts instead, so the same text from another fetch is not accepted.
export const SERVER_ERROR_DIAGNOSTICS: ExpectedDiagnostics = {
  network5xx: [{ status: 500, url: PRODUCTS_API }],
  consoleErrors: [
    // Chromium's own report of the failed request.
    { text: /^Failed to load resource: the server responded with a status of 500/, url: PRODUCTS_API },
    { text: /Failed to load products: HTTP 500[\s\S]*\bloadProducts\b/ },
  ],
};

export const NETWORK_FAILURE_DIAGNOSTICS: ExpectedDiagnostics = {
  consoleErrors: [
    { text: /^Failed to load resource: net::ERR_FAILED/, url: PRODUCTS_API },
    // "Failed to fetch" alone is what ANY failed fetch logs.
    { text: /TypeError: Failed to fetch[\s\S]*\bloadProducts\b/ },
  ],
};
