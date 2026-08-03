# Phase 04 — Kiosk Work Order List and Job Card Detail UI

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-03/REPORT_PHASE_03.md`  
Required report language: Vietnamese

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, current Kiosk reference document, source, migrations, event contracts, seed, tests, and previous report before changing anything.

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_03_PASSED_READY_FOR_PHASE_04
```

Otherwise create only `AI_document/Kiosk-Demo/Phase-04/REPORT_PHASE_04.md` with:

```text
KIOSK_DEMO_PHASE_04_BLOCKED
```

# 3. Objective


Update the Demo Kiosk UI so the list displays one card per Work Order and the detail route displays all manual Job Cards with complete operational context.


# 4. In Scope


- `/kiosk/:terminalId/wo-list`.
- `/kiosk/:terminalId/wo/:woId`.
- Grouped Work Order cards.
- Job Card list/detail.
- Status counts and progress.
- Work Center, Workstation, line, resource, operator, session, quantity, and failure display.
- Separate read-only Print Station context.
- Loading, empty, error, offline, retry, realtime refresh, i18n, and accessibility.


# 5. Out of Scope


- Final Start/Complete/Fail command behavior.
- Backend failure implementation.
- Manual Print Station controls.
- Offline production commands.


# 6. Mandatory Inspection

Inspect current implementations for Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka/outbox, WebSocket, Print Station, Kong, Keycloak, seed, and tests.

Search all consumers before changing contracts.

# 7. Required Work


## 7.1 Work Order list

Render one touch-friendly card per Work Order.

Show:

- Work Order code;
- product;
- selected line;
- quantity;
- Work Order state;
- manual job counts;
- progress;
- failure warning;
- last update.

Do not render one list card per operation.

## 7.2 Detail route

Display every manual Job Card in routing sequence.

Each card shows:

- operation;
- sequence;
- Work Center;
- Workstation;
- allocated resource;
- predecessor;
- state;
- active operator/session;
- requested/good/scrap quantities;
- timestamps;
- failure reason;
- backend-derived next action.

## 7.3 Print context

Show Print Station status only in a separate read-only area.

Do not render Start, Complete, Fail, Abort, or Retry controls for print operations.

## 7.4 Realtime refresh

On dispatch, started, completed, failed, aborted, or Work Order status event:

```text
invalidate/refetch list or current detail
```

Do not update final authority only from event payload.

## 7.5 Offline behavior

Retain cached Work Order list as read-only fallback.

Clearly indicate data age.

Disable state-changing actions while offline.

## 7.6 i18n and accessibility

Complete VI/EN/JA/KO for the changed flow.

Use labelled controls, visible focus, tablet touch targets, and text plus color for states.


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


- One card per Work Order.
- Correct aggregate counts.
- Detail route shows every manual Job Card.
- Work Center and Workstation visible.
- Print Station absent from manual list.
- Read-only print status.
- Loading.
- Empty.
- Error/retry.
- Offline cached list.
- WebSocket refresh.
- Browser refresh.
- VI/EN/JA/KO smoke.
- Keyboard/focus/accessibility.
- Tablet viewport.
- No raw enum, UUID identity, or translation key.


Run applicable typecheck, build, backend tests, API integration, Kafka/outbox, WebSocket, real Playwright, and regression.

Record declared, executed, passed, failed, and skipped counts.

# 12. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-04/<run-id>/
```

with baseline, changes, build, API, event, WebSocket, browser, cleanup, and acceptance evidence.

# 13. Report

Create:

```text
AI_document/Kiosk-Demo/Phase-04/REPORT_PHASE_04.md
```

using `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

# 14. Acceptance Criteria


- One top-level card represents the complete WO.
- Detail contains all manual Job Cards.
- Print Station is never actionable.
- Context and state are clear.
- Realtime refresh and offline read-only behavior work.
- Four-language and accessibility smoke pass.
- Report authorizes Phase 05.


# 15. Completion Gate

Success:

```text
KIOSK_DEMO_PHASE_04_PASSED_READY_FOR_PHASE_05
```

Failure:

```text
KIOSK_DEMO_PHASE_04_BLOCKED
```

Do not start Phase 05 automatically.
