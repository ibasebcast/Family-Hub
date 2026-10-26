# Family Hub architecture

## Release status

This is a **development foundation, not a feature-complete release**. Do not install it expecting functional chores, calendars, cards, or dashboards yet.

## Design rules

1. Household data is private to the user's Home Assistant installation, never committed to GitHub.
2. Setup requires only a household name; all optional modules are configured afterward.
3. Persistent data is versioned. Unknown schema versions must fail safely rather than overwrite existing records.
4. Child and adult permissions must be enforced on the backend, not just by hiding buttons.
5. Every mutation must be validated, auditable, and protected against concurrent updates.
6. Frontend resources must register automatically; dashboards must be generated from reusable templates and remain editable.
7. Integration updates must preserve user customization, assignments, balances, and history.
8. Code must be readable, separated by responsibility, and commented where behavior is non-obvious.

## Required before first user testing

Chores and schedules; approvals; rewards and transaction ledger; routines; Google and local calendar adapters; meals; shopping; notifications; wall kiosk; per-member dashboards; room controls; permissions; export/restore; migration tests; automatic card registration; editable dashboard generation; documented installation; end-to-end testing.
