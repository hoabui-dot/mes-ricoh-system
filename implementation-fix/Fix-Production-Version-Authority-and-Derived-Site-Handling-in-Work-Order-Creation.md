# Fix Production Version Authority and Derived Site Handling

Date: 2026-07-27

## Root cause

The Work Order workflow was selecting a Production Version by ID, but the
Execution read model for `FG-WS-CM01-R1` had a NULL `rm_item_revision.base_uom_id`.
`create_work_order.go` scanned that nullable UUID into a Go `string` at scan
destination 9. The handler then incorrectly wrapped every query/scan failure as
`no Production Version found for Item at Site ...`, hiding the actual projection
defect. The selected Production Version and Site were valid; no Work Order was
committed by that failed request.

The read model also lacked a guard that the selected Production Version Site
matched the Site resolved from all Routing Work Centers. The routing-operation
projection has no lifecycle column, so active projected operations are identified
by the current projection rows and the Routing header's release contract.

## Changes

- `create_work_order.go`
  - Production Version ID remains the only authoritative configuration selector.
  - Nullable display/name/code values use SQL-safe mappings.
  - `pgx.ErrNoRows` returns `PRODUCTION_VERSION_NOT_FOUND`.
  - Other database mapping failures return `WORK_ORDER_MASTER_DATA_QUERY_FAILED`.
  - Empty projected UOM returns `WORK_ORDER_MASTER_DATA_INCOMPLETE`.
  - Execution Site is checked against the distinct Work Center Sites of the
    selected Routing; zero and multi-Site contexts are rejected.
- `check_readiness.go`
  - Uses NULL-safe Production Version fields.
  - Readiness rejects missing UOM, unresolved Routing Site, ambiguous Sites, and
    Production Version/Routing Site mismatch before transaction creation.
- `000018_normalize_production_version_read_model_context.up.sql`
  - Backfills a missing Item Revision UOM only when released Production Version
    references resolve to exactly one released MBOM base UOM.
  - Ambiguous or still-missing values remain incomplete and cannot be used to
    create a Work Order.
- `WOCreateScreen.tsx` and `errorMessages.ts`
  - Adds safe localized messages for not-found, incomplete projection, query,
    and Site-context failures.
  - Workflow step error details are translated rather than exposing raw SQL.
  - Synchronous request failures now show a reference modal with clear failure
    state instead of only a toast.

## Verification

- Execution `go test ./...`: passed.
- MES Console `npm run build --workspace=mes-console`: passed.
- Docker rebuild/recreate of Execution and Console: passed.
- Migration `000018`: applied successfully after correcting UUID aggregation.
- Candidate endpoint returned `ready=true`, derived `PCS`, and Site `SITE-KZ3`.
- Controlled workflow with Production Version
  `4314a2bc-6ab4-4391-bcb9-4a8865bf6c27` completed successfully and created a
  Work Order with the expected derived Site and UOM.
- Test Work Order and five test workflows were removed after verification;
  final database baseline is zero Work Orders, zero creation workflows, and no
  Work Order outbox records.

## Remaining data note

One released master Production Version (`9a90dce8-6f35-486e-abf2-1310dd87c7b7`)
had no historical `ProductionVersionReleased.v1` event and therefore is absent
from the Execution read model. It must be republished through the normal
master-data event/replay process before it can be used by the asynchronous
Execution workflow. The backend now reports this as a readiness failure rather
than guessing another Production Version.

