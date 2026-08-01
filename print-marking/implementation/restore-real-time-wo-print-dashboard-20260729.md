# Restore Real-Time WO Print Dashboard

Date: 2026-07-29

## Root Cause

The Print Marking dashboard was still based on the legacy per-label/job
projection. Projection Service did not subscribe to the current MES batch
print command route, and its batch result handler only updated legacy order
counters. The Kiosk did not listen for `OnProductionOrderUpdate` or a current
print-job event and did not refetch projection state after a SignalR reconnect.
As a result, a physical printer could receive and complete a job while the
Kiosk remained stale until a page refresh, and the UI continued to derive
fields from old job-engine payloads with demo fallbacks.

## Changes

### Projection Service

- Added `PrintDashboardView` and the additive SQLite table
  `projection_print_dashboard`.
- Added `PrintDashboardDto` and
  `GET /api/projection/print-dashboard?stationId=...`.
- Added a Kafka consumer for `command.printer.print.#` and a dedicated result
  consumer for `printer.batch.printed`.
- Commands create/update one current dashboard row with requested quantity,
  required labels, total copies, print job, operation, station and printer.
- Batch results update printed/failed/remaining counts and final status
  (`Completed`, `PartiallyFailed`, or `Failed`).
- `MES.Execution.#` updates WO/operation context in the same projection.
- Every successful projection update sends SignalR
  `OnPrintDashboardUpdate` to the station group.
- Event IDs are claimed in `projection_event_dedup` inside the write
  transaction, so redeliveries do not double-count labels.

### Kiosk UI

- `useDashboard` fetches the new read model on startup.
- Added `OnPrintDashboardUpdate` handling with event-ID deduplication.
- Reconnect now re-subscribes and refetches the authoritative dashboard state.
- Added a current print execution panel showing WO, product, operation,
  workstation/print station, printer, requested quantity, label counts,
  print status and latest event type.
- Product information remains compact on the dashboard; secondary details open
  in a modal.

## Verification

- Kiosk frontend: `npm run typecheck && npm run build` passed.
- Projection Service Docker publish/build passed.
- Recreated `station-projection-service` and `station-kiosk-ui` with
  `infra/docker-compose.platform.yml` and
  `infra/docker-compose.print-station.yml`.
- `GET http://localhost:5009/health` returned healthy.
- `GET /api/projection/print-dashboard?stationId=PRINT-STATION-01` returned a
  completed dashboard row for `WO-20260728-0003` with 20 requested labels,
  20 printed, 0 failed and 0 remaining on `Zebra-GK420t-CUPS`.
- Runtime logs confirmed the new Kafka consumers started and projected
  multiple MES batch commands.

## Remaining Verification Limit

This turn verified the local Kafka/projection/read-model path and deployed
Kiosk bundle. It did not initiate a new remote physical Zebra print, so a new
physical-print latency trace must still be captured separately. The existing
remote adapter remains the physical transport authority.
