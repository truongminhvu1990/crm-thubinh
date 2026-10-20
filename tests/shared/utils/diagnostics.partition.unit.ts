import test from "node:test";
import assert from "node:assert/strict";
import {
  partitionDiagnostics,
  type ConsoleErrorEvent,
  type ExpectedDiagnostics,
  type NetworkFailure,
} from "./diagnostics";
import { NETWORK_FAILURE_DIAGNOSTICS, SERVER_ERROR_DIAGNOSTICS } from "../../products/productsLoadDiagnostics";

// partitionDiagnostics is the filter behind autoDiagnostics (tests/shared/fixtures.ts), so a mistake here silently
// widens what every Playwright test accepts. It is a pure function: no browser, login or Dev access is needed.
// Run explicitly (it is not named *.test.ts / *.spec.ts, so neither `npm test` nor Playwright's testDir picks it up):
//   node --import tsx --test tests/shared/utils/diagnostics.partition.unit.ts

const consoleEvent = (text: string, url = ""): ConsoleErrorEvent => ({ kind: "console", text, url });
const pageError = (text: string): ConsoleErrorEvent => ({ kind: "pageerror", text, url: "" });
const net = (status: number, url: string): NetworkFailure => ({ status, url });
const declare = (d: ExpectedDiagnostics): Required<ExpectedDiagnostics> => ({
  consoleErrors: d.consoleErrors ?? [],
  network5xx: d.network5xx ?? [],
});

const API = /\/api\/products$/;
const NONE = declare({});

test("nothing observed and nothing declared: all three results are empty", () => {
  assert.deepEqual(partitionDiagnostics([], [], NONE), { unexpectedConsole: [], unexpectedNetwork: [], missing: [] });
});

test("nothing declared: console, pageerror and 5xx are all reported, in the order observed", () => {
  const failures = [net(500, "http://x/api/a"), net(503, "http://x/api/b")];
  const result = partitionDiagnostics([consoleEvent("first"), pageError("second"), consoleEvent("third")], failures, NONE);
  assert.deepEqual(result.unexpectedConsole, ["first", "second", "third"]);
  assert.deepEqual(result.unexpectedNetwork, failures);
  assert.deepEqual(result.missing, []);
});

test("a declared rule that matches the observed event accepts it", () => {
  const result = partitionDiagnostics(
    [consoleEvent("Failed to load resource: 500", "http://x/api/products")],
    [net(500, "http://x/api/products")],
    declare({
      consoleErrors: [{ text: /Failed to load resource/, url: API }],
      network5xx: [{ status: 500, url: API }],
    })
  );
  assert.deepEqual(result, { unexpectedConsole: [], unexpectedNetwork: [], missing: [] });
});

test("a declared rule that never occurred is reported as missing", () => {
  const result = partitionDiagnostics(
    [],
    [],
    declare({ consoleErrors: [{ text: /boom/, url: API }], network5xx: [{ status: 500, url: API }] })
  );
  assert.deepEqual(result.unexpectedConsole, []);
  assert.deepEqual(result.unexpectedNetwork, []);
  assert.deepEqual(result.missing, [
    `console error text /boom/ from ${API}`,
    `500 response from ${API}`,
  ]);
});

test("same message from a different URL is NOT accepted when the rule names a URL", () => {
  const result = partitionDiagnostics(
    [consoleEvent("boom", "http://x/api/orders")],
    [],
    declare({ consoleErrors: [{ text: /boom/, url: API }] })
  );
  assert.deepEqual(result.unexpectedConsole, ["boom"]);
  assert.equal(result.missing.length, 1);
});

test("a different HTTP status is NOT accepted by a rule for another status", () => {
  const failure = net(503, "http://x/api/products");
  const result = partitionDiagnostics([], [failure], declare({ network5xx: [{ status: 500, url: API }] }));
  assert.deepEqual(result.unexpectedNetwork, [failure]);
  assert.deepEqual(result.missing, [`500 response from ${API}`]);
});

