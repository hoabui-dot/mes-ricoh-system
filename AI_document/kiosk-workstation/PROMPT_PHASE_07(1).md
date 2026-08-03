# Phase 07 — Canonical Demo Seed and Deterministic Work Order Preparation

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-06/REPORT_PHASE_06.md`  
Required report language: Vietnamese

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, Kiosk reference document, source, migrations, event contracts, seed, tests, and previous report before changing anything.

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_06_PASSED_READY_FOR_PHASE_07
```

Otherwise create only `AI_document/Kiosk-Demo/Phase-07/REPORT_PHASE_07.md` with:

```text
KIOSK_DEMO_PHASE_07_BLOCKED
```

# 3. Objective


Create deterministic, idempotent seed and preparation commands so one Work Order produces one grouped Demo Kiosk card with every expected manual Job Card, while the final Print Station operation remains excluded from manual handling.


# 4. In Scope


- Demo terminal and operator.
- Demo dispatch configuration.
- Failure and abort reason codes.
- Complete MES production/resource prerequisites.
- Multiple manual operations.
- One final Print Station operation.
- Success scenario.
- Failure/retry scenario.
- Prepare, verify, and cleanup commands.
- Seed and fixture idempotency.


# 5. Out of Scope


- Simulating physical print completion inside Kiosk.
- Permanent mutable Work Orders in canonical base seed unless explicitly approved.
- Manual page setup before the test.


# 6. Mandatory Inspection

Inspect current Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka/outbox, WebSocket, Print Station, Kong, Keycloak, seed, Docker, and tests.

Search every consumer before changing contracts.

# 7. Required Work


## 7.1 Base seed

Ensure deterministic:

- `KIOSK-DEMO-01`;
- demo operator and role;
- terminal/site context;
- dispatch policy;
- reason codes;
- complete production definition;
- selected line and resource planning;
- manual operations;
- final Print Station operation;
- predecessor sequence.

## 7.2 API-driven preparation

Create repository-convention commands equivalent to:

```text
prepare:kiosk-demo:success
prepare:kiosk-demo:failure
verify:kiosk-demo
cleanup:kiosk-demo
```

Use supported Work Order creation, planning, allocation, approval/release, and dispatch APIs.

Do not insert Work Order runtime rows directly.

## 7.3 Success scenario

Prepare one WO whose manual Job Cards can be completed in sequence.

The final Print Station operation remains owned by the real Print Station flow.

## 7.4 Failure scenario

Prepare one WO that supports:

```text
Start
→ Fail with reason
→ Work Order pause/hold
→ successor blocked
→ Retry
→ continue
```

## 7.5 Verification

Verify:

- exactly one grouped card per prepared WO;
- every expected manual operation appears;
- no manual print card appears;
- Work Center and Workstation are present;
- predecessor states are correct;
- no stale session, allocation, reservation, or queue record exists.

## 7.6 Cleanup

Clean generated:

- Work Orders;
- operations and sessions according to approved test cleanup;
- confirmations;
- failure attempts;
- allocations and reservations;
- outbound queue records;
- test events;
- temporary browser fixtures.

Preserve canonical base seed.

## 7.7 Idempotency

Run seed twice, prepare twice, verify twice, and cleanup twice.

The second run must not duplicate data or fail due to stale state.


# 8. Guardrails

- MES Execution remains authoritative.
- Browser never publishes Kafka.
- One list card represents one Work Order.
- Detail includes every eligible non-print manual Job Card.
- Print Station remains outside Demo Kiosk manual handling.
- Demo routing does not alter production routing.
- No optimistic production success.
- No applied migration edits.
- No mandatory skipped tests.

# 9. API/Event/UI Rules

Use current repository conventions.

Persist before outbox publication.

Use verified identity, backend states, blockers, and action eligibility.

Support VI default and EN/JA/KO.

# 10. Data and Cleanup

Use additive migrations only when required.

Preserve history.

Use deterministic business codes and exact cleanup.

# 11. Mandatory Tests


- Base seed verification.
- Seed twice.
- Success preparation twice.
- Failure preparation twice.
- One grouped card per WO.
- Expected manual Job Card count.
- Print Station excluded.
- Work Center/Workstation context.
- Correct predecessor states.
- Failure reason availability.
- No stale runtime records before preparation.
- Cleanup twice.
- Zero Work Orders, sessions, allocations, reservations, queue leaks, and test events after cleanup.
- Existing canonical MES ready-to-run certification regression.


Run applicable frontend typecheck/build, backend tests/builds, API integration, Kafka/outbox, WebSocket, real Playwright, and regression.

Record exact declared, executed, passed, failed, and skipped counts.

# 12. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-07/<run-id>/
```

Include baseline, changes, build, API, event, WebSocket, browser, cleanup, and acceptance evidence.

# 13. Report

Create:

```text
AI_document/Kiosk-Demo/Phase-07/REPORT_PHASE_07.md
```

Use `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

# 14. Acceptance Criteria


- One command prepares a valid success WO.
- One command prepares a valid failure/retry WO.
- Each WO appears once in Kiosk.
- Every expected manual Job Card appears.
- Print Station is excluded.
- No manual setup is required.
- Seed, preparation, verification, and cleanup are idempotent.
- Report authorizes Phase 08.


# 15. Completion Gate

Success:

```text
KIOSK_DEMO_PHASE_07_PASSED_READY_FOR_PHASE_08
```

Failure:

```text
KIOSK_DEMO_PHASE_07_BLOCKED
```

Do not start Phase 08 automatically.
