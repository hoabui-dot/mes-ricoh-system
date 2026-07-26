# MES Routing Detail UX and Backend Numbering

**Date:** 2026-07-23  
**Status:** Implemented and runtime verified

## Scope

Improved `/master-data/routings` so a routing row opens a detail modal with a business-facing
summary and operation dependency flow. Added backend-owned Routing Code generation for new
`md_routing_header` records.

## Root Cause

The routing list was display-only: rows did not open a detail view, operation data was separated
into another route, and the UI did not render predecessor relationships or execution requirements.
Routing creation also accepted a client-provided code, so the master-data service had no dedicated
atomic numbering contract for new routings.

## Modal UX

`services/mes-console/src/routes/master-data/RoutingScreen.tsx` now opens a responsive dialog from a
row click or keyboard activation. It shows localized routing identity, version, type,
product/revision, site, status, validity, and operation count without exposing UUIDs. Operations
render in sequence order as a vertical flow with business codes, localized names, work centers,
descriptions, and predecessor indicators. The selected-operation panel shows scheduling mode,
queue/move time, overlap, transfer batch, milestone, confirmation, material-scan, and output-label
requirements. Multiple predecessor values are supported when returned by the API; the current schema
still stores one `predecessor_seq` per operation.

## Numbering Strategy

The master-data service owns allocation. For `md_routing_header` POSTs, the submitted code is
overwritten inside the existing transaction by an atomic PostgreSQL upsert using
`md_routing_numbering_daily`:

```text
RT-YYYYMMDD-####
```

`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` serializes concurrent allocations, while
`uq_md_routing_header_code` enforces global uniqueness. `GET
/api/mes/master-data/routing-headers/code-preview` returns the next likely value with
`is_reserved: false`; it is advisory and does not increment the counter. The form displays it
read-only and the backend remains authoritative.

## Migration and Tests

Migration `0008_routing_numbering_and_operation_timing` creates the daily counter, adds the unique
routing-code index, and adds scheduling mode, queue time, move time, overlap, transfer-batch
quantity, and milestone fields with backward-compatible defaults. `routing-numbering.ts` contains
the pure formatter covered by Vitest for prefix/date/zero-padding and invalid inputs.

## Verification

- Master-data Vitest: 2 files and 3 tests passed.
- Master-data TypeScript build and MES Console Vite production build passed.
- `mes-master-data-service` and `mes-console` Docker images rebuilt and containers recreated.
- Containers became healthy/running; migration 0008 was confirmed in startup logs.
- Live preview returned HTTP 200: `{"preview_code":"RT-20260723-0001","is_reserved":false}`.
- Live routing-header and routing-operation endpoints returned localized names, operation codes,
  predecessor sequence, timing, milestone, confirmation, and scan/label fields.

The existing non-blocking Schema Registry compatibility warning is unrelated to routing. Browser
automation is not configured, so production build and live container/API checks were used instead.