test("a URL with a query string is NOT accepted by a rule anchored with $", () => {
  const failure = net(500, "http://x/api/products?page=2");
  const result = partitionDiagnostics([], [failure], declare({ network5xx: [{ status: 500, url: API }] }));
  assert.deepEqual(result.unexpectedNetwork, [failure]);
  assert.deepEqual(result.missing, [`500 response from ${API}`]);
});

test("a pageerror is never swallowed by a console rule, even with identical text", () => {
  const result = partitionDiagnostics([pageError("boom")], [], declare({ consoleErrors: [{ text: /boom/ }] }));
  assert.deepEqual(result.unexpectedConsole, ["boom"]);
  assert.equal(result.missing.length, 1);
});

test("an unrelated error next to a declared one is still reported", () => {
  const result = partitionDiagnostics(
    [consoleEvent("expected failure"), consoleEvent("something else broke")],
    [net(500, "http://x/api/products"), net(500, "http://x/api/orders")],
    declare({ consoleErrors: [{ text: /expected failure/ }], network5xx: [{ status: 500, url: API }] })
  );
  assert.deepEqual(result.unexpectedConsole, ["something else broke"]);
  assert.deepEqual(result.unexpectedNetwork, [net(500, "http://x/api/orders")]);
  assert.deepEqual(result.missing, []);
});

// The two tests below pin KNOWN LIMITS of the current design, not desired behavior. If a count limit or a
// mandatory URL is added later, these are the tests that should change.

test("known limit: a rule without a URL accepts a matching message from any source", () => {
  const result = partitionDiagnostics(
    [consoleEvent("TypeError: Failed to fetch", "http://x/a.js"), consoleEvent("TypeError: Failed to fetch", "http://x/b.js")],
    [],
    declare({ consoleErrors: [{ text: /Failed to fetch/ }] })
  );
  assert.deepEqual(result.unexpectedConsole, []);
});

test("known limit: one rule accepts any number of matching events", () => {
  const events = Array.from({ length: 5 }, () => consoleEvent("boom"));
  const result = partitionDiagnostics(events, [], declare({ consoleErrors: [{ text: /boom/ }] }));
  assert.deepEqual(result, { unexpectedConsole: [], unexpectedNetwork: [], missing: [] });
});

test("many diagnostics: unexpected ones keep their observed order and none is silently dropped", () => {
  const events = [
    consoleEvent("e1"),
    consoleEvent("accepted-a"),
    pageError("e2"),
    consoleEvent("e3"),
    consoleEvent("accepted-b"),
    consoleEvent("e4"),
  ];
  const failures = [net(500, "http://x/api/z"), net(500, "http://x/api/products"), net(502, "http://x/api/y")];
  const result = partitionDiagnostics(
    events,
    failures,
    declare({ consoleErrors: [{ text: /^accepted-/ }], network5xx: [{ status: 500, url: API }] })
  );
  assert.deepEqual(result.unexpectedConsole, ["e1", "e2", "e3", "e4"]);
  assert.deepEqual(result.unexpectedNetwork, [net(500, "http://x/api/z"), net(502, "http://x/api/y")]);
  // every observed event is either accepted by a rule (2 console, 1 network) or reported
  assert.equal(result.unexpectedConsole.length + 2, events.length);
  assert.equal(result.unexpectedNetwork.length + 1, failures.length);
  assert.deepEqual(result.missing, []);
});

test("the same input always gives the same result", () => {
  const events = [consoleEvent("a", "/x"), pageError("b"), consoleEvent("c")];
  const failures = [net(500, "/api/products"), net(503, "/other")];
  const declared = declare({ consoleErrors: [{ text: /c/ }], network5xx: [{ status: 500, url: API }] });
  assert.deepEqual(partitionDiagnostics(events, failures, declared), partitionDiagnostics(events, failures, declared));
});

// The tests below run the REAL rules from tests/products/productsLoadDiagnostics.ts against representative events.
// The stack-trace shape ("at loadProducts (...)") is an assumption about Chromium's console text until a Products
// load-state run in a browser confirms it; these tests pin what the rules are meant to accept and reject.

const productsLog = (message: string) => `${message}\n    at loadProducts (http://localhost:3000/_next/static/chunks/page.js:10:5)`;
const PRODUCTS_URL = "http://localhost:3000/api/products";

