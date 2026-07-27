# Remove Work Order Bypass and Restore Strict Flow

Date: 2026-07-27

## Active policy

New Work Orders use the production flow: released Production Version, immutable
snapshots, current valid resource allocation for every operation, strict
approval, WMS material staging, execution dispatch, and Print Station
completion. Approval without allocation and synthetic material staging are no
longer supported.

## Changes

- `approve_work_order.go` removed bypass input fields; new approval audit rows
  are `STANDARD`, `Strict`, and `resource_allocation_bypassed=false`.
- `router.go` always calls `AllocationService.Revalidate`; missing or stale
  allocations return `409 WO_RESOURCE_ALLOCATION_INVALID`.
- `stage_materials.go` removed `MES_MATERIAL_STAGING_REQUIRED` and the
  `Bypassed` response; every request calls WMS Outbound.
- Compose sets `MES_RESOURCE_ALLOCATION_APPROVAL_REQUIRED=true` and has no
  material-staging bypass setting.
- Console and E2E verification no longer expose or send bypass requests.

Historical audit columns such as `bypass_reason` remain only for querying old
records. Current code never writes or accepts them.

## Cleanup

The cleanup transaction audited and deleted 13 invalid development Work Orders,
38 operations, 65 material requirements, 6 print jobs, 6 attempts, 5 print
events, 12 approval logs, 56 workflow events, 7 workflows, and 41 outbox
events. Fifteen related Kiosk messages were removed. All orphan checks are
zero and master data was preserved.

## Verification

- `go test ./...` in `services/mes-execution-service`: passed.
- `npm run cleanup:mes:work-orders`: passed.
- The earlier physical-print completion was executed under temporary bypass
  policies and is historical only. A new strict physical E2E requires real
  allocations and sufficient WMS stock.
