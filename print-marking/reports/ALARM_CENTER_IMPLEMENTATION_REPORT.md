# Alarm Center Implementation Report

## Executive Summary

Implemented a durable Alarm Center in the existing Projection Service and Kiosk UI. It provides a normalized alarm lifecycle, active-alarm deduplication, inbox/outbox delivery, real-time notifications, secure operator commands, RBAC, deterministic seeds, and SQLite/Docker resilience.

## Architecture Implemented

Projection Service remains the single alarm authority because it already owns alarms, projections, SignalR, and the station event boundary. Alarm state, timeline, inbox, outbox, command idempotency receipts, and escalation state are committed together in SQLite. The Kiosk UI accesses the service through its existing reverse proxy.

## Services Added or Changed

- Projection Service: alarm aggregate, persistence, lifecycle/event ingestion, command APIs, outbox worker, escalation worker, SignalR updates, JWT enforcement.
- Kiosk UI: Alarm Center tab, critical banner/sidebar indicator, stale/reconnect behaviour, action confirmation and permission-aware controls.
- Shared contracts: alarm lifecycle and manual-command event contracts.
- Kiosk RBAC: alarm permissions, role mappings, role claims in JWT, development-only seed users.

## Database Schemas and Migrations

`projection_alarms` now stores lifecycle, source, localization, production impact, acknowledgement/assignment/resolution/suppression, escalation and optimistic-concurrency fields. Added `alarm_timeline_events`, `alarm_outbox_events`, `alarm_inbox_messages`, and `alarm_command_receipts`. Startup applies additive SQLite compatibility DDL, including unique partial active-dedupe and idempotency indexes.

## Kafka Topics and Event Contracts

The deployed repository uses RabbitMQ rather than Kafka. Alarm lifecycle events are published to `station.events` with routing key `event.alarm.changed`; approved device/job/vision retry requests use `station.manual-overrides`. Outbox delivery is at-least-once and consumers retain durable inbox deduplication.

## Alarm Lifecycle

Supported states: `RAISED`, `ACKNOWLEDGED`, `IN_PROGRESS`, `CLEARED`, `CLOSED`, `SUPPRESSED`. Lifecycle guards prevent invalid transitions. Repeated source conditions update one active alarm’s occurrence count. Critical alarms cannot be suppressed. Persistent escalation policy: critical unacknowledged at two minutes, critical active at ten minutes, high active at thirty minutes. Expired suppression is restored by the worker.

## Deduplication and Inbox Strategy

Incoming events are keyed by consumer/event ID in the inbox. Active alarms use a database-enforced unique dedupe key. Command requests use a persistent idempotency receipt keyed by `Idempotency-Key`; conflicting reuse returns a deterministic conflict response.

## REST APIs

Read APIs: `GET /api/alarms`, `/summary`, `/options`, `/{alarmId}`, `/{alarmId}/timeline`.

Command APIs: acknowledge, assign, start-work, clear, close, suppress, unsuppress, retry-device, retry-job-step, escalate, and vision-bypass. Commands return machine-readable Vietnamese-facing errors such as `ALARM_NOT_FOUND`, `ALARM_STATE_CONFLICT`, `ALARM_PERMISSION_DENIED`, `ALARM_RESOLUTION_REQUIRED`, and `ALARM_IDEMPOTENCY_CONFLICT`.

## SignalR Messages

The outbox worker emits lifecycle event names (for example `AlarmRaised`, `AlarmAcknowledged`, `AlarmCleared`) plus `AlarmSummaryChanged` to the station SignalR group. The UI reloads snapshots following events and reconnects, and visibly marks stale realtime data.

## Kiosk UI and UX

The Alarm Center has summary cards, active/raised/in-progress/history/suppressed tabs, filters, pagination, severity/state badges, source/impact/guidance detail panels, timeline, confirmation dialog, responsive touch targets, loading/error/empty states, and connection-health indication. Technical error codes are centralized in Vietnamese mapping helpers.

## RBAC Matrix

Backend checks are mandatory. Operator: view, acknowledge, own/start work, limited retry. Supervisor: all alarm actions including controlled Vision bypass. Maintenance: all operational actions except Vision bypass. Super Admin: all. Direct permission claims can grant matching capabilities; `SYSTEM_ADMIN` grants all.

## Seed Data

