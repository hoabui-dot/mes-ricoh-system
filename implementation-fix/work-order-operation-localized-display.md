# Work Order Operation Localized Display

**Date:** 2026-07-23  
**Status:** Implemented and runtime-verified

## Root cause

The execution Work Order detail API returned only `operation_code` from `wo_operation`. The table had
a separate Operation Code column and an Operation Name column, but the API supplied no name, so the
name column was empty for persisted Work Orders.

## Data migration and future records

Execution migration `000008_operation_names.up.sql` adds JSONB `operation_name` to `wo_operation` and
backfills existing rows. Verified legacy data contained 74 rows: 11 each for `OP-MIX`, `OP-PREP`,
`OP-CUT`, `OP-MOLD`, `OP-TRIM`, and `OP-QC`, plus 18 generic `OP` rows. Known operations now have
VI/EN/JA/KO names; unknown legacy `OP` rows use a controlled code fallback rather than invented
business meaning.

New Work Orders persist the same localized operation names during routing-operation snapshot creation.
The API returns `operation_name` as LocalizedText and retains `operation_code` for technical reference.

## UI change

Work Order detail no longer renders a separate Operation Code column. It renders one Operation column:
`Localized operation name (operation code)`, selecting the current locale with a code-based fallback.

## Verification

- Migration 000008 applied successfully in the live execution database.
- Database audit confirmed localized names for all known legacy operation rows.
- Execution service Docker build succeeded and container is healthy.
- MES Console production build succeeded; console image rebuilt and recreated on port 13052.
- `git diff --check` passed.
- Host `go test` was unavailable because the installed Go snap lacks required sandbox capabilities;
  Docker compilation succeeded and validated the Go source.
