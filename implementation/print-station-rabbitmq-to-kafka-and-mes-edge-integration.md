# Print Station RabbitMQ to Kafka and MES Edge Integration

Date: 2026-07-27
Process: `process-expand/Migrate-the-Print-Station-Architecture-from-RabbitMQ-to-Kafka,-Then-Integrate-Edge-Print-Stations-into-the-MES-Workstation-Flow.md`

## Scope and root cause

The Station Agent runtime had been mechanically renamed from RabbitMQ to Kafka
without a working Kafka transport boundary. The renamed Compose files still
declared an invalid `kafka:3.13-management-alpine` image, the monitoring UI
called RabbitMQ Management API paths under Kafka names, and the .NET envelope
used PascalCase metadata while consumers assumed camelCase. The MES Print
Station master-data model existed from migration `0035`, but it had no Kafka
runtime projection or readiness endpoint.

## Implemented transport

Shared Station Agent messaging now uses Confluent.Kafka through:

- `shared/ND.Infrastructure/Messaging/KafkaPublisher.cs`
- `shared/ND.Infrastructure/Messaging/KafkaConsumer.cs`
- `shared/ND.Infrastructure/Messaging/KafkaTopicMap.cs`
- `shared/ND.Infrastructure/Messaging/KafkaOptions.cs`

Topics:

| Purpose | Topic |
|---|---|
| Printer commands | `station.commands.printer` |
| Printer events | `station.events.printer` |
| Job events | `station.events.jobs` |
| Device events | `station.events.devices` |
| Production events | `station.events.production` |
| Integration events | `station.events.integration` |
| Failed events | `station.dlq` |

Rabbit routing keys remain the logical contract and are carried in the
`event-type` header. Producer messages use Kafka keys for ordering, `Acks.All`,
idempotence, and an envelope containing event ID, type, version, timestamps,
source, correlation/causation IDs, station/workstation IDs, partition key, and
payload. Consumers use independent consumer groups, commit only after the
handler succeeds, and publish failed envelopes to the DLQ before committing.
The unmarshaller accepts both PascalCase and camelCase envelope metadata.

The Printer Adapter consumes `command.printer.print` and
`command.printer.print.batch`, reserves the command in SQLite before touching a
physical printer, publishes result/error events, and publishes periodic
heartbeat events plus status changes. Production dispatch no longer falls back
to `printer-01`; a physical target is required.

## Runtime and MES integration

Migration `0036_print_station_runtime_projection` adds:

- `md_print_station_runtime_projection`: lifecycle/runtime/Kafka status,
  adapter identity, heartbeat, printer counts, errors, and printer snapshot.
- `md_print_station_runtime_events`: durable event-ID deduplication.

`PrintStationRuntimeConsumer` consumes `station.events.printer` in its own
group and updates the projection transactionally. APIs added:

- `GET /api/mes/master-data/print-stations/:id/runtime`
- `GET /api/mes/master-data/workstations/:id/print-station-readiness`
- resolved Print Station now includes runtime state and readiness warnings.

The existing `md_print_station` and
`md_workstation_print_station_binding` model remains the source of truth for
master data and one-to-one active binding rules. Printers remain internal to
the Edge Print Station and are not added to the Workstation machine picker.

## Deployment changes

`infra/docker-compose.platform.yml` now advertises Kafka internally as
`kafka:29092` and externally as `100.68.50.41:19092`. Station Agent Compose
joins the external `platform-net` and no longer declares a local RabbitMQ or
Kafka broker. The standalone adapter compose uses direct deployment settings:

```text
KAFKA_BOOTSTRAP_SERVERS=100.68.50.41:19092
KAFKA_CLIENT_ID=PRINT-ADAPTER-01
PRINT_STATION_ID=PRINT-STATION-01
PRINTER_ADAPTER_ID=PRINT-ADAPTER-01
```

The old `station-rabbitmq` and `production-station-rabbitmq` containers were
removed. Their named volumes were not deleted. `mes-rabbitmq` belongs to an
older unrelated stack and was not removed without proving that stack's active
dependencies.

The monitoring UI now reads Kafka connectivity from Printer Adapter health;
it no longer queries RabbitMQ Management API endpoints for queues, exchanges,
bindings, connections, or consumers.

## Verification

- MES Master Data TypeScript build passed.
- Station Gateway, Job Engine, Laser Adapter, Kiosk, Projection, Printer
  Adapter, and Printer Adapter UI Docker builds passed.
- All Station Agent, production, standalone adapter, and platform Compose
  files parsed successfully with `docker compose config`.
- Platform Kafka recreated healthy with advertised external listener.
- Required Kafka topics were created on the running broker.
- Rebuilt Station Gateway, Job Engine, Laser Adapter, Kiosk, and Projection
  containers started healthy.
- MES Master Data migration `0036` applied and runtime consumer joined Kafka.
- Real adapter heartbeat was observed through the remote TCP broker.
- MES runtime API returned `kafka_status=CONNECTED`, `printer_count=1`,
  adapter `PRINT-ADAPTER-01`, and real printer `Zebra-GK420t-CUPS`.
- Current local runtime reports the physical printer `OFFLINE` because this
  development host cannot reach its CUPS queue. No physical print was claimed.

## Remaining acceptance gates

The migration is Kafka-authoritative for the rebuilt Station Agent runtime, but
the final process document's complete physical-print acceptance gate remains
open until the deployment host has a reachable CUPS/TCP printer and verifies
one MES-originated command completes exactly once. Cross-server TLS/ACL
hardening is also not enabled in the current private plaintext lab listener;
production deployment must use a dedicated Kafka user, restricted network
allow-list, and TLS where required.

## Final cleanup and build verification (2026-07-27)

The remaining active configuration and verification scripts were converted to
`KAFKA_BOOTSTRAP_SERVERS`; the old AMQP host/port, RabbitMQ management, queue,
exchange, and binding checks were removed from the operational path. The
monitoring UI now reports Kafka from the Printer Adapter health endpoint rather
than attempting to use a RabbitMQ management API.

Final local image builds passed:

- `printer-adapter:kafka-migration-final`
- `printer-adapter-ui:kafka-migration-final`

These are local verification tags only. No Docker Hub push was performed for
this continuation because the requested Kafka migration did not include a new
registry release tag.

The final runtime check found no Projection consumer error, all required Kafka
topics present, and healthy Station Gateway, Job Engine, Projection, and Kafka
containers. The MES runtime endpoint projected one real printer heartbeat with
`kafka_status=CONNECTED`; the printer remains `OFFLINE` because the local CUPS
queue is unreachable. Therefore the physical exactly-once print acceptance
gate remains intentionally open.

## Standalone compose mapping update (2026-07-27)

The repository-root `docker-compose.print-adapter.yml` was still using the
obsolete RabbitMQ settings. It now identifies the edge as
`PRINT-STATION-01` with adapter `PRINT-ADAPTER-01`, uses Kafka bootstrap
`100.68.50.41:19092`, and points the monitoring UI to
`http://printer-adapter:5003`. Workstation binding is not duplicated in this
file; MES Master Data owns the active one-to-one binding.
