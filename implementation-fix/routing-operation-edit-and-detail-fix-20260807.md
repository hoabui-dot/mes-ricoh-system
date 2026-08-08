# Routing Operation Edit and Detail Fix

Date: 2026-08-07

## Root Cause

`PUT /routing-headers/:id/operations` previously marked every current Routing Operation inactive and inserted a
new set. The database uniqueness constraint covered every historical row on `(routing_header_id, seq)`, so a new
row using the same sequence failed with `md_routing_operation_routing_header_id_seq_key`. Replacing all IDs also
detached unchanged Routing Operation skill requirements from the current flow.

The Routing detail modal used the generic Routing Operation projection, which did not resolve Production Standard
values or worker skill requirements. The browser filled gaps with `0`, `1`, `60`, `Finite`, dashes, and one resource
planning help sentence rendered as if it were operation data.

## Implemented Behavior

- Migration `0073_routing_operation_current_sequence_uniqueness` replaces the historical table constraint with a
  partial unique index covering only current, active Routing Operations.
- Console includes `master_id` for existing rows in the synchronized operation payload.
- API updates retained Routing Operations in place, preserves their IDs and skill references, creates IDs only for
  new rows, and inactivates only removed rows and their dependent standards/skill overrides.
- Reordering temporarily moves current sequences outside the positive business range before applying the desired
  graph, allowing atomic sequence swaps.
- Routing detail excludes inactive/history rows and returns actual resolved values from Routing override, Work
  Center standard, or Operation defaults.
- Effective Routing-level worker skill requirements override Operation defaults by skill; detail includes skill,
  minimum level, required persons, mandatory flag, and source.
- Missing values display as Not Available/Unresolved rather than fabricated numeric defaults.

## Estimated Lifecycle Time

Routing detail reports an estimate for one resolved `base_quantity`:

```text
estimated_lifecycle_time_sec
  = setup_time_min * 60
  + cycle_time_sec
  + queue_time_min * 60
  + move_time_min * 60
```

This is master-data inspection only. Work Order duration remains quantity/resource/calendar dependent and is
calculated by Resource Planning.

## Verification

- Master Data unit tests: 16 passed.
- Master Data and MES Console typecheck/build: passed.
- Routing edit/detail Playwright E2E: passed, including two operation saves with sequence swapping, stable IDs,
  resolved planning fields, browser modal assertions, and exact database cleanup.
- Docker migration `0073`: applied; partial current-sequence index present and old constraint absent.
