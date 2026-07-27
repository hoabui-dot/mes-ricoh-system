# Demo WO Execution Dispatch with Real Print Station Completion

## Scope

Implemented the demo execution path in `process-expand/Implement-Demo-WO-Execution-Dispatch-with-Real-Print-Station-Completion.md` without weakening the production approval default.

## Implemented

- Added explicit `MES_DEMO_BYPASS_RESOURCE_ALLOCATION` policy handling. The default is `false`; when explicitly enabled, approval records `DEMO_RESOURCE_BYPASS` and a reason in `wo_approval_log`.
- Added `POST /api/mes/execution/work-orders/{id}/start-execution`. It transitions Released work orders to InProgress and dispatches only predecessor-ready operations.
- Added `wo_print_job`, `wo_print_job_attempt`, and `wo_print_job_event` in execution migration `000015_demo_execution_dispatch_print_jobs.up.sql`.
- Added complete operation target snapshots: `KIOSK_DEMO`, `PRINT_STATION`, and rejection of `UNRESOLVED` targets.
- Added durable Kafka outbox dispatch for `command.printer.print`. The MES print job ID is used as the adapter-compatible `job_id`, preserving WO, operation, station, adapter, correlation, and idempotency information.
- Added Kafka consumer group `mes-execution-printer-results` for `station.events.printer`. Successful printer results finish the print operation, close its execution session, publish `MES.Execution.OperationFinished.v1`, dispatch the next ready operation, and attempt WO completion. Failures persist `ExecutionError` and remain retryable.
- Added `POST /work-orders/{id}/operations/{operationId}/print-retry` with durable attempt incrementing.
- Added readiness enforcement through the existing Master Data endpoint. A print operation requires an active binding, online lifecycle/runtime, connected Kafka projection, and at least one ready printer. Station ID/code are taken from the live readiness response.
- Added demo Kiosk terminal migration `000002_demo_terminal.up.sql`, terminal-target broadcast support, released/in-progress filtering, and real-time refresh on dispatch/finish events.
- Added `scripts/verify-mes-wo-to-physical-print-flow.mjs` and npm command `verify:mes:wo-physical-print` for explicit-WO API evidence collection.

## Event flow

```text
MES approval (strict by default)
  -> start-execution
  -> predecessor-ready dispatch
  -> station.commands.printer / command.printer.print
  -> Edge Printer Adapter and physical printer
  -> station.events.printer / printer.printed or printer.error
  -> MES durable result consumer
  -> operation completion and next dispatch
  -> Kiosk Gateway event fan-out and SignalR UI refresh
```

The browser never calls the Printer Adapter for production execution. HTTP remains a management/diagnostic path; Kafka is authoritative.

## Verification

Passed:

- `go test ./...` in `services/mes-execution-service`.
- `go test ./...` in `services/mes-kiosk-gateway-service`.
- MES Console and Kiosk Operator UI builds.
- `npm run rebuild:mes`.
- Execution migration `000015` applied and `PrinterResultConsumer` started.
- Gateway migration `000002` applied after correcting the terminal UUID collision.
- Gateway health returned HTTP 200.
- Live print readiness endpoint returned a truthful block: `PRINT_STATION_RUNTIME_NOT_READY` and `ready_printer_count=0` for the current Zebra station.

Not claimed:

- Physical CUPS `print-test` was verified successfully on the remote MacOS Zebra queue.
- Full WO cross-server Kafka completion remains pending a valid WO with shift, effective resource assignments, and committed allocations; the controlled verifier was stopped by the standard approval guard before dispatch.

## Demo configuration

Keep `MES_DEMO_BYPASS_RESOURCE_ALLOCATION=false` in shared Compose by default. For a controlled demo only, explicitly override it to `true` and provide a non-empty bypass reason. Do not enable it as a production policy.
