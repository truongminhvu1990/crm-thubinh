Package: Production Migration Audit

Goal

Audit Production schema against all migrations.

Scope

- supabase/migrations
- Production database

Tasks

1. Compare every migration with the current Production schema.

2. Produce 4 lists:

A. Applied correctly

B. Missing on Production

C. Partially applied

D. Obsolete / superseded

3. For every missing migration:

- Filename
- Reason
- Risk
- Safe to apply? (YES/NO)
- Dependency

4. For every partially applied migration:

Explain exactly which objects are missing.

Rules

Do NOT modify code.

Do NOT generate SQL.

Do NOT generate migrations.

Investigation only.

Output

Executive Summary

Migration Matrix

Recommended execution order