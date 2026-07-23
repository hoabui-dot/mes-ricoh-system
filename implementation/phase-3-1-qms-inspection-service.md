# Implementation Trace: Phase 3 Step 1 QMS Inspection Service

Date: 2026-07-23
Prompt: `process/Phase-3.md`
Status: Completed

## Delivered

- Created the bounded-context canvas at `docs/adr/bounded-context-canvas-qms-inspection-service.md`.
- Added `services/qms-inspection-service` using Node.js, TypeScript, Express, Drizzle schema definitions,
  PostgreSQL, KafkaJS, shared outbox, and OpenTelemetry.
- Added owned database `qms_inspection_db` and host port `15442`; service port is `13110` -> `3110`.
- Added localized tables for defect codes, plans, characteristics, results, result details, and MES local
  reference projections. All translatable fields use `LocalizedText` with a required Vietnamese value.
- Added seed defect codes: `SURF-CRACK`, `DIM-OUT`, and `VIS-MARK`.
- Added plan and characteristic APIs:
  - defect-code list/create/update
  - plan list/detail/create/update/release
  - characteristic list/create/update
- Added result APIs:
  - filterable result list
  - result detail with characteristic lines
  - server-side result recording and pass/fail recomputation
- Added release validation that returns all validation errors, including missing characteristics, invalid
  variable bounds/UOM, invalid MES references, non-Inspection operations, and duplicate effective plans.
- Added `opossum` circuit breaker for synchronous MES master-data validation with the project baseline:
  10s timeout, 30s reset timeout, 50% failure threshold, and four-request volume threshold. State changes
  emit OpenTelemetry spans.
- Added Kafka consumer for `MES.MasterData.ItemRevisionReleased.v2`, routing context, and
  `MES.Execution.OperationFinished.v1`.
- Added idempotent draft inspection creation keyed by source event ID. Only operations resolved as
  `operation_type = Inspection` create QMS draft results; `OP-QC` is not hardcoded.
- Added outbox events:
  - `QMS.Inspection.InspectionPlanReleased.v1`
  - `QMS.Inspection.InspectionResultRecorded.v1`
  - `QMS.Inspection.InspectionFailed.v1`
- Finalized the `InspectionFailed` payload contract for Phase 3 Step 2 in the bounded-context canvas.
- Enriched `MES.Execution.OperationFinished.v1` with operation, site, item revision, and work-center
  references required for QMS correlation.
- Added the QMS Kong route with the native JWT plugin and a QMS-specific `qms-client` pre-function policy.
  Missing tokens return `401`; accepted roles are `QC_TECHNICIAN`, `PLANT_MANAGER`, and `EXECUTIVE`.
- Added `infra/docker-compose.qms.yml` and included it from the root Compose file.

## Verification

- `npm run typecheck --workspace=qms-inspection-service` passed.
- `npm run build --workspace=qms-inspection-service` passed.
- `/usr/local/go/bin/go test ./...` in `services/mes-execution-service` passed.
- `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml config --quiet` passed.
- Docker image built and container started: `qms-inspection-service` on `13110`, database healthy on
  `15442`.
- `GET http://127.0.0.1:13110/health` returned service status `ok`.
- `GET http://127.0.0.1:18000/api/qms/inspection/defect-codes` without a token returned `401 Bearer token required`.
- Container logs confirmed migration/bootstrap, outbox relay startup, Kafka consumer group assignment,
  and HTTP listener startup.

## Known Boundary

Historical `MES.Execution.OperationFinished.v1` messages already in Kafka predate the enriched payload and
are logged and ignored as incomplete. New MES execution confirmations publish the complete payload. Closure
update: `InspectionFailed.v1` and `InspectionResultRecorded.v1` now include the real `site_id`, and
`InspectionFailed.v1` includes the worst linked defect category for downstream NCR severity mapping.
Phase 3 Step 2 and Step 3 are delivered in their respective implementation traces.
