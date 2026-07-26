# MES Work Order Creation Real-Time Progress

Date: 2026-07-23
Status: `PARTIALLY_IMPLEMENTED` overall; the implemented workflow transport and UI are verified for the current MES execution contract.

## Goal

Replace direct Work Order submission with a persistent, backend-driven creation workflow. The MES Console keeps the creation surface open, displays actual progress events, distinguishes transactional creation from asynchronous event queueing, and recovers from WebSocket interruption through an HTTP snapshot.

## Current user flow

1. Planner reviews item code, quantity, and target date.
2. The UI sends `POST /api/mes/execution/work-order-creation-workflows` with an `Idempotency-Key` and receives an accepted workflow reference.
3. The modal remains open and connects to the execution-owned WebSocket channel.
4. The timeline displays only backend-proven stages: request validation, master-data readiness, creation transaction, and transactional-outbox queueing.
5. The final state remains inspectable and offers `Open Work Order` after persisted success.

## Backend contract

| Contract | Status | Evidence |
|---|---|---|
| Workflow POST | `IMPLEMENTED_AND_VERIFIED` | Container probe returned `202 accepted` |
| Workflow snapshot GET | `IMPLEMENTED_AND_VERIFIED` | Snapshot returned 8 ordered events and final WO |
| Workflow WebSocket | `IMPLEMENTED_BUT_NOT_TESTED` | Handler and route compile/build; browser transport needs automated test |
| Workflow persistence | `IMPLEMENTED_AND_VERIFIED` | Migration `000006` applied at runtime |
| Idempotency | `IMPLEMENTED_AND_VERIFIED` at workflow start | Same user/key/payload returned existing workflow; database count remained one |
| Work Order plus outbox transaction | `IMPLEMENTED_AND_VERIFIED` | Existing `CreateWorkOrder` commits WO records and `MES.Execution.WOCreated.v1` together |
| Cross-service completion acknowledgement | `MISSING` | Workflow stops at outbox queueing and does not claim WMS/QMS/traceability completion |

## Event contract

Events are persisted in `wo_creation_workflow_event` with event ID, workflow/correlation IDs, schema version, sequence, timestamp, source service, event type, and structured step/workflow payload. Sequences are monotonic per workflow. The frontend ignores duplicates and requests an HTTP snapshot after a detected sequence gap or connection close.

The verified successful sequence is: `workflow.started`, request validation success, readiness started, readiness success, transaction started, transaction success, `outbox_queued` event, and `workflow.succeeded`.

## UI implementation

`services/mes-console/src/routes/work-orders/WOCreateScreen.tsx` now contains a non-closing progress dialog, responsive timeline/summary layout, connection status, stable step statuses and icons, inline errors and technical references, duplicate filtering, sequence-gap recovery, localized VI/EN/JA/KO messages, and `Open Work Order` only after persisted success. It uses no fake timers or optimistic completion.

## Persistence and transaction semantics

Migration `services/mes-execution-service/migrations/000006_work_order_creation_workflows.up.sql` adds `wo_creation_workflow` for ownership, correlation, idempotency key/hash, request payload, status, sequence, result, error, timestamps, and expiry metadata. It adds `wo_creation_workflow_event` for immutable ordered events plus indexes.

The existing `CreateWorkOrder` use case commits the Work Order header, exploded operations/material requirements, and `MES.Execution.WOCreated.v1` outbox write in one transaction. The workflow waits for that commit, then reports `Event queued`; it never reports downstream WMS/QMS/traceability completion.

## Security considerations

The HTTP snapshot checks `X-User-ID` against the workflow owner. The WebSocket route also checks owner identity, and Kong must validate the Keycloak token and trusted forwarded identity before exposing the route. Browser WebSocket APIs cannot set arbitrary authorization headers, so the current browser client carries user identity as a query parameter while Kong remains the intended authentication boundary. This is `IMPLEMENTED_BUT_NOT_TESTED` and requires a gateway negative-authorization integration test. The kiosk WebSocket hub was not reused because it is terminal-owned and has a different authentication/session contract.

## Known limitations

- The form exposes item code, quantity, and target date only; production UI should expose explicit revision, site, UOM, and production-version selection.
- Readiness is the current combined backend check. Separate independently observable MBOM, routing, resource, labor, capacity, and production-standard steps are not claimed because the current create API does not emit them separately.
- Workflow background execution is in-process. A service restart after acceptance can leave a workflow in `accepted` without a worker resuming it. Durable queue/worker ownership is a Phase 4 hardening item.
- WebSocket browser integration, multi-user leakage, reconnect races, and load behavior need automated tests.
- Full Keycloak/Kong audience and role enforcement remains the documented MES security gap.

## Verification

`npm run build --workspace=mes-console`: PASS.

`go test ./...` in `services/mes-execution-service`: PASS.

Targeted Docker build/recreate: PASS. Migration `000006` applied. Controlled workflow probe: PASS with 8 persisted events, Work Order `WO-1012`, 6 operations, and 5 materials. Repeated idempotency probe: PASS with one Work Order remaining.

Schema Registry returned its existing `409` registration warning for `MES.Execution.WOCreated.v1-value`; this is pre-existing schema registration behavior, not a workflow failure.

## Files changed

- `services/mes-execution-service/migrations/000006_work_order_creation_workflows.up.sql`
- `services/mes-execution-service/internal/infrastructure/http/creation_workflow.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-execution-service/cmd/server/main.go`
- `services/mes-execution-service/go.mod`, `go.sum`
- `services/mes-console/src/routes/work-orders/WOCreateScreen.tsx`
- `services/mes-console/src/i18n.ts`

## Recommended next step

Add an execution-owned durable worker/queue and a Kong-to-WebSocket authorization integration test. Then add browser tests for event ordering, snapshot recovery, failed-step skip behavior, and two simultaneous users.
