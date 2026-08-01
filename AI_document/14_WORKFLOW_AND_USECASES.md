# Workflow and Use Cases

## Master Data Release

Business objective: make a product/resource/process definition available for Work Orders.
Actors: planner, production manager, master-data admin.
Preconditions: required fields, lifecycle state, effectivity, same-site relationships, UOM rules.
Main flow: create/edit draft -> validate -> release -> write outbox event -> downstream read models update.
Failure: missing lines, invalid UOM, inactive Work Center, missing standards/capabilities, released immutable record.
APIs: `/api/mes/master-data/:resource`, `/:id/release`, production-version validate.
Events: `MES.MasterData.*Released.*`.
UI: MES Console master-data screens.
Evidence: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`, `services/mes-console/src/routes/master-data`.

## Work Order Creation

Business objective: create production demand from a released Production Version.
Actors: planner.
Preconditions: released/effective Production Version, MBOM, Routing, item revision, resources, standards.
Main flow: select Production Version and quantity -> create workflow/WO -> backend snapshots routing/material/planning -> outbox `WOCreated`.
Alternative: asynchronous creation workflow with WebSocket progress.
Failure: missing production configuration, invalid quantity, stale master data, dependency unavailable.
APIs: `/work-order-creation-workflows`, `/work-orders`.
Events: `MES.Execution.WOCreated.v1`.
UI: Work Order create screen.
Evidence: `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/mes-console/src/routes/work-orders/WOCreateScreen.tsx`.

## Compute & Check

Business objective: calculate readiness and planning status before approval.
Actors: planner.
Preconditions: Draft Work Order with snapshots.
Main flow: run compute -> evaluate operations/material/planning -> show readiness.
Failure: missing standards, missing resource candidates, incomplete material readiness.
APIs: `/work-orders/:id/compute-check`.
UI: Work Order detail.
Evidence: `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`.

## Resource Planning Allocation

Business objective: commit feasible Workstation/equipment/machine capacity to each WO operation.
Actors: planner, production manager.
Preconditions: Work Order operation, routing Work Center, effective assignments, requirements, calendars, capacity.
Main flow: get candidates -> choose Ready candidate -> POST allocation with idempotency key -> backend revalidates and commits allocation/reservation/audit/outbox.
Alternative: reallocate with reason; cancel before lifecycle lock.
Failure: forbidden role, stale candidate, capacity conflict, dependency unavailable, idempotency mismatch.
APIs: `/resource-candidates`, `/resource-allocation`, `/reallocate`, `DELETE /resource-allocation`, `/resource-allocations/revalidate`.
Events: `MES.Execution.WOResourceAllocated.v1`, `WOResourceReallocated.v1`.
UI: Work Order detail resource-planning panel.
Evidence: `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/mes-execution-service/internal/application/usecase`, `docs/testing/mes-resource-planning-use-cases.md`.

## Work Order Approval

Business objective: release a valid Work Order for execution.
Actors: production manager/planner according to policy.
Preconditions: valid snapshots, committed allocations under strict policy, material/print readiness according to config.
Main flow: approve -> revalidate -> state transition -> outbox `WOApproved`.
Alternative: reject.
Failure: stale production configuration, missing allocation, dependency unavailable.
APIs: `/work-orders/:id/approve`, `/reject`.
Events: `MES.Execution.WOApproved.v1`.
Evidence: `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/mes-execution-service/service.manifest.yaml`.

## Material Staging

Business objective: request WMS to stage materials to Work Center.
Actors: planner/system depending on policy.
Preconditions: approved/releasable Work Order and material requirements.
Main flow: stage materials -> MES publishes request -> WMS stages or declares shortage -> MES updates local status.
Failure: invalid WO state, shortage, WMS dependency/event failure.
APIs: `/work-orders/:id/stage-materials`.
Events: `MES.Execution.MaterialStagingRequested.v1`, WMS staged/shortage events.
Status: implemented but compatibility/manual recovery surface, not final automatic lifecycle.
Evidence: `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/mes-execution-service/internal/infrastructure/events/wms_material_result_consumer.go`.

## Operation Execution

Business objective: record actual shopfloor work.
Actors: operator.
Preconditions: approved/released WO, predecessor rules, allocated resource, material readiness.
Main flow: start operation -> create session -> confirm quantities/material/labels -> finish operation -> outbox.
Alternative: abort session.
Failure: wrong state, predecessor not complete, traceability dependency unavailable, invalid quantities.
APIs: `/operations/:opId/start`, `/confirm`, `/abort`, `/consumption`.
Events: `OperationStarted`, `OperationFinished`, `MaterialConsumed`.
UI: Kiosk/operator UI and MES supervision.
Evidence: `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/kiosk-operator-ui`, `services/mes-kiosk-gateway-service`.

## Traceability Split

Business objective: record parent-child QR transformation at cutting.
Actors: operator/MES.
Preconditions: active policy, numbering rule, split rule, parent label.
Main flow: resolve policy -> split label -> create child labels/genealogy.
Failure: invalid label, over-tolerance split, missing policy.
APIs: `/policies/resolve`, `/labels/split`, `/labels/{id}/genealogy`.
Evidence: `services/mes-traceability-service/internal/infrastructure/http/router.go`, `services/mes-traceability-service/migrations`.

## QMS Inspection Failure to NCR

Business objective: convert failed quality result to nonconformance.
Actors: quality user/system.
Preconditions: inspection result recorded as fail.
Main flow: QMS inspection publishes failure -> nonconformance consumes idempotently -> NCR raised -> disposition/CAPA flow.
Failure: duplicate event should not create duplicate NCR.
APIs/UI: QMS Console result/NCR/CAPA screens.
Events: `QMS.Inspection.InspectionFailed.v1`, `QMS.Nonconformance.NCRRaised.v1`.
Evidence: `services/qms-inspection-service/src/infrastructure/http/inspection.router.ts`, `services/qms-nonconformance-service/src/infrastructure/http/nonconformance.router.ts`, `services/qms-console/src/routes.tsx`.

## Print Dispatch

Business objective: print labels for operations requiring output labels.
Actors: MES, Print Station.
Preconditions: label quantity policy, print station readiness, Kafka connectivity.
Main flow: MES creates print job/attempt/outbox -> Kafka command -> remote adapter prints -> result event -> MES/projection update status.
Failure: printer offline, Kafka failure, adapter error, duplicate result.
Status: physical verification depends on runtime printer/adapter.
Evidence: `services/mes-execution-service/internal/infrastructure/events/printer_result_consumer.go`, `infra/docker-compose.print-station.yml`, `print-marking/station-agent`.
