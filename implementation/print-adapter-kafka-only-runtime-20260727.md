# Printer Adapter Kafka-Only Runtime Migration

Date: 2026-07-27

## Root cause

The remote Printer Adapter had already moved production commands and heartbeat
events from RabbitMQ to Kafka, but several callers still treated its HTTP
listener as a runtime dependency. Kiosk label-template/printer routes, the
Projection Service canonical-printer and activation routes, the Job Engine
active-printer lookup, and Printer Adapter Monitoring all retained HTTP calls.
When the adapter was deployed on the separate macOS server, those calls either
hit the MES host's old local port 5003 or failed with 503/502.

## Implemented transport

All service-to-adapter management requests now use Kafka request/reply:

```text
Kiosk / Projection / Job Engine / Adapter UI
  -> station.events, command.printer.management
  -> Printer Adapter management consumer
  -> station.events, printer.management.response
```

Responses correlate through `request_id`. Each caller has its own Kafka
consumer group and 15-30 second timeout. The request body preserves the
original HTTP method/path/query/body contract, so the UI API surface does not
change.

Production print execution remains event-driven:

```text
Job Engine -> command.printer.print(.batch)
           -> Printer Adapter -> physical CUPS/TCP printer
           -> printer.printed / printer.batch.printed / printer.error
```

Heartbeat and status events remain Kafka events and are projected by Projection
Service for Kiosk SignalR updates.

## Code changes

- Kiosk added `PrinterManagementKafkaClient`; all existing label-template,
  printer, assignment, history, discovery, health, maintenance, and activation
  proxy routes now publish management commands instead of using
  `PRINTER_ADAPTER_URL`.
- Projection Service added the same Kafka client for canonical printer reads,
  maintenance, activation, and deactivation.
- Job Engine scheduler now requests `/api/printers/active` over Kafka before
  assigning batch jobs. It no longer calls the adapter URL.
- Printer Adapter added `PrinterManagementConsumer`, including template CRUD,
  printer activation, discovery, printer health, maintenance, test connection,
  adapter health, and print-history read operations needed by current callers.
- Printer Adapter UI now uses Kafka management request/reply for adapter health,
  printer list, CUPS summary, Kafka summary, heartbeats, and print history.
- HTTP adapter endpoints remain for local liveness/diagnostics and backward
  compatibility only. No central production caller uses them.
- `printer-adapter-ui` build explicitly uses esbuild CSS minification and lists
  esbuild as a dependency, fixing the ARM64 Alpine optional `lightningcss`
  failure.

## Compose and image release

Both deployment files now point to the ARM64 release:

- `docker-compose.print-adapter.yml`
- `print-marking/station-agent/docker-compose.printer-adapter.yml`

Published images:

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-kafka-management-20260727-v2-arm64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-kafka-management-20260727-v2-arm64`

Multi-platform manifests were also pushed:

- Adapter digest: `sha256:74d6a47eb4d1ef3641953842d114260f63c32852218700dbd026444827dea178`
- Adapter UI digest: `sha256:fb8e01cbeea08a9dc2837ba0bb4f1072241d400ddd58e88f4e13d77f7ddc13d8`

The build verified `linux/amd64` and `linux/arm64` variants and Docker Hub
push completed successfully.

## Verification

- Adapter Docker build: passed.
- Adapter UI Docker build: passed for ARM64 after the CSS minifier fix.
- Projection Service Docker build: passed.
- Job Engine Docker build: passed.
- `docker compose config` passed for the independent adapter, root adapter
  deployment, and platform/print-station composition.
- `git diff --check` passed.
- Docker Hub manifest inspection confirmed both architectures.

After the code change, `npm run rebuild:print-station` rebuilt and recreated
the local Kiosk and Projection control plane. Both containers became healthy;
Kafka topics were present, and logs showed the new Kiosk and Projection
`printer.management.response` consumers. A Kiosk label-template request
published `command.printer.management` to Kafka as expected. The external
remote Adapter was not running from this workspace, so no response was
available.

The realtime verifier was also corrected: it no longer probes the old HTTP
adapter URL by default. It verifies Kiosk, Projection, SignalR, Docker, and
Kafka locally; remote Adapter verification is explicit with
`VERIFY_REMOTE_PRINTER_ADAPTER=true PRINTER_ADAPTER_BASE_URL=...`.
`npm run verify:print-station` passed after this change.

Full remote E2E physical printing was not run from this workspace because the
real CUPS device and macOS deployment are external. On the Mac server, run
`docker compose -f docker-compose.print-adapter.yml pull && docker compose -f
docker-compose.print-adapter.yml up -d --force-recreate`, then verify Kafka
consumer logs, `/api/health` locally on the adapter, Kiosk label-template list,
and one controlled print test.

## Remaining note

Legacy `docker-compose.prod*.yml` and simulator-era documentation still contain
historical `PRINTER_ADAPTER_URL` settings. They are not used by the canonical
`infra/docker-compose.print-station.yml` deployment. They should be retired or
rewritten before those legacy stacks are used again; enabling them would
reintroduce an HTTP runtime path.
