# Service Boundaries

## Boundary Rules

- A service owns its database and transaction boundaries.
- Other services consume events, read models, snapshots, or explicit APIs.
- Do not create cross-database foreign keys.
- Do not add a second authority for an existing business concept.

## MES Master Data Service

Responsibilities: foundation/product/process/resource/labor master data, lifecycle/effectivity, release validation, readiness evaluation, business-code reservations, print-station master data.
Database: `mes_master_data_db`.
APIs: generic CRUD/release under `/api/mes/master-data/:resource`; special endpoints for production-version validation, employee schedules, headcount, skills, resource assignments, readiness, print stations, UOM, routing operations, MBOM lines/substitutes.
Events: publishes master-data release/change events such as `MES.MasterData.ItemRevisionReleased.v2`, `MBOMReleased.v2`, `RoutingReleased.v1`, `ProductionVersionReleased.v1`, `ResourceAssignmentCreated.v1`.
Outbox: writes release/change envelopes to outbox in router logic.
Anti-corruption: does not own traceability terminal transactions or execution transactions.
Evidence: `services/mes-master-data-service/service.manifest.yaml`, `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`, `services/mes-master-data-service/src/infrastructure/db/schema.ts`.

## MES Execution Service

Responsibilities: Work Orders, immutable snapshots, Work Order creation workflow, Compute & Check, approval/rejection, resource allocation/reservation/idempotency/audit, execution sessions, confirmations, material consumption, print jobs.
Database: `mes_execution_db`.
APIs: `/api/mes/execution/...` routes in `router.go`.
Events: publishes `WOCreated`, `WOApproved`, `MaterialConsumed`, `MaterialStagingRequested`, resource allocation events, operation events, print-related outbox events.
Consumes: master-data release events, WMS staging/shortage events, printer result events.
Read models: `rm_*` tables populated from master-data events.
Dependencies: master-data readiness/approval checks, traceability label issue.
Anti-corruption: must not read master-data or WMS databases directly.
Evidence: `services/mes-execution-service/service.manifest.yaml`, `services/mes-execution-service/internal/infrastructure/http/router.go`, `services/mes-execution-service/migrations`.

## MES Traceability Service

Responsibilities: traceability policies, numbering, QR split rules, label templates, label instances, genealogy.
Database: `mes_traceability_db`.
APIs: `/policies/resolve`, `/labels/issue`, `/labels/split`, `/labels/consume`, `/labels/{id}/genealogy`.
Events: publishes label issued, QR split, genealogy events.
Consumes: master-data item/MBOM events per manifest.
Evidence: `services/mes-traceability-service/service.manifest.yaml`, `services/mes-traceability-service/internal/infrastructure/http/router.go`, `services/mes-traceability-service/migrations`.

## MES Kiosk Gateway Service

Responsibilities: terminal sessions, terminal status, operator login, WebSocket fan-out.
Database: `mes_kiosk_gateway_db`.
APIs: `/api/mes/kiosk-gateway/ws`, `/terminals/:id/login`, `/logout`, `/status`, `/terminals`.
Consumes: execution events for terminal updates.
Dependencies: Keycloak token endpoint with circuit breaker.
Evidence: `services/mes-kiosk-gateway-service/service.manifest.yaml`, `services/mes-kiosk-gateway-service/internal/infrastructure/http/router.go`, `services/mes-kiosk-gateway-service/migrations`.

## QMS Inspection Service

Responsibilities: inspection plans, characteristics, results, inspection failure publishing.
Database: `qms_inspection_db`.
Events: publishes `QMS.Inspection.InspectionPlanReleased.v1`, `InspectionResultRecorded.v1`, `InspectionFailed.v1`.
Consumes: MES item/routing/execution operation finished events.
Dependency: MES master data validation with opossum breaker.
APIs: inspection plans, characteristics, defect codes, results, result recording.
Evidence: `services/qms-inspection-service/service.manifest.yaml`, `services/qms-inspection-service/src/infrastructure/http/inspection.router.ts`, `infra/postgres/qms-inspection-init.sql`.

## QMS Nonconformance Service

Responsibilities: NCR, disposition, CAPA, idempotent inspection-failure consumption.
Database: `qms_nonconformance_db`.
Events: publishes `QMS.Nonconformance.NCRRaised.v1`, `NCRDispositioned.v1`, `CAPAClosed.v1`.
Consumes: `QMS.Inspection.InspectionFailed.v1`.
APIs: NCR list/detail/create/update/disposition; CAPA list/detail/create/update/link/verify/close.
Evidence: `services/qms-nonconformance-service/service.manifest.yaml`, `services/qms-nonconformance-service/src/infrastructure/http/nonconformance.router.ts`, `infra/postgres/qms-nonconformance-init.sql`.

## WMS Services

Responsibilities from canonical docs: warehouse master data, inventory ledger/lots/balances/reservations, inbound receipts, outbound/material request and staging.
Database ownership: service-owned WMS databases.
Boundary: WMS inventory is stock authority; MES consumes WMS status, not WMS tables.
Local source status: no `services/wms-*` directories are present in this checkout. Do not infer current WMS API handlers from product docs alone. WMS integration facts in this library come from `AI_CONTEXT.md`, `product-doc/product-doc.md`, and MES execution event consumers for `WMS.Outbound.MaterialStaged.v1` and `WMS.Outbound.MaterialShortageDeclared.v1`.
Unknown: enumerate every current WMS API from WMS source before changing WMS behavior.

## Portal

Responsibilities: SSO app entry and role-based app routing.
APIs: browser auth via Keycloak; app URLs from config.
Evidence: `portal/src`, `portal/package.json`.

## MES Console

Responsibilities: planner/manager browser UI for master data, production configuration, Work Orders, resource planning.
Boundary: displays and validates client-side for UX but backend validation is authoritative.
Evidence: `services/mes-console/src/App.tsx`, `services/mes-console/src/lib/masterDataApi.ts`, `services/mes-console/src/routes`.

## Print Station / Printer Adapter

Responsibilities: station runtime projection, kiosk status, remote printer command execution.
Boundary: Kafka is normal production transport. HTTP adapter APIs are management/diagnostics/manual test.
Evidence: `infra/docker-compose.print-station.yml`, `print-marking/station-agent`, `docker-compose.print-adapter.yml`, `services/mes-execution-service/internal/infrastructure/events/printer_result_consumer.go`.
