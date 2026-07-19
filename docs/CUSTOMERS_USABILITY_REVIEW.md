# Customers Module — Usability Review

Review-only audit of the Customers module (`app/customers/`, `components/customer/*`) against the 10 requested dimensions. No code was changed, no UI was implemented, no business rule was altered — every finding below is a suggestion for the Product Owner to prioritize, not a change already made.

---

## 1. Data entry workflow

**Problem:** The same modal/form is reused for Add and Edit, and the list fully reloads (`loadCustomers()` — a fresh `getCustomers()` + `getPurchaseSummaries()` round trip) after every single save or delete, rather than updating the affected row in place.
**Impact:** Every save shows a brief full-list loading state even for a one-field edit, adding a visible pause during high-volume data entry (e.g. entering many customers back-to-back at a sales event).
**Suggested improvement:** Update the saved/deleted customer in local state directly and skip the full refetch, reserving a full reload for explicit "Làm mới."
**Priority:** Low

**Problem:** No "Save and add another" option — after saving a new customer, the modal closes and the operator must click "Thêm khách" again and wait for the modal to reopen.
**Impact:** Adds friction when entering a batch of new customers in one sitting (e.g. after an event or trade show).
**Suggested improvement:** Add an optional "Lưu và thêm mới" action alongside "Lưu."
**Priority:** Low

---

## 2. Required fields

**Problem:** Only `full_name` and `phone` are enforced, and only via a blocking `alert()` at save time (`app/customers/page.tsx`) — `CustomerForm` supports per-field inline error display (`error` prop on `Input`), but `CustomerModal` never passes an `errors` object into it, so that UI path is unreachable.
**Impact:** A data-entry operator who forgets a required field gets a generic browser alert instead of a highlighted field, and has to re-scan the whole form to find what's missing — slower correction, worse experience on a long form.
**Suggested improvement:** Wire per-field `errors` from the page into `CustomerModal` → `CustomerForm` so the existing inline-error styling activates instead of (or alongside) the alert.
**Priority:** High

**Problem:** `customer_code` has no asterisk/required marker and no validation, despite being the business identifier shown throughout the list and used in search.
**Impact:** A customer can be saved with a blank code, which then shows as an empty line under their name in `CustomerTable` and can't be searched by code.
**Suggested improvement:** Decide (Product Owner call) whether `customer_code` should be required, and if so, validate it the same way as name/phone.
**Priority:** Medium

---

## 3. Optional fields

**Problem:** The form has 3 sections and roughly 20 optional fields (address, gender, occupation, Facebook, Zalo, country/market/district, wrist size, ring size, budget, favorite type/color, preferred origin, purpose, stage, source, salesperson, last viewed product) all shown at once, with no progressive disclosure.
**Impact:** For a quick "just get the phone number down" entry, the operator scrolls past a long form of fields that usually stay empty at first contact — this is a throughput cost specifically for the most common real-world entry pattern (a new lead with minimal info).
**Suggested improvement:** Consider collapsing "Sở thích đá quý" and "Kinh doanh" behind an expandable section by default, leaving only "Cơ bản" open — a layout change, not a business-rule or required-field change.
**Priority:** Low

---

## 4. Search experience

**Problem:** `getCustomers()` fetches the entire customer table on every page load and every "Làm mới," then all filtering/searching happens client-side in memory — there is no server-side search or pagination.
**Impact:** Fine at today's likely data volume, but as real Production data entry accumulates, list load time will grow linearly with total customer count, with no ceiling.
**Suggested improvement:** Not urgent now; flag as a forward-looking scalability item once customer count reaches the low thousands.
**Priority:** Low (monitor)

**Problem:** Search only matches `full_name`, `customer_code`, and `phone` — it does not search `facebook`, `zalo`, `address`, or notes content.
**Impact:** An operator who only remembers a customer's Zalo handle or a note detail can't find them by that.
**Suggested improvement:** Consider extending the search fields (Product Owner call on scope).
**Priority:** Low

---

## 5. Filter experience

**Problem:** Four independent filters (type, revenue, country, market) each thread through a 6-argument `filterCustomers(...)` call repeated in five separate handler functions in `app/customers/page.tsx` — functionally correct today, but there's no single "Xóa bộ lọc" (clear all filters) action; each filter must be reset to "Tất cả" individually.
**Impact:** After a multi-filter search, returning to the full list takes 4 separate clicks instead of 1.
**Suggested improvement:** Add a single "Clear filters" control.
**Priority:** Low

**Problem:** The Market filter list (`useMasterDataOptions("market")`) shows every configured market regardless of whether any customer actually has that value, and there's no filter for customers with an *empty* market/country/source (e.g. "chưa có thị trường").
**Impact:** Can't quickly find incompletely-entered customer records to follow up and complete them.
**Suggested improvement:** Consider adding a "Chưa xác định" filter option for empty values (Product Owner call).
**Priority:** Low

---

## 6. Duplicate prevention

