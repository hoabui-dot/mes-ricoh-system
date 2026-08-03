# Phase 03 — Grouped Kiosk Work Order Read Model and Job Card APIs

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-02/REPORT_PHASE_02.md`  
Required report language: Vietnamese

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, current Kiosk reference document, source, migrations, event contracts, seed, tests, and previous report before changing anything.

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_02_PASSED_READY_FOR_PHASE_03
```

Otherwise create only `AI_document/Kiosk-Demo/Phase-03/REPORT_PHASE_03.md` with:

```text
KIOSK_DEMO_PHASE_03_BLOCKED
```

# 3. Objective


Implement Kiosk-oriented read contracts that return one grouped Work Order summary and every eligible non-print manual Job Card for a selected Work Order.


# 4. In Scope


- Grouped Work Order list.
- Job Card detail projection.
- Status counts and progress.
- Work Center, Workstation, selected line, and resource context.
- Active execution-session recovery.
- Failure details.
- Backend-derived action eligibility.
- Separate optional read-only Print Station context.
- Pagination, terminal scope, and demo dispatch scope.


# 5. Out of Scope


- Final UI redesign.
- Manual command changes.
- Print Station command behavior.
- New Kiosk-owned production state.


# 6. Mandatory Inspection

Inspect current implementations for Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka/outbox, WebSocket, Print Station, Kong, Keycloak, seed, and tests.

Search all consumers before changing contracts.

# 7. Required Work


## 7.1 List contract

Provide one list row per Work Order.

Return:

- WO code;
- item code/name;
- quantity/UOM;
- selected line;
- Work Order state;
- total manual jobs;
- waiting/ready/in-progress/completed/failed/blocked counts;
- progress;
- updated time.

## 7.2 Detail contract

Return all eligible manual Work Order Operations as Job Cards.

Each card includes:

- operation code/name/sequence;
- predecessor status;
- selected line;
- Work Center;
- Workstation;
- allocated resource;
- execution target;
- state;
- active session;
- operator and terminal;
- quantities;
- timestamps;
- failure details.

## 7.3 Print exclusion

Exclude Print Station operations from the manual Job Card collection.

When useful, return them in a separate read-only `print_operations` or source-compatible section.

## 7.4 Action eligibility

Backend returns:

```text
can_start
can_complete
can_fail
can_abort
can_retry
blockers
```

Use actual naming conventions.

## 7.5 Active-session recovery

Expose the authoritative active session so page refresh does not lose an in-progress task.

## 7.6 Progress semantics

Define progress clearly.

Do not mark the WO complete based only on manual jobs when a required Print Station operation remains pending.

## 7.7 Compatibility

Prefer additive endpoints such as Kiosk-specific list/detail or additive response fields.

Do not break MES Console consumers.


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


- One Work Order produces one list item.
- Every expected manual operation appears once.
- Print Station operation does not appear as a manual Job Card.
- Print operation appears only in optional read-only context.
- Counts match operation states.
- Progress is correct.
- Active session is included.
- Failure reason is included.
- Action eligibility and blockers match backend state.
- Terminal and demo dispatch scope.
- Pagination.
- Refresh consistency.
- MES Console compatibility regression.


Run applicable typecheck, build, backend tests, API integration, Kafka/outbox, WebSocket, real Playwright, and regression.

Record declared, executed, passed, failed, and skipped counts.

# 12. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-03/<run-id>/
```

with baseline, changes, build, API, event, WebSocket, browser, cleanup, and acceptance evidence.

# 13. Report

Create:

```text
AI_document/Kiosk-Demo/Phase-03/REPORT_PHASE_03.md
```

using `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

# 14. Acceptance Criteria


- One WO is grouped once.
- All manual Job Cards are present.
- Print Station is excluded from manual cards.
- Active sessions are recoverable.
- Counts, progress, and action eligibility are authoritative.
- API tests and compatibility regression pass.
- Report authorizes Phase 04.


# 15. Completion Gate

Success:

```text
KIOSK_DEMO_PHASE_03_PASSED_READY_FOR_PHASE_04
```

Failure:

```text
KIOSK_DEMO_PHASE_03_BLOCKED
```

Do not start Phase 04 automatically.
