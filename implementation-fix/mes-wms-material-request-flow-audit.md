# MES-to-WMS Material Request Audit Result

Date: 2026-07-24
Status: **Core duplicate prevention and realtime path implemented; full business-data E2E unverified**

## Executive Summary

The running source confirms explicit MES staging is the only WMS demand creator. Work Order approval
writes `MES.Execution.WOApproved.v1`, but this repository has no WMS consumer for that event. The prior
duplicate risks were real: MES sent one WMS call per raw requirement and had no Work Order command lock;
WMS held an advisory lock in one transaction while doing lookup/persistence through other transactions.

MES now aggregates duplicate MBOM lines, skips requirements already `Staged`, and serializes staging by
Work Order. WMS now holds its logical identity lock through completion and enforces the same identity
with a unique database index. WMS outbox events now reach an authenticated WebSocket notification path
and WMS Console performs reconnect, deduplication, targeted invalidation, and REST recovery.

## Current Implemented Flow

```mermaid
sequenceDiagram
    actor Planner
    participant UI as MES Console
    participant MES as MES Execution
    participant MDb as MES DB
    participant WMS as WMS Outbound
    participant Inv as WMS Inventory
    participant WDb as WMS DB
    participant Kafka
    participant WS as WMS Realtime WebSocket
    participant WUI as WMS Console
    Planner->>UI: Create Work Order
    UI->>MES: POST /work-orders
    MES->>MDb: Explode MBOM; insert requirements
    Planner->>UI: Approve
    UI->>MES: POST /work-orders/:id/approve
    MES->>MDb: Release + approval log + WOApproved outbox
    Planner->>UI: Stage materials
    UI->>MES: POST /work-orders/:id/stage-materials
    MES->>MDb: Work Order lock; skip Staged; aggregate groups
    MES->>WMS: POST /material-requests per logical group
    WMS->>WDb: Advisory identity lock + existing lookup
    WMS->>Inv: Read balances and transfer shortfall
    Inv-->>WMS: Staged or shortage/dependency result
    WMS->>WDb: Request + transactional outbox
    WMS-->>MES: Request result or idempotent replay
    MES->>MDb: Persist requirement status/detail
    WDb->>Kafka: MaterialStaged/MaterialShortage event
    Kafka->>WS: Fan-out
    WS-->>WUI: Authenticated update
    WUI->>WMS: Targeted REST refetch
```

Approval and staging are separate. Approval does not call WMS; the explicit staging command is the
canonical owner. Page refreshes, detail loading, query invalidation, and realtime notifications perform
reads only.

## Request Cardinality

```text
expected WMS calls = count of unique
(Work Order, Work Center, Item Revision)
among positive, non-phantom, not-already-Staged requirements
```

Duplicate MBOM lines in one group are aggregated into one quantity. Different Work Centers or Item
Revisions remain separate. Phantom, non-positive, and completed-Staged rows are excluded. Shortage is
retryable as a business state; it is not treated as a transport failure.

| Action | Expected WMS writes | Source result |
|---|---:|---|
| Create Work Order | 0 | MBOM explosion is MES-local |
| Approve Work Order | 0 | `WOApproved` outbox only |
| First staging | one per logical group | Aggregated before WMS loop |
| Repeat after Staged | 0 for completed rows | MES Staged skip |
| WMS logical replay | original record | Advisory lock + unique index |
| Detail/table refresh | 0 | Read-only REST/WebSocket invalidation |

## Duplicate Triggers and Root Causes

1. Raw requirement iteration produced unnecessary calls for duplicate MBOM lines. Fixed by
   `aggregateStageDemands` and its unit test.
2. Concurrent MES staging commands were unsynchronized. Fixed with
   `pg_advisory_xact_lock(hashtext('mes-stage-materials:' || wo_id))` held through MES updates.
3. WMS lookup/persistence were outside the advisory-lock transaction. Fixed by retaining the lock
   transaction through lookup, persistence, and commit; database uniqueness is now an additional guard.
4. The MES detail screen has one explicit staging handler and disables it while pending. Approval does
   not stage. WMS Console mutation is confirmation-gated and query functions remain reads.

## WMS Idempotency