Development alarm seed includes STATION-01/STATION-02, required device IDs, five linked job types, four development-only users (`operator.seed`, `supervisor.seed`, `maintenance.seed`, `admin.seed`), and 25 deterministic alarm scenarios. It includes repeated alarms (>10), acknowledged/assigned/in-progress/cleared/closed/suppressed/escalated/reopened examples, a Vision-bypass audit example, concurrent-ack test case, and a timeline with more than six records. Production requires explicit seed configuration and does not introduce a default seed password.

## Automated Tests

- Projection alarm tests: **49 passed, 0 failed** (`ND.ProjectionService.Tests`). Coverage includes lifecycle, suppression safety, escalation thresholds, RBAC matrix, SQLite active-dedupe constraint, inbox delivery dedupe, repeated conditions, command outbox/audit boundary, query/summary, and SQLite fallback.
- Full solution command: completed successfully after marking the fixture-only `ND.Testing` project as non-test (`dotnet test station-agent.sln`).
- Kiosk UI typecheck and production build: passed. ESLint passed with 7 existing non-blocking warnings outside Alarm Center.
- Projection Service and Kiosk API builds: passed with 0 warnings/errors.

## End-to-End Scenarios

The source-level transaction/event/realtime path is covered by focused tests and manual container startup verification. Browser-driven multi-service Scenario A–G was not automated in this workspace; it remains a deployment acceptance run. The report deliberately does not claim an unexecuted hardware/Job Engine end-to-end run.

## Docker and SQLite Permission Verification

Projection image and Kiosk image were built locally and started with clean named volumes. Both ran as UID/GID 1654 with `/data` and `/logs` owned by `app`. Both created SQLite database, WAL and SHM files. Projection Service remained healthy when RabbitMQ was unavailable, logging controlled reconnect attempts. SQLite write-probe fallback is unit tested for unwritable paths.

## Cross-Architecture Build Results

`./push-images.sh --build-only` was run for `linux/amd64,linux/arm64`. Its build logs show completed projection-service and kiosk-ui builds for both architectures, along with all existing service images. Build-only output was retained in Buildx cache, as expected.

## Performance Verification

Focused repository/query and deduplication tests passed. No synthetic multi-client SignalR or hardware-load benchmark was run; no numerical throughput claim is made.

## Security Verification

JWT authentication protects Alarm Center reads and commands. Backend permission checks do not rely on hidden UI controls. Actor identity is taken from claims, high-risk retry/bypass requests require idempotency keys, Vision bypass requires Supervisor/Super Admin permission plus reason/comment/serial/job attempt, and critical suppression is rejected.

## Commands Executed

- `npm run typecheck && npm run lint && npm run build`
- `dotnet build` for Projection Service and Kiosk API via .NET 10 SDK container
- `dotnet test services/projection-service/tests/ND.ProjectionService.Tests/...` (49 passed)
- `dotnet test station-agent.sln`
- `docker compose ... config --quiet` for all compose variants
- `./push-images.sh --build-only`
- local Docker builds and named-volume startup checks for Projection Service and Kiosk UI

## Known Limitations

- The repository’s event broker is RabbitMQ, not Kafka; no Kafka cluster was introduced.
- Retry requests are safely emitted at the event boundary; consuming adapter/Job Engine acknowledgement handling remains owned by those services.
- Full browser/hardware E2E and load tests require a running station environment.
- Existing Kiosk lint warnings and the Vite large-chunk advisory were preserved; neither is an error.

## Deviations from Original Plan

No new Alarm Management service was created. The existing Projection Service was extended, following repository architecture rules. “Kafka” terminology in requirements maps to the repository’s existing RabbitMQ event boundary.

## Future Improvements

Add adapter/job-engine acknowledgements for manual retry requests, automated browser SignalR reconnection tests, broker outage integration tests with a disposable RabbitMQ container, and performance/fan-out measurement in CI.

## Final Acceptance Checklist

- [x] Lifecycle, dedupe, inbox/outbox, timeline and command idempotency implemented.
- [x] Backend RBAC and dangerous-action validation implemented.
- [x] Kiosk Alarm Center and stale/reconnect UX implemented.
- [x] Deterministic seed scenarios implemented.
- [x] Relevant builds, focused tests, compose validation, Docker and SQLite checks passed.
- [ ] Physical-device and full multi-service browser E2E remain environment acceptance tests.