**Problem:** There is no duplicate check anywhere in the Customer flow — not client-side, not server-side, not a database constraint — for `phone` or `customer_code`. Two customers can be saved with the identical phone number or the identical code with no warning at all.
**Impact:** In a business built around personal customer relationships (jade/jewelry, VIP tracking, follow-ups), duplicate customer records fragment purchase history and follow-up notes across two records, undermining the CRM's core value — this is the most consequential finding in this review.
**Suggested improvement:** Add a duplicate check (e.g. an existing-phone lookup before insert, following the same pattern as Settings' `isDuplicateValue`) that at minimum warns the operator, even if it doesn't hard-block (some real-world cases legitimately share a phone, e.g. a family).
**Priority:** High

---

## 7. Customer Detail page

**Problem:** The detail page is comprehensive — profile header, Notes Timeline, Purchase History, Jade Preferences ("Wishlist"), Matching Products, and Follow-up — and correctly hides empty optional fields rather than showing blank labels. This section is a strength, not a gap.
**Impact:** N/A — noted for completeness of the review, not a problem.
**Suggested improvement:** None.
**Priority:** N/A

**Problem:** `CustomerMatchingProducts` re-runs `getMatchingProducts()` on every visit to a customer's detail page, and again whenever any wishlist field changes — there is no indication to the operator of *why* a product matched beyond small badges, and no way to dismiss/hide a suggestion that isn't relevant.
**Impact:** Minor — the feature works, but repeated identical fetches on every page visit (no caching) add a small delay each time a customer is opened.
**Suggested improvement:** Low priority; not a blocker for daily use.
**Priority:** Low

---

## 8. Edit workflow

**Problem:** Same root cause as §2 — editing a customer reuses `CustomerModal`, which still never passes `errors` into `CustomerForm`, so correcting a validation mistake mid-edit shows the same generic `alert()` rather than a highlighted field.
**Impact:** Same as §2, applied to the edit path specifically — an operator fixing a customer's phone number gets no visual cue about which field the alert refers to if there's more than one issue.
**Suggested improvement:** Same fix as §2 covers both Add and Edit, since they share the same modal.
**Priority:** High (tracked once, applies to both flows)

**Problem:** Editing from the Customer Detail page (`app/customers/[id]/page.tsx`) and editing from the Customer List (`app/customers/page.tsx`) are two separate code paths with separate `isSavingEdit`/`isLoading` state and separate error handling, rather than one shared edit flow.
**Impact:** Low risk today since both paths call the same `updateCustomer()`, but any future validation change must be applied in two places instead of one.
**Suggested improvement:** Noted for future refactor consideration; not urgent.
**Priority:** Low

---

## 9. Mobile usability

**Problem:** `CustomerTable`'s Edit/Delete action buttons use `opacity-0 group-hover:opacity-100` — they are invisible until a `:hover` state fires. Touchscreens have no reliable hover state; on most mobile browsers this means the buttons either never appear or require an extra "hover-simulating" first tap before they become tappable.
**Impact:** On a phone or tablet — the devices most likely to be used for on-the-floor customer entry during a sales conversation — editing or deleting a customer from the list can be difficult or effectively impossible to discover.
**Suggested improvement:** Make action buttons always-visible (or reveal on tap) on touch/narrow viewports, reserving the hover-fade behavior for desktop pointer input.
**Priority:** High

**Problem:** `CustomerTable` renders as `<table className="w-full min-w-[1160px]">` inside a horizontally-scrolling container — on a phone, the entire table scrolls sideways, and a user must scroll right to see revenue/last-purchase columns while the customer's name scrolls out of view.
**Impact:** Harder to correlate a row's data on small screens; a common but sub-optimal mobile table pattern.
**Suggested improvement:** Consider a card-based list layout on narrow viewports as an alternative to the horizontally-scrolling table (design decision for Product Owner/UI phase, not proposed here as an implementation).
**Priority:** Medium

**Problem:** `CustomerModal` wraps the entire multi-section `CustomerForm` in a fixed `max-h-96` (384px) internally-scrolling container, inside a modal that's already constrained to `max-w-lg`.
**Impact:** On a phone screen, this creates a small scrollable box within a scrollable box — a cramped double-scroll experience for a form with ~20 fields across 3 sections, worse than simply letting the modal use the full viewport height on small screens.
**Suggested improvement:** On narrow viewports, let the form scroll with the page/modal itself rather than in a fixed-height inner box.
**Priority:** Medium

---

## 10. Daily operation efficiency

**Problem:** Opening the Add/Edit Customer modal triggers 7 separate, uncached network round trips — `useTagOptions` (jade_type, favorite_color, purchase_purpose) and `useMasterDataOptions` (customer_stage, salesperson, country, market) each fetch independently on every mount, with no shared cache across modal opens. The Customer List page's own filter dropdowns (`market`, `country`) add 2 more fetches on page load.
**Impact:** Every single "Thêm khách" click during a busy data-entry session re-fetches option lists (salesperson names, customer stages, countries, markets, jade types, colors, purposes) that rarely change within a session — adding avoidable latency to the most frequent action in this module.
**Suggested improvement:** Cache master-data/tag-option lists at a level shared across modal opens (e.g. fetched once per page load or per session) instead of re-fetching per mount.
**Priority:** Medium

**Problem:** There is no keyboard-only fast path for rapid sequential entry — after saving a customer, focus is not returned to a "start next entry" control, and Enter does not submit the form from within a text field.
**Impact:** For high-volume manual entry sessions (e.g. digitizing a paper customer list), each entry requires several mouse clicks rather than a keyboard-driven rhythm.
**Suggested improvement:** Consider Enter-to-save and auto-refocus for rapid entry sessions (Product Owner call on whether this fits the real workflow).
**Priority:** Low

---

## Summary — Priority tally

| Priority | Findings |
|---|---|
| **High** | Missing inline validation (Add + Edit share one fix), no duplicate phone/code prevention, mobile action buttons invisible on touch (`group-hover`) |
| **Medium** | `customer_code` required-status undecided, mobile table layout, mobile modal scroll behavior, uncached master-data fetches on every modal open |
| **Low** | Full-list refetch after save, no "save and add another," long single-scroll form, search field scope, filter clear-all, empty-value filters, matching-products re-fetch, dual edit code paths, no rapid-entry keyboard flow |

No code changed. No UI implemented. No business rule altered. Stopping — waiting for Product Owner review.
