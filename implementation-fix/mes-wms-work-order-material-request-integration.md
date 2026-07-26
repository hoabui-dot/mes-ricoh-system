# MES to WMS Work Order Material Request Integration

**Date:** 2026-07-23  
**Status:** Core flow implemented and runtime verified; broader audit gaps documented

## Original Issue

MES Work Order detail crashed for `/work-orders/695b1a80-d466-4d6b-82e4-950d67ce72bc` because the
execution API returns a document response with `header`, `operations`, `material_requirements`, and
`approval_logs`, while `WODetailScreen` treated the response as a flat Work Order. The screen also
did not expose the existing material staging command or WMS request results. WMS Console outbound
requests displayed a backend-gap placeholder even though the service already persisted requests.

## Verified Lifecycle and Architecture Decision

The executable-ready lifecycle is `Released` (the UI then allows execution in `InProgress`). Approval
transitions `Draft`/`PendingApproval` to `Released`, records the approval log, and writes
`MES.Execution.WOApproved.v1` to the MES transactional outbox in the same database transaction.

This repository does not contain a WMS consumer for `MES.Execution.WOApproved.v1`. The existing
architecture explicitly models material staging as `POST /work-orders/:id/stage-materials`, so the
canonical integration owner is the explicit MES staging command, not a second automatic Kafka path:

```text
Draft WO
  -> Compute & Check
  -> Approve: Released + approval log + WOApproved outbox event
  -> Planner selects Stage materials
  -> MES loads non-phantom requirements and issue Work Centers
  -> WMS outbound idempotent material request per WO/WorkCenter/item/quantity
  -> WMS uses WorkCenterStaging stock first, then Storage stock
  -> Inventory transfer uses FEFO and excludes expired/ineligible balances
  -> WMS returns Staged or Shortage
  -> MES persists stock_check_status/detail on each requirement
  -> WMS Console lists the generated request
  -> Production execution remains a separate lifecycle
```

Approval does not synchronously depend on WMS. WMS unavailability therefore cannot roll back a
valid MES approval; the explicit staging action returns a retryable dependency error and does not
claim success. Duplicate staging reuses the existing WMS request under the advisory-lock key
`wo_id + work_center_ref + item_revision_id + required_qty` and does not repeat a transfer.

## Changes

### MES Console

`services/mes-console/src/routes/work-orders/WODetailScreen.tsx` now normalizes the API document at
the fetch boundary. It validates the presence of `header.wo_id`, uses the header for identity/status,
and always supplies arrays for operations, requirements, and approval logs. It displays material
requirements, issue mode, stock status, and WMS request results. Released/InProgress WOs receive a
staging action with visible shortage/error feedback and no UUID-based business labels.

### MES Execution

`stage_materials.go` now rejects Draft/Cancelled/other non-executable states with stable
`WMS_INVALID_WORK_ORDER_STATE` semantics. The staging response propagates WMS request code and
source-system fields. The payload includes item and Work Center business codes when available from
the MES read model, while stable IDs remain integration keys.

### WMS Outbound

The existing idempotent service remains the request creator. It preserves staged quantity,
transferred quantity, available quantity, shortfall, and status. WMS request identity now includes a
business `MR-XXXXXXXX` code and `source_system: MES`. Added `GET /api/wms/outbound/material-requests`
for the WMS Console, and the console now renders real generated requests instead of a backend-gap
placeholder.

### Database migrations

- `000002_material_request_business_identity.up.sql` adds request code, source system, and update
  timestamp, backfilling legacy rows safely.
- `000003_material_request_display_fields.up.sql` adds nullable legacy-compatible item and Work
  Center business-code columns. This forward migration was added after detecting that modifying an
  already-applied migration would not update existing databases.

## Status and Quantity Rules

The current WMS schema supports only `Staged` and `Shortage`; the implementation does not invent
unsupported `Requested`, `Picking`, or `Completed` states. Existing staging stock is counted first.
Only the remaining quantity is transferred from Storage. Expired, inactive, quarantined, or
non-positive balances are excluded by the existing inventory flow. A shortage is returned as a
business result, not treated as a service outage. Phantom requirements are excluded from staging and
must be represented by their exploded child requirements.

Requests are grouped by the current staging call as one logical demand per
`WO + Work Center + Item Revision + Required Quantity`. Different Work Centers cannot share a
request because the staging destination is part of the idempotency key.

## Verification Evidence

- Reported live endpoint returned HTTP 200 and the expected document shape: `header`, 6 operations,
  5 material requirements, and approval logs.
- MES Console production build passed after response normalization.
- WMS Console production build passed after replacing the placeholder request list.
- MES execution Go tests passed.
- WMS outbound Go tests passed, including circuit-breaker behavior.
- A live explicit staging call for the reported WO returned four staged results with stable
  `MR-...` request codes and preserved quantities.
- Repeating the same staging call returned the same four request IDs/codes; no duplicate transfer
  was created.
- WMS outbound migration 000003 applied on startup and the live request-list API returned persisted
  requests.
- MES execution, WMS outbound, MES Console, and WMS Console images were rebuilt and recreated;
  service health checks passed.

## Security

The browser can invoke only the existing authenticated console route through Kong. MES-to-WMS
automatic request creation is not driven by spoofable browser identity headers inside WMS; the MES
service client calls the internal outbound service. The WMS route remains protected by the existing
Kong client/token policy, and direct container checks were used only for local runtime verification.

## Test Script

`scripts/test-mes-wms-material-request-flow.sh` runs health, Work Order document-shape, explicit
staging, duplicate-safe retry, and WMS list assertions. It prints unsupported audit cases as
`SKIPPED_WITH_DOCUMENTED_GAP` rather than silently claiming coverage. It is intentionally
non-destructive and uses the supplied existing WO unless `WO_ID` is overridden.

## Remaining Gaps

The repository still lacks a WMS Kafka consumer for `MES.Execution.WOApproved.v1`, so this report
does not claim automatic approval-to-request creation. WMS has no separate request-line table,
required-by date, cancellation/return workflow, request adjustment event, or persisted event source
ID. The current schema supports only Staged/Shortage, so Picking, PartialAllocated, cancellation,
out-of-order event guards, and durable failed-message/DLQ handling remain future work. Full isolated
fixture creation/cleanup and all 22 domain cases require a dedicated test database and inventory
fixture API; they are reported as skips by the script.

## Outbound Request Table Display Refinement

On 2026-07-23, the WMS Console outbound request table was corrected so headers use dedicated
translated keys instead of `common.created` (which is a creation-success toast). The Created column
now renders exactly `HH:mm dd/mm/yyyy`. The Work Order column uses the persisted `work_order_code`
and item/work-order name; Work Center uses `work_center_code` when projected and a translated
unavailable label rather than exposing a UUID. Required quantity displays its unit immediately after
the value, for example `101.505 item(s)`.

MES staging now sends Work Order code/name and item context in the request payload. WMS migrations
`000004_material_request_work_order_identity` and `000005_material_request_identity_backfill_permission`
persist these fields and permit safe updates to legacy idempotent requests. Live refresh of WO-1004
backfilled its existing request rows with `WO-1004` and `Cao su chân máy ô tô`. The execution read
model does not currently contain the seeded Work Center projections, so the UI intentionally shows a
translated unavailable state until those read-model events are replayed; it does not fall back to
the Work Center UUID.