Identity is `wo_id + work_center_ref + item_revision_id + required_qty`; quantity is formatted to six
decimal places for the advisory key. Migration `000006_material_request_business_identity_unique` repairs
legacy replay duplicates and creates `uq_material_request_business_identity`. WMS 5xx/timeouts remain
retryable dependency errors; business 4xx and shortages are not automatic transport retries.

## Realtime/WebSocket Evidence

Before this change WMS had no WebSocket/SSE endpoint or console client. The MES kiosk WebSocket is kiosk
scoped and is not reused. The new WMS path is:

| Capability | Evidence status | Source |
|---|---|---|
| Backend endpoint | `IMPLEMENTED_BUT_NOT_TESTED` | `wms-outbound-service/internal/realtime/hub.go` |
| Kafka bridge | `IMPLEMENTED_BUT_NOT_TESTED` | `internal/infrastructure/events/consumer.go` |
| Console client | `IMPLEMENTED_BUT_NOT_TESTED` | `wms-console/src/hooks/useWmsRealtime.ts` |
| Reconnect/backoff/dedup | `IMPLEMENTED_BUT_NOT_TESTED` | realtime hook |
| Authentication | `IMPLEMENTED_BUT_NOT_TESTED` | Keycloak UserInfo after upgrade; invalid token rejected |
| Missed-event recovery | `IMPLEMENTED_BUT_NOT_TESTED` | REST invalidation/refetch on connect |

The Kong realtime route is separate from the JWT REST route so browser upgrade can occur without a custom
Authorization header. The first WebSocket frame must contain a current Keycloak bearer token; tokens are
not placed in URLs. Slow clients use bounded queues and dropped notifications; REST remains authoritative.

## Files and Migrations

- MES: `internal/application/usecase/stage_materials.go` and `stage_materials_test.go`.
- WMS: `material_request.go`, `material_request_identity_test.go`, `metrics.go`, realtime hub, Kafka
  consumer, HTTP router, server bootstrap, `go.mod/go.sum`.
- WMS Console: `useWmsRealtime.ts`, `Topbar.tsx`, and four-locale `i18n.ts` additions.
- Infrastructure: `infra/docker-compose.wms.yml` and `infra/kong/kong.yml`.
- Migration: `000006_material_request_business_identity_unique.up.sql`; it applied live and the expected
  unique index was verified in PostgreSQL.

## Tests and Runtime Verification

- MES Execution Go tests: PASS, including duplicate-line cardinality grouping.
- WMS Outbound Go tests: PASS, including canonical identity separation.
- MES and WMS Console production builds: PASS.
- Docker images rebuilt and containers recreated; MES Execution, WMS Outbound, and WMS Console healthy.
- WMS health and metrics endpoints returned `200`; migration/index appeared in live checks.
- Kong realtime plain HTTP probe reached the backend and returned expected WebSocket `400`; invalid token
  WebSocket closed. Valid-token browser delivery was not available.
- The repository integration script could not stage because its demo Work Order ID returned `404`; direct
  live Work Order list returned `{"data":null}`. No runtime staging success is claimed.

## Remaining Risks and Evidence Classification

`IMPLEMENTED_AND_VERIFIED`: source flow, explicit ownership, MES aggregation/lock, WMS identity/index,
builds, unit tests, Docker health, and migration/index runtime checks.

`IMPLEMENTED_BUT_NOT_TESTED`: valid-token WebSocket delivery, Kafka event fan-out, browser reconnect,
role-scope matrix, live duplicate transfer, shortage, timeout-after-commit, and concurrent staging.

`UNVERIFIED`: normal create -> approve -> stage runtime flow, because the live MES database contains no
Work Order fixture. Seed a released demo Work Order and run `scripts/test-mes-wms-material-request-flow.sh`
with browser/Keycloak verification before marking these scenarios complete.

## Acceptance Checklist

- [x] Source-level create -> approve -> stage -> WMS flow documented.
- [x] Cardinality and canonical demand owner defined.
- [x] Duplicate MBOM calls and concurrent staging guarded.
- [x] WMS unique identity and shortage/retry semantics preserved.
- [x] Realtime endpoint, Kafka bridge, reconnect, deduplication, and REST recovery implemented.
- [x] Tests, builds, Docker health, migration, metrics, and Kong route checks pass.
- [ ] Live Work Order staging, concurrent inventory transfer, valid-token WebSocket delivery, and browser reconnect remain pending fixture/browser evidence.
