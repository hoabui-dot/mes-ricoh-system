# Remote Printer Adapter Runtime Verification

Date: 2026-07-26
Status: `PARTIALLY_VERIFIED`

## Scope

Verified the live integration on the current station host:

```text
Remote Printer Adapter -> RabbitMQ station.events -> Projection Service -> SignalR / Kiosk
```

The physical print phase was intentionally not executed because the configured
CUPS queue was not ready. The guarded physical test script stopped before
publishing a command.

## Root Causes Found

1. The active container used the local AMD64 override and old
   `printer-adapter:local-amd64` image, so it exposed the old health endpoint
   and had no RabbitMQ workers.
2. The Compose healthcheck used `/dev/tcp` under `/bin/sh`, which is not
   supported by the runtime shell.
3. Projection used three consumers on one
   `projection-service.printer-runtime-events` queue. RabbitMQ load-balances
   messages across consumers on the same queue, so a heartbeat could reach the
   error deserializer and be nacked as an invalid `PrinterErrorEvent`.
4. CUPS fallback treated a reachable proxy port as `Online` even when IPP
   could not identify the configured physical queue.

## Fixes

- Added `IsConnected` state to the shared RabbitMQ consumer and publisher.
- Expanded `/api/health` with authenticated RabbitMQ state, connection name,
  vhost, CUPS queue and driver state, printer counts, and degraded status.
- Changed CUPS fallback to remain `Offline` unless IPP returns a valid queue
  state.
- Replaced the shell-incompatible healthcheck with an explicit Bash TCP probe
  that requires a `Healthy` JSON status.
- Updated the local AMD64 override to use
  `printer-adapter:local-rabbitmq-amd64`.
- Changed Projection to one `printer.#` runtime consumer with a routing-key
  dispatcher.
- Added read-only `scripts/verify-remote-printer-integration.sh`.
- Added guarded `scripts/trigger-physical-printer-test.sh`; it permits only one
  label and refuses to publish until verification passes.

## Live Verification Results

Passed:

- Corrected AMD64 Printer Adapter image built successfully.
- Job Engine, Projection Service, and Kiosk images rebuilt successfully.
- Printer Adapter connected to RabbitMQ at `100.68.50.41:5673` using vhost `/`.
- Two `PRINT-ADAPTER-01` connections were visible through RabbitMQ client
  properties, one for the consumer and one for the publisher.
- `printer-adapter.print-commands` had active consumers.
- `projection-service.printer-runtime-events` had one active dispatcher consumer.
- Exchange `station.events` and command/runtime/result bindings were present.
- Printer `Zebra-GK420t-CUPS` and CUPS queue
  `Zebra_Technologies_ZTC_GK420t` were registered.
- Projection REST returned a projected Zebra device row.
- The projected `lastSeenAt` changed across a heartbeat interval.
- Kiosk proxy returned the projected device endpoint successfully.
- Verification scripts passed syntax, Compose validation, and guarded-stop
  behavior.

Current physical state:

```json
{
  "status": "Degraded",
  "rabbitMq": "Connected",
  "cups": "Disconnected",
  "printer": "Zebra-GK420t-CUPS",
  "driverStatus": "Offline"
}
```

The adapter log showed the host CUPS proxy connection refused and IPP could not
resolve the configured queue. No physical label was sent.

## Not Verified

- Physical Zebra output.
- Full Station Gateway -> Job Engine -> physical CUPS -> result flow.
- Browser-visible Kiosk SignalR result after a physical print.
- Cross-server TLS and dedicated RabbitMQ credentials.
- Live RabbitMQ outage/reconnect test; it remains unsafe to interrupt the
  shared broker used by other station services.

## Commands

From `print-marking/station-agent`:

```bash
./scripts/verify-remote-printer-integration.sh
./scripts/trigger-physical-printer-test.sh --printer Zebra-GK420t-CUPS --copies 1
```

The second command must not be run until the first reports the printer as
`ONLINE` and the adapter health as `Healthy`.

## Files Changed

- `shared/ND.Infrastructure/Messaging/IRabbitMqConsumer.cs`
- `shared/ND.Infrastructure/Messaging/IRabbitMqPublisher.cs`
- `shared/ND.Infrastructure/Messaging/RabbitMqConsumer.cs`
- `shared/ND.Infrastructure/Messaging/RabbitMqPublisher.cs`
- `services/printer-adapter/src/ND.PrinterAdapter.Api/Program.cs`
- `services/printer-adapter/src/ND.PrinterAdapter.Infrastructure/DeviceAdapters/CupsPrinterStateAggregator.cs`
- `services/projection-service/src/ND.ProjectionService.Infrastructure/Messaging/ProjectionEventConsumer.cs`
- `docker-compose.print-adapter.yml`
- `docker-compose.print-adapter.local-amd64.yml`
- `station-agent/docker-compose.printer-adapter.yml`
- `station-agent/scripts/verify-remote-printer-integration.sh`
- `station-agent/scripts/trigger-physical-printer-test.sh`
