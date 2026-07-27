# Full MES WO to Physical Printer Flow

Date: 2026-07-27

## Scope

This implementation follows `process-expand/Execute-and-Verify-the-Full-MES-WO-to-Physical-Printer-Flow.md` and uses the remote MacOS Printer Adapter only. The MES host did not run a local Printer Adapter. The controlled verification used `TEST_MODE=demo-bypass` with an explicit reason because the fixture had no committed resource allocation.

## Changes

- Fixed selected Production Version readiness and planning calculation version.
- Added nullable Routing read-model context migration and decoupled Routing event projection.
- Mapped logical `command.printer.print` to `station.commands.printer` and added the required Kafka `event-type` header.
- Added the required UTC command timestamp.
- Updated the MES printer-result consumer for PascalCase/camelCase/snake_case envelopes, `Payload` unwrapping, and explicit UUID/text lookup types.
- Fixed Routing release events to publish the Operation Catalog code.

## Root causes found

1. The creation workflow ignored the selected Production Version.
2. Decoupled Routing events could not enter the execution read model because item/site columns were non-null and the consumer used empty UUID values.
3. Logical `command.printer.print` was published to a topic absent from the deployed topology.
4. The Adapter requires the `event-type` header to route commands to its handler.
5. MES commands omitted the required timestamp and were rejected by the Adapter contract.
6. MES result handling silently discarded the Adapter's PascalCase envelope and then failed lookup because PostgreSQL inferred `$1` as UUID for a varchar comparison.

## Runtime evidence

Remote Adapter: `http://100.108.194.102:5003`

- `/api/health`: `Healthy`
- Kafka: Connected to `100.68.50.41:19092`
- CUPS: Connected, queue `Zebra_Technologies_ZTC_GK420t`, driver `Online`
- active printer: `Zebra-GK420t-CUPS`, one printer, no simulator

The official creation workflow passed readiness for the selected PV, MBOM, and Routing. The verifier passed service configuration, remote Adapter health, approval in demo-bypass mode, and start execution.

`WO-20260727-0008`, `WO-20260727-0009`, and `WO-20260727-0010` reached the remote Adapter through Kafka and physically printed on the Zebra/CUPS queue. For `WO-20260727-0010`, replaying the already-published result event without sending another print command persisted the result, marked the print job `Completed`, and marked operation sequence 10 `Finished`.

## Remaining verification limitation

The full WO terminal state is not claimed. The multi-operation fixture queued a second print operation, and the current remote Adapter did not produce a second history record during the bounded run. The verifier artifact correctly reports `success: false` for the full terminal WO assertion. No database state was fabricated and no direct SQL completion was used.

Artifacts:

- `artifacts/wo-print-e2e/2026-07-27T13-12-31-018Z`
- `artifacts/wo-print-e2e/2026-07-27T13-06-56-861Z`
- `artifacts/wo-print-e2e/2026-07-27T13-02-22-755Z`

The remaining run must use a single-operation released Routing or investigate the remote Adapter handling of the second command, then verify the final operation result and `wo_header.status = Completed`. The service was restored to strict allocation mode after the controlled run; the current container environment is `MES_DEMO_BYPASS_RESOURCE_ALLOCATION=false`.

## Verification commands

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml build mes-execution-service
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml ps
docker logs mes-execution-service
```