test("Products rules (HTTP 500): accept exactly the expected diagnostics", () => {
  const result = partitionDiagnostics(
    [
      consoleEvent("Failed to load resource: the server responded with a status of 500 ()", PRODUCTS_URL),
      consoleEvent(productsLog("Error: Failed to load products: HTTP 500"), "http://localhost:3000/_next/static/chunks/page.js"),
    ],
    [net(500, PRODUCTS_URL)],
    declare(SERVER_ERROR_DIAGNOSTICS)
  );
  assert.deepEqual(result, { unexpectedConsole: [], unexpectedNetwork: [], missing: [] });
});

test("Products rules (network failure): accept exactly the expected diagnostics", () => {
  const result = partitionDiagnostics(
    [
      consoleEvent("Failed to load resource: net::ERR_FAILED", PRODUCTS_URL),
      consoleEvent(productsLog("TypeError: Failed to fetch"), "http://localhost:3000/_next/static/chunks/page.js"),
    ],
    [],
    declare(NETWORK_FAILURE_DIAGNOSTICS)
  );
  assert.deepEqual(result, { unexpectedConsole: [], unexpectedNetwork: [], missing: [] });
});

test("Products rules: declared but nothing happened reports every rule as missing", () => {
  assert.equal(partitionDiagnostics([], [], declare(SERVER_ERROR_DIAGNOSTICS)).missing.length, 3);
  assert.equal(partitionDiagnostics([], [], declare(NETWORK_FAILURE_DIAGNOSTICS)).missing.length, 2);
});

test("Products rules: unrelated errors are NOT accepted", () => {
  const unrelatedConsole = [
    // a failed fetch somewhere else in the page
    consoleEvent("TypeError: Failed to fetch\n    at loadStats (http://localhost:3000/_next/static/chunks/dash.js:1:1)", "http://localhost:3000/_next/static/chunks/dash.js"),
    // the app's own message with no loadProducts frame
    consoleEvent("Failed to load products: HTTP 500", "http://localhost:3000/_next/static/chunks/page.js"),
    // Chromium's report for another endpoint
    consoleEvent("Failed to load resource: the server responded with a status of 500 ()", "http://localhost:3000/api/orders"),
    consoleEvent("Failed to load resource: net::ERR_FAILED", "http://localhost:3000/api/orders"),
    // right text, but not at the start of the message
    consoleEvent("Warning: Failed to load resource: net::ERR_FAILED", PRODUCTS_URL),
    // an uncaught exception is never covered, whatever it says
    pageError(productsLog("TypeError: Failed to fetch")),
  ];
  const unrelatedNetwork = [net(503, PRODUCTS_URL), net(500, `${PRODUCTS_URL}?page=2`), net(500, "http://localhost:3000/api/orders")];

  for (const rules of [SERVER_ERROR_DIAGNOSTICS, NETWORK_FAILURE_DIAGNOSTICS]) {
    const result = partitionDiagnostics(unrelatedConsole, unrelatedNetwork, declare(rules));
    assert.equal(result.unexpectedConsole.length, unrelatedConsole.length);
    assert.equal(result.unexpectedNetwork.length, unrelatedNetwork.length);
  }
});

test("Products rules: the HTTP 500 rules do not accept the network-failure diagnostics, and the reverse", () => {
  const networkFailureEvents = [
    consoleEvent("Failed to load resource: net::ERR_FAILED", PRODUCTS_URL),
    consoleEvent(productsLog("TypeError: Failed to fetch")),
  ];
  assert.equal(partitionDiagnostics(networkFailureEvents, [], declare(SERVER_ERROR_DIAGNOSTICS)).unexpectedConsole.length, 2);

  const serverErrorEvents = [
    consoleEvent("Failed to load resource: the server responded with a status of 500 ()", PRODUCTS_URL),
    consoleEvent(productsLog("Error: Failed to load products: HTTP 500")),
  ];
  assert.equal(partitionDiagnostics(serverErrorEvents, [], declare(NETWORK_FAILURE_DIAGNOSTICS)).unexpectedConsole.length, 2);
});
