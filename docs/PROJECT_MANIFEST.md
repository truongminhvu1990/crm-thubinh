# Vision

CRM Thu Bình becomes the single system of record for the jade/jewelry business — the one place that reliably knows every customer, every product, every sale, and every deal in progress, so that decisions (pricing, inventory, follow-up, marketing) are made from real data instead of staff memory and disconnected spreadsheets.

# Mission

Replace ad hoc, disconnected records (one-off purchase rows, hand-edited inventory counters, memory-based follow-ups) with a properly modeled CRM — built module by module, business design first — that captures how jade/jewelry is actually sold (negotiated pricing, partial payments, reservations, multi-week sales pipelines) and that is structured from day one to also serve future reporting and AI use cases, not just today's screens.

# Development Rules

Summary of the currently approved Project Rules (V1.1, supersedes V1.0):

- **Role** — Development Engineer only. No unilateral business or architecture decisions; only approved specifications get implemented.
- **Environments** — Development and Production. All work happens in Development only. Production is read-only unless the user explicitly says **"OK Merge."**
- **Implementation** — never modify Production; never redesign business logic, UI, or architecture; never implement outside the requested scope; never touch unrelated modules.
- **Database** — no schema changes until the Product Owner approves Database Design; never add, rename, or drop tables/columns unilaterally; never delete or truncate data; migrations only after explicit approval.
- **Specifications** — once approved, a spec document is read-only; further changes are made as a new Revision (Revision 2, 3, ...), not edits to the approved version, and each revision needs its own Product Owner approval.
- **Fields** — no new field is created without explicit Product Owner approval.
- **Impact** — if a request affects another module: stop, print an Impact Analysis, and wait for approval before proceeding.
- **Definition of Done** — every task ends with `tsc`, `eslint`, `next build`, and Playwright (if UI), then stop and wait for review — never continue automatically.
- **Module ownership** — work is scoped to the current module (see Sprint Roadmap); other modules are not touched unless explicitly requested.

# Development Workflow

```
Feature
   ↓
Business Design
   ↓
Product Review
   ↓
Database Design
   ↓
Product Review
   ↓
UI Design
   ↓
Product Review
   ↓
Development
   ↓
Testing
   ↓
User Acceptance Test
   ↓
OK Merge
   ↓
Production
```

# Branch Strategy

- **Development** — all work lands here: features, migrations, SQL, UI, refactors, experiments.
- **Production** — the live environment. Read-only from a development standpoint; only advances when the user explicitly says "OK Merge."

# Version Policy

- **Development** — `vNext-beta`
- **Production** — Stable Release

# Definition Of Done

- [ ] Business Approved
- [ ] Database Approved
- [ ] UI Approved
- [ ] Implementation Complete
- [ ] Migration Complete
- [ ] tsc Passed
- [ ] eslint Passed
- [ ] next build Passed
- [ ] Playwright Passed
- [ ] User Acceptance Test Passed
- [ ] User says OK Merge

# Module Status

| Module | Status |
|---|---|
| Customer | LOCKED |
| Product | LOCKED |
| Batch | LOCKED |
| Settings | LOCKED |
| Orders | IN PROGRESS |
| Inventory | PLANNED |
| Reports | PLANNED |
| Jade Intelligence | DESIGN |
| Market Intelligence | DESIGN |
| Marketing | PLANNED |

# Sprint Roadmap

- **Sprint 1** — Orders
- **Sprint 2** — Inventory
- **Sprint 3** — Reports
- **Sprint 4** — Dashboard
- **Sprint 5** — Jade Intelligence
- **Sprint 6** — Market Intelligence

# Architecture Principles

1. **Business Design First** — No implementation before business approval.
2. **One Module At A Time** — Only one CRM module may be under active development.
3. **Development First** — All work happens in Development. Production changes require explicit **OK Merge**.
4. **Product Owner Approval** — Business, Architecture, Database, and UI must each be approved before implementation.
5. **Single Source Of Truth** — Approved documents inside `/docs` are the only source of truth.

# Document Rules

All future specifications must be stored inside `/docs`.
