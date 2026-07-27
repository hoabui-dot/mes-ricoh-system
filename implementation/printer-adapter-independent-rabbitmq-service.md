# Independent Printer Adapter: Remote RabbitMQ Restoration

Date: 2026-07-26
Status: `IMPLEMENTED_AND_PARTIALLY_VERIFIED`

## Review decision

The previous HTTP refactor replaced only the production command transport.
The existing Job Engine result consumers, event contracts, Projection printer
result handling, and Kiosk SignalR device flow were reusable. Restoration was
safe after adding a durable command reservation and removing the Job Engine's
normal HTTP dispatch. No second production execution path remains.

## Root cause

`JobQueueScheduler` built `ProductionBatchPrintCommand`, then called
`POST /api/print` and directly invoked `PrinterBatchPrintedConsumer.ApplyEventAsync`.
Printer Adapter had no RabbitMQ consumer/publisher workers. RabbitMQ result
consumers remained as compatibility code, which made the architecture
HTTP-primary and allowed a future deployment mistake to execute the same
command through two transports.

## Implemented

- Added Printer Adapter RabbitMQ consumer for `command.printer.print.batch`
  and `command.printer.print`.
- Added result publication for `printer.batch.printed` and `printer.error`.
- Added periodic `printer.heartbeat` and change-only `printer.status.changed`.
- Added `printer_command_executions` with a unique `command_id` index.
- Reserved `event_id` before rendering or printer I/O; redelivery never prints
  the same command twice.
- Moved Job Engine production dispatch to its existing SQLite outbox using
  `command.printer.print.batch`; removed the scheduler HTTP print call and
  direct result application.
- Kept `POST /api/print` for manual/administrative diagnostics only, protected
  by `X-Print-Source: MANUAL_TEST` or `ADMIN`.
- Extended shared RabbitMQ options with TLS and client connection name.
- Added startup retry and automatic recovery behavior to shared RabbitMQ
  publisher/consumer connection setup.
- Projection Service consumes printer runtime events and broadcasts
  `OnPrinterHeartbeat`, `OnPrinterStatusChanged`, and `OnPrinterError`; it also
  updates the existing device read model and `OnDeviceStatusUpdate` flow.
- Kiosk listens to the explicit printer SignalR events and maps them into its
  existing live device state.
- Added standalone remote-broker compose at
  `print-marking/station-agent/docker-compose.printer-adapter.yml`.
- Added authenticated RabbitMQ/CUPS dependency details to `/api/health` and
  made health `Degraded` when IPP cannot prove the configured physical queue is
  ready.
- Fixed Projection runtime queue dispatch so one queue has one consumer and
  routes `printer.heartbeat`, `printer.status.changed`, and `printer.error` by
  routing key. This avoids RabbitMQ load-balancing a heartbeat into the error
  deserializer.
- Added repeatable read-only and guarded physical verification scripts.
- Updated root `docker-compose.print-adapter.yml` with the current direct demo
  values (`100.68.50.41:5673`, `guest/guest`, `/`, TLS disabled) and the
  pushed RabbitMQ-enabled image. Production should replace the guest account
  with a dedicated user.

## Event topology

| Direction | Exchange | Routing key | Queue |
| --- | --- | --- | --- |
| Job Engine -> Adapter | `station.events` | `command.printer.print.batch` | `printer-adapter.print-commands` |
| Job Engine -> Adapter | `station.events` | `command.printer.print` | `printer-adapter.print-commands` |
| Adapter -> Job Engine | `station.events` | `printer.batch.printed` | `job-engine.batch-printed-events` |
| Adapter -> Projection | `station.events` | `printer.heartbeat` | `projection-service.printer-runtime-events` |
| Adapter -> Projection | `station.events` | `printer.status.changed` | `projection-service.printer-runtime-events` |
| Adapter -> Projection/Job Engine | `station.events` | `printer.error` | runtime-specific queues |

`ProductionBatchPrintedEvent.command_id` preserves correlation with the
command `event_id`. Existing job/work-order IDs remain in the label items and
production order fields.

## Verification

Passed:

- Docker build of Printer Adapter for `linux/amd64`.
- Docker build of Job Engine and Projection Service after contract changes.
- Isolated adapter connected to the existing private `station-net` RabbitMQ.
- Management API published one batch command with `routed=true`.
- Adapter rendered and sent one label through the simulator.
- Job Engine consumed the resulting `printer.batch.printed` event.
- Exact command redelivery produced no second `Processing print job` event.
- Rebuilt Projection Service started with one `printer.#` runtime dispatcher;
  the existing queue also retains explicit historical bindings for heartbeat,
  status, and error without additional consumers.

## Current runtime verification

The live station verification is recorded in
`implementation/remote-printer-adapter-runtime-verification.md`. RabbitMQ
connectivity, command consumers, Projection runtime consumption, projected
heartbeat timestamps, and Kiosk access passed. The physical CUPS queue was
offline, so no label was sent and the end-to-end physical print remains
unverified.

Not yet proven:

- A physical cross-server broker connection with TLS and restricted service
  credentials. The local verification used `guest/guest` only on the private
  development broker.
- A real MES-originated work order through Station Gateway to a physical
  printer. The test used one management-published command and the simulator.
- Broker outage/recovery under a running production workload. Startup retry
  code is compiled but a live outage test was not run to avoid disrupting the
  shared demo stack.

Docker Hub push passed:

- Image: `vanhoadotbui2628/printer-adapter:rabbitmq-remote-20260727`
- Platform: `linux/arm64`
- Image manifest digest: `sha256:033ca133dc220152ae4d990a9c0b2c44444671fcd917077cd3f168bc83a69cac`
- OCI index digest: `sha256:a31f4ba37e187eb68685600a6623fd50fd100b75c9ab6f9ab4e3027a3dd2e03d`
- Push result: successful

## Remaining risks

The durable reservation closes the duplicate physical-print window for
redelivery, but a process crash after physical printer acceptance and before
the stored result is published still relies on the stored execution record and
redelivery behavior. Production should use publisher confirms and a broker
dead-letter policy, plus a dedicated RabbitMQ user/vhost with TLS where the
network requires it.
