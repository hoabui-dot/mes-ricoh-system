# Kiosk Demo Job Card Implementation Prompt Package

## Target flow

```text
create and release one Work Order
→ KIOSK-DEMO-01 displays one grouped Work Order card
→ detail displays every eligible non-print manual Job Card
→ operator can Start, Complete, Fail, Abort, and Retry where allowed
→ MES Execution persists state
→ Kafka and WebSocket notify Kiosk and MES Console
→ Print Station operation remains external to Demo Kiosk manual handling
```

## Execution order

```text
Phase 00 — Audit and final domain contract
Phase 01 — MES operation failure and state machine
Phase 02 — Demo dispatch, Kafka, and realtime relay
Phase 03 — Grouped Work Order and Job Card read APIs
Phase 04 — Grouped Kiosk UI
Phase 05 — Start/Complete/Fail/Abort/Retry and MES sync
Phase 06 — Authentication, sessions, reconnect, reliability
Phase 07 — Canonical seed and deterministic WO preparation
Phase 08 — Full E2E certification
```

For every phase, provide the master rules and the active phase prompt to the implementation AI.

Do not execute multiple phases in one run unless explicitly authorized.

Each phase must generate a Vietnamese report and explicitly authorize the next phase.
