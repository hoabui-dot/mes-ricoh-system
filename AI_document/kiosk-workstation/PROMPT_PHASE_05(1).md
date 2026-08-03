# Phase 05 — Manual Job Card Commands and MES Synchronization

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-04/REPORT_PHASE_04.md`  
Required report language: Vietnamese

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, current Kiosk reference document, source, migrations, event contracts, seed, tests, and previous report before changing anything.

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_04_PASSED_READY_FOR_PHASE_05
```

Otherwise create only `AI_document/Kiosk-Demo/Phase-05/REPORT_PHASE_05.md` with:

```text
KIOSK_DEMO_PHASE_05_BLOCKED
```

# 3. Objective


Connect Job Card controls to authoritative MES commands and deliver complete success, failure, abort, and retry demo workflows with realtime MES Console synchronization.


# 4. In Scope


- Start.
- Complete.
- Fail.
- Abort.
- Retry.
- Quantity and reason forms.
- Pessimistic feedback.
- Idempotency.
- Active-session recovery.
- Event-driven Kiosk refresh.
- MES Console Work Order Detail synchronization.


# 5. Out of Scope


- Manual commands for Print Station operations.
- Offline command queue.
- New traceability behavior unrelated to current operations.
- Final authentication hardening.


# 6. Mandatory Inspection

Inspect current implementations for Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka/outbox, WebSocket, Print Station, Kong, Keycloak, seed, and tests.

Search all consumers before changing contracts.

# 7. Required Work


## 7.1 Start

Render Start only when backend `can_start` is true.

Send the authenticated command.

Wait for success and authoritative refresh.

## 7.2 Complete

Render Complete only for an active manual session.

Use current backend behavior metadata for required quantities, scans, labels, or reason fields.

Do not rely on hardcoded legacy operation codes.

## 7.3 Fail

Require an approved failure reason.

Show the expected Work Order impact before confirmation.

Persist through the Phase 01 failure command.

## 7.4 Abort

Keep Abort separate from Fail.

Use destructive confirmation and check `response.ok`.

## 7.5 Retry

Render Retry only when backend allows it.

Preserve failure history.

## 7.6 Active-session recovery

After browser refresh, recover the session from the detail API.

Remove all generated `MOCK-*` session behavior.

## 7.7 Stable idempotency

Reuse the same idempotency key for a retry of the same user attempt.

Prevent duplicate clicks.

## 7.8 MES synchronization

For each command, verify:

```text
MES Execution persisted state
→ outbox event
→ Kafka
→ Kiosk Gateway
→ WebSocket
→ Kiosk refetch
→ MES Console refetch
```

Both UIs must show the same operation and Work Order state.

## 7.9 Print exclusion

Print Station operation remains read-only and automatic.


# 8. Guardrails

- MES Execution remains authoritative.
- Browser never publishes Kafka.
- One list card represents one Work Order.
- Detail contains every eligible non-print manual Job Card.
- Print Station is not manually operated at Demo Kiosk.
- Demo routing does not change production routing.
- No optimistic production success.
- No applied migration edits.
- No mandatory skipped tests.

# 9. API/Event/UI Rules

Use repository conventions.

All commands persist before outbox publication.

Use backend-derived states, blockers, and action eligibility.

Support VI default and EN/JA/KO.

# 10. Data and Cleanup

Use additive migrations only when necessary.

Preserve history.

Use deterministic business codes and exact cleanup.

# 11. Mandatory Tests


- Start success and rejection.
- Complete success.
- Quantity validation.
- Scrap and reason validation.
- Fail success.
- Fail missing reason.
- Fail invalid state.
- Work Order pause/hold.
- Successor blocking.
- Retry success and denial.
- Abort distinction.
- Duplicate-click protection.
- Stable idempotency.
- Active session survives refresh.
- No `MOCK-*` session.
- Print Station has no manual controls.
- Kiosk and MES Console converge after each state.
- Real Playwright success and failure flows.


Run applicable typecheck, build, backend tests, API integration, Kafka/outbox, WebSocket, real Playwright, and regression.

Record declared, executed, passed, failed, and skipped counts.

# 12. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-05/<run-id>/
```

with baseline, changes, build, API, event, WebSocket, browser, cleanup, and acceptance evidence.

# 13. Report

Create:

```text
AI_document/Kiosk-Demo/Phase-05/REPORT_PHASE_05.md
```

using `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

# 14. Acceptance Criteria


- Start, Complete, Fail, Abort, and Retry work according to backend policy.
- Active session survives refresh.
- No mock session fallback remains.
- Duplicate commands are prevented.
- Successors obey predecessor rules.
- Kiosk and MES Console converge.
- Print Station remains non-manual.
- Report authorizes Phase 06.


# 15. Completion Gate

Success:

```text
KIOSK_DEMO_PHASE_05_PASSED_READY_FOR_PHASE_06
```

Failure:

```text
KIOSK_DEMO_PHASE_05_BLOCKED
```

Do not start Phase 06 automatically.
