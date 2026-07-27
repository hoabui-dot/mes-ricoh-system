# Repeatable MES WO to Physical Printer E2E

Date: 2026-07-27

## Correct fixture

Use Production Version `PV-E2E-SINGLE-20260727` (`4314a2bc-6ab4-4391-bcb9-4a8865bf6c27`), not `PV-20260727-0004`. The latter uses an older Routing release projection with no workstation and no output-label flag. The E2E fixture resolves Routing `RT-20260727-0004`, Operation `OP-MIX`, Workstation `WS-20260727-0006`, Print Station `PRINT-STATION-01`, and printer `Zebra-GK420t-CUPS`.

## Implementation

- Direct `POST /work-orders` now accepts `production_version_id` and resolves readiness from that authoritative selection.
- Work Order detail now returns `print_jobs`, including command event, idempotency, attempt count, printer, and completion state.
- `MES_MATERIAL_STAGING_REQUIRED=false` keeps WMS material staging advisory for demo execution without changing inventory.
- `scripts/ensure-mes-print-kafka-topics.sh` creates the four platform topics idempotently. The printer command/result topic is `station.events.printer`.
- `scripts/run-mes-physical-print-e2e.mjs` creates, computes, approves, stages, starts, polls, and asserts a completed physical-print Work Order.

## Command

```bash
npm run e2e:mes:physical-print
```

The remote Adapter/Kafka/CUPS service must already be connected. The command does not use the Adapter HTTP print endpoint.

## Runtime verification

> Historical run notice: this run used temporary approval and material
> staging bypasses. Those bypasses have been removed; repeat the flow only
> after valid allocations and WMS stock are prepared.

| Check | Result |
|---|---|
| Kafka topics | `station.events.printer`, production, integration, devices ready |
| WO | `WO-20260727-0023` / `1bed30de-ce90-4ed1-b363-0d5fb68d723d` |
| Print operation | `OP-MIX`, `PRINT_STATION`, Workstation bound |
| Material staging | `Bypassed`, WMS inventory unchanged |
| Approval | `Released` with advisory resource warning |
| Print job | `965325ab-31d8-4928-9317-ba6b7fabcbb1`, `Completed`, one attempt |
| Printer | `Zebra-GK420t-CUPS` |
| MES operation | `Finished` |
| Work Order | `Completed` |

MES logs recorded a correlated `printer.printed` result from the remote Adapter and the database recorded the completed attempt and event. See this report for the full flow.
