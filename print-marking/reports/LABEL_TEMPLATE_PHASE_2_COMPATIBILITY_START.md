# Label Template Phase 2 — Compatibility Start Record

## Date

2026-08-08

## Scope

Start Phase 2 of `print_marking_label_template_phases` against the active
Printer Adapter implementation.

## Verified Starting State

- `printer.db` already owns `label_templates` and immutable historical
  `label_template_versions` snapshots.
- Live print consumers and the default-template repository currently select
  templates with legacy status `published`.
- The Kiosk label-template proxy is deployed separately and must continue to
  read legacy templates while Phase 2 evolves the model.
- The Adapter has no authoritative template audit, asset/profile tables, or
  printer-owned transactional outbox yet.
- The current checkout has no established Kiosk Playwright/E2E harness.

## Compatibility Decision

1. Preserve `published` as a legacy read alias for the new `ACTIVE` lifecycle
   state until every consumer and deployed Kiosk image understands `ACTIVE`.
2. Add new tables and nullable/additive columns only; do not drop or rename
   existing SQLite columns or delete template rows.
3. New lifecycle commands write state, audit, and an outbox message through
   the same `PrinterDbContext` transaction.
4. Existing `publish`, `archive`, and `set-default` endpoints remain usable
   during migration and delegate to compatible lifecycle transitions.
5. Add regression tests before switching production print resolution from the
   legacy status predicate.

## Known Gaps to Close

- Typed lifecycle and maker-checker approval
- Template audit and transactional outbox
- Asset, variant, reference, and printer-profile persistence
- Canonical validation at command boundaries
- Deterministic seed coverage
- Backend integration tests and Kiosk UI E2E harness

## Data Safety

The Phase 2 migration is additive. Existing published templates continue to
resolve for print jobs. No physical-print behavior is changed by the initial
schema/lifecycle increment.
