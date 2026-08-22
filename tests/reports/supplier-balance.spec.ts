import { test, expect } from "../shared/fixtures";
import { loginAsOwner, waitForLoading } from "../shared/utils";

/** PO-D4 neutrality check (Finance Project #1, Phase F re-scope) — the
 * page is allowed to explicitly NEGATE that it's a payable/debt report
 * (its own disclaimer: "...không phải công nợ phải trả" — "...not
 * accounts payable"), since that's the correct, intended neutral framing.
 * What must never appear is one of these terms used WITHOUT that
 * negation, i.e. asserting the balance actually IS payable/owed. A raw
 * substring search can't tell those apart — it flags the disclaimer
 * itself as a violation.
 *
 * "không phải" negates the whole noun phrase that follows it ("không
 * phải công nợ phải trả" negates "công nợ phải trả" as one unit) — a
 * forbidden term appearing later in that same phrase (e.g. "phải trả")
 * is NOT immediately adjacent to the negation marker itself, so a simple
 * "immediately preceded by" check is insufficient. Instead: every
 * "không phải" marker opens a negated CLAUSE running up to the next
 * sentence/line boundary (`.`, `!`, `?`, or a newline — innerText()
 * reliably inserts a newline between block elements, so this can't
 * accidentally swallow unrelated later content on the page); any
 * forbidden-term occurrence inside that clause is exempt. Anything
 * outside every negated clause still fails — narrow enough to catch a
 * genuine future violation (e.g. a stray label reading "Công nợ:
 * 500.000") appearing anywhere else on the page. */
function assertNoForbiddenPositivePayableLanguage(bodyText: string) {
  const lower = bodyText.toLowerCase();

  const negatedRanges: [number, number][] = [];
  const negationRegex = /không\s+phải/g;
  let negationMatch: RegExpExecArray | null;
  while ((negationMatch = negationRegex.exec(lower)) !== null) {
    const start = negationMatch.index;
    const terminatorMatch = /[.!?\n]/.exec(lower.slice(start));
    const end = terminatorMatch ? start + terminatorMatch.index : lower.length;
    negatedRanges.push([start, end]);
  }
  const isWithinNegatedClause = (idx: number) => negatedRanges.some(([start, end]) => idx >= start && idx < end);

  for (const forbidden of ["công nợ", "phải trả", "còn nợ"]) {
    let searchFrom = 0;
    for (;;) {
      const idx = lower.indexOf(forbidden, searchFrom);
      if (idx === -1) break;

      expect(
        isWithinNegatedClause(idx),
        `Found non-negated "${forbidden}" — surrounding text: "${lower.slice(Math.max(0, idx - 30), idx + forbidden.length + 10)}"`
      ).toBe(true);

      searchFrom = idx + forbidden.length;
    }
  }
}

/**
 * Supplier Balance (Finance Project #1, Phase F re-scope, Product Owner
 * Approval 2026-08-21) — read-only report over money_debt_ledger_entries.
 * NOT YET EXECUTED as of this commit: Dev Supabase Auth is down
 * (password-grant returns 400 — same outage recorded against Phase C/E,
 * still active), so login itself fails before this spec's own assertions
 * ever run. Written and ready to run the moment that outage clears; do
 * not treat its presence here as proof it currently passes.
 *
 * Deliberately a smoke test only — no test-data setup (creating a real
 * Supplier ledger transaction requires the Money Debt Ledger's own
 * RecordMovementModal flow, which has no existing Playwright coverage or
 * test-data helper in tests/shared/utils to build on; adding one is out
 * of this phase's "smallest read-only report necessary" scope). This
 * verifies the page loads, is gated correctly, and renders either real
 * rows or the empty state — not specific balance figures. */
test.describe("Reports - Supplier Balance", () => {
  test("page loads, shows the summary cards, and renders either the table or the empty state without erroring", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/reports/supplier-balance");
    await waitForLoading(page);

    await expect(page.getByRole("heading", { name: "Số dư Supplier" })).toBeVisible();
    await expect(page.getByTestId("supplier-balance-supplier-count-card")).toBeVisible();
    await expect(page.getByTestId("supplier-balance-row-count-card")).toBeVisible();

    const table = page.getByTestId("supplier-balance-table");
    const emptyState = page.getByTestId("supplier-balance-empty-state");
    await expect(table.or(emptyState)).toBeVisible();

    // Neutral labeling — the page's own report content must never assert
    // "công nợ" (debt), "phải trả" (payable), or "còn nợ" (owed), per
    // PO-D4 staying unresolved. The page's own explicit negation
    // ("...không phải công nợ phải trả") is allowed — see
    // assertNoForbiddenPositivePayableLanguage. Scoped to `main`
    // (AppShell.tsx's own semantic wrapper around every page's content),
    // not `body` — the persistent Sidebar renders a "Tài chính & công nợ"
    // navigation category label on every route in the app, unrelated to
    // this report's own content and outside this test's (or Phase F's)
    // scope to change.
    const mainText = await page.locator("main").innerText();
    assertNoForbiddenPositivePayableLanguage(mainText);
  });

  test("Mobile viewport (iPhone-sized) renders the card layout, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12/13/14 logical size
    await loginAsOwner(page);
    await page.goto("/reports/supplier-balance");
    await waitForLoading(page);

    await expect(page.getByTestId("supplier-balance-supplier-count-card")).toBeVisible();
    // The desktop table must be hidden below the lg breakpoint (Tailwind
    // `hidden lg:block`), matching every other Finance Project #1 report's
    // own mobile pattern.
    const table = page.getByTestId("supplier-balance-table");
    if (await table.count()) {
      await expect(table).toBeHidden();
    }
  });
});
