# MBOM Line Empty HTML Value Fix

Date: 2026-07-30

## Root cause

The MBOM component form submits optional HTML fields as empty strings. The
generic `POST /api/mes/master-data/mbom-lines` handler passed those values
directly to PostgreSQL:

- `effective_to: ""` was sent to a `timestamptz` column;
- `parent_line_id: ""` was sent to a UUID column.

PostgreSQL therefore returned `22P02`/timestamp parsing errors and the API
surfaced HTTP 500. A separate HTTP 422 `MBOM_COMPONENT_REVISION_INVALID` log
was an expected business validation for a revision that was not currently
Released/effective, not the database crash.

## Fix

In the generic master-data insert path:

- empty optional date values (`effective_to`, `valid_to`, `available_to`) are
  normalized to `NULL`;
- empty `md_mbom_line.parent_line_id` is normalized to `NULL`.

The required Released Item Revision and UOM validation remains authoritative.

## Verification

- MES Master Data TypeScript build passed.
- Container rebuilt and became healthy.
- A valid draft MBOM line with `effective_to: ""` and `parent_line_id: ""`
  returned HTTP `201` and persisted both fields as `NULL`.
- The temporary verification line was deleted successfully through the normal
  line-delete endpoint.
- No new timestamp/UUID parse error appeared in service logs.
