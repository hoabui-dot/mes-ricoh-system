# Consolidate Print Station Deployment and Restore Real-Time Flow

## Scope

Implemented the canonical MES-host Print Station control plane from
`process-fix/Consolidate-Print-Station-Deployment-and-Restore-Real-Time-Kafka-Projection-Kiosk-Flow.md`.

The deployment is now split intentionally:

```text
MES / platform Kafka
  -> station-projection-service
  -> station-kiosk-ui
  -> SignalR /hubs/production

Kafka over the protected network
  -> remote Printer Adapter on the Mac/edge server
  -> CUPS / physical printer
```

The Printer Adapter is not duplicated in the MES Compose stack. Its HTTP URL is
management/diagnostics only; print execution remains Kafka-driven.

## Changes

- Added canonical `infra/docker-compose.print-station.yml`.
- Added `rebuild:print-station`, `restart:print-station`, `verify:print-station`,
  and `logs:print-station` commands.
- Rebuilt Projection and Kiosk from source on the shared `platform-net`.
- Removed the old `station-agent` Projection/Kiosk containers before starting
  the canonical services. MES/WMS/QMS containers were not removed.
- Added Projection subscription to `MES.Execution.#` on
  `station.events.integration`.
- Added event identity propagation in the shared Kafka consumer so envelope
  `event_id`, `event_type`, and `occurred_at` survive payload unwrapping.
- Added transactional SQLite event deduplication. Redelivery with the same
  event ID is acknowledged as a no-op and does not create duplicate activity.
- Added status ordering. `OperationFinished` is `IN_PROGRESS`; only
  `WOCompleted` is `COMPLETED`, and late older events cannot regress state.
- Corrected Projection diagnostics to parse `Kafka:BootstrapServers` instead
  of checking the RabbitMQ port `5672`.
- Removed seeded PLC/laser/camera/gateway and legacy simulator-printer rows.
  Runtime device rows now come from real Kafka heartbeats.
- Changed Kiosk dispatch default to `production-printer` and rejected the old
  `simulation` target.
- Changed unreachable Printer Adapter proxy failures from opaque `502` to
  structured `503` responses with dependency, endpoint, and error metadata.
- Added volume-permission entrypoints so SQLite data volumes are writable by
  the non-root `app` process.

## Verification

Passed:

- Docker Compose config validation.
- Projection Docker build and .NET publish.
- Kiosk frontend build, API restore, and .NET publish.
- Shared Kafka topic creation for printer, production, integration, and device
  topics.
- Canonical runtime: Projection healthy, Kiosk healthy, Redis healthy.
- Projection diagnostics: SQLite healthy and Kafka `kafka:29092` reachable.
- Projection records API HTTP 200.
- SignalR negotiate HTTP 200.
- MES execution Kafka test: WOCreated projected to record/activity.
- Duplicate event ID ignored.
- OperationFinished projected as IN_PROGRESS.
- WOCompleted projected as COMPLETED.
- Late WOCreated did not regress the completed record.
- Projection test volume was removed and recreated; final record baseline is
  empty.

The verifier still reports one expected failure: the configured remote Adapter
endpoint `http://100.68.50.41:5003` was not reachable from this host during the
run. Therefore physical CUPS printing and remote Adapter HTTP health were not
claimed as verified in this run. Set `PRINT_STATION_PRINTER_ADAPTER_URL` to the
reachable edge/Mac address before deploying the control plane.

## Runtime commands

```bash
npm run rebuild:print-station
npm run restart:print-station
npm run verify:print-station
npm run logs:print-station
```

The rebuild command starts the existing platform Kafka, creates required
topics, builds the two control-plane services, and runs the verifier.

## Remaining deployment dependency

The remote Adapter must be reachable from the MES host and must publish Kafka
printer heartbeat/status events to the same protected broker. RabbitMQ is not
part of this deployment path. The Adapter's local CUPS host/queue settings stay
in its separate edge Compose file.
