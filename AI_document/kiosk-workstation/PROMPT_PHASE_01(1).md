# Phase 01 — MES Execution Job Card State Machine and Failure Semantics

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-00/REPORT_PHASE_00.md`  
Required report language: Vietnamese

---

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, Kiosk reference document, current source, current migrations, current event contracts, current seed, current tests, and the previous report before modifying anything.

---

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_00_PASSED_READY_FOR_PHASE_01
```

When absent or blocked, create only:

```text
AI_document/Kiosk-Demo/Phase-01/REPORT_PHASE_01.md
```

with status:

```text
KIOSK_DEMO_PHASE_01_BLOCKED
```

Do not bypass the gate.

---

# 3. Objective


Implement the approved authoritative lifecycle for manual Job Cards in MES Execution, including failure, Work Order impact, successor blocking, retry, abort distinction, audit, and outbox events.


---

# 4. In Scope


- Existing Start and Complete behavior.
- Manual Fail command.
- Failure reason and audit.
- Execution-session failure state.
- Work Order pause/hold behavior.
- Successor blocking.
- Retry/recovery.
- Abort correction.
- Outbox events.
- API and domain integration tests.


---

# 5. Out of Scope


- Kiosk grouped read API.
- Kiosk UI.
- Kiosk Gateway event relay.
- Print Station command behavior.
- Offline commands.


---

# 6. Mandatory Inspection

Inspect actual current paths for:

- `services/kiosk-operator-ui`;
- `services/mes-kiosk-gateway-service`;
- `services/mes-execution-service`;
- `services/mes-traceability-service`;
- current Print Station integration;
- Kong, Keycloak, Kafka, outbox, WebSocket, PostgreSQL;
- canonical seed, preparation scripts, tests, Docker Compose;
- MES Console Work Order Detail refresh behavior.

Search every consumer before changing an API or event.

---

# 7. Required Work


## 7.1 Preserve successful execution

Keep current Start and Complete semantics, traceability, quantities, idempotency, and Work Order completion.

## 7.2 Implement manual failure

Add the Phase 00 approved endpoint and use case.

Persist:

- operation failure state;
- execution-session failure state;
- failure reason code and text;
- operator;
- terminal;
- timestamp;
- audit metadata.

Reject failure for invalid states and Print Station operations.

## 7.3 Apply Work Order policy

Apply the approved pause/hold state.

Block successors.

Prevent Work Order completion while a mandatory operation is failed.

## 7.4 Implement retry/recovery

Allow retry only under the approved policy.

Preserve previous failure history and create a new valid attempt/session.

## 7.5 Correct Abort

Abort remains distinct from Fail.

Check response success and preserve audit.

## 7.6 Publish events

Write transactional outbox events for:

- operation failed;
- operation aborted;
- Work Order status changed;
- retry/reopened when required.

Use current naming and version conventions.

## 7.7 Additive schema only when needed

Do not overwrite applied migrations or erase historical records.


---

# 8. Non-Negotiable Guardrails

- The browser never publishes Kafka directly.
- MES Execution remains authoritative.
- One Kiosk list card represents one Work Order.
- Work Order detail contains every eligible non-print manual Job Card.
- Print Station operations are not manually handled at Demo Kiosk.
- Demo shared routing must not change production-terminal routing.
- Abort is not Fail.
- Scrap is not automatically Fail.
- No optimistic production success.
- No raw UUID as the primary UI identity.
- No applied migration may be edited.
- No mandatory test may be skipped.

---

# 9. API and Event Contract

Use current repository conventions.

All state-changing commands must:

```text
validate
→ persist
→ write transactional outbox
→ publish event
```

Events and consumers must be versioned and idempotent.

---

# 10. UI Contract

Use VI as default and support EN, JA, and KO.

Use backend-derived states, blockers, and action eligibility.

Print Station may appear only as read-only Work Order context.

---

# 11. Database, Seed, and Cleanup

Use additive migrations only when required.

Preserve history.

Use deterministic business codes.

Every generated record and temporary state must have exact cleanup.

---

# 12. Mandatory Testing


- Start success and invalid-state rejection.
- Complete success and quantity validation.
- Fail success.
- Fail missing reason.
- Fail invalid state.
- Duplicate Fail idempotency.
- Print Station manual Fail rejection.
- Work Order pause/hold.
- Successor blocking.
- Work Order cannot complete with failed mandatory job.
- Retry allowed and denied.
- Abort is not Fail.
- Outbox persistence and event payload.
- Existing Print Station and successful WO regression.


Also run applicable:

```bash
npm --prefix services/kiosk-operator-ui run typecheck
npm --prefix services/kiosk-operator-ui run build
go test ./...
```

Run affected service builds, API integration, Kafka/outbox, WebSocket, Playwright, and regression.

Record exact declared, executed, passed, failed, and skipped counts.

---

# 13. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-01/<run-id>/
```

At minimum:

```text
manifest.json
baseline.json
changes.json
build-results.json
api-results.json
event-results.json
websocket-results.json
browser-results.json
cleanup-results.json
acceptance-results.json
```

---

# 14. Required Report

Create:

```text
AI_document/Kiosk-Demo/Phase-01/REPORT_PHASE_01.md
```

Use `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

Report language: Vietnamese.

---

# 15. Acceptance Criteria


- Manual failure is authoritative and persisted.
- Work Order impact matches Phase 00.
- Successors remain blocked.
- Retry preserves history.
- Abort remains distinct.
- Print Station operations reject manual failure.
- Existing Start/Complete flow still passes.
- Event and cleanup tests pass.
- Report authorizes Phase 02.


Every mandatory criterion must pass.

---

# 16. Completion Gate

On success:

```text
KIOSK_DEMO_PHASE_01_PASSED_READY_FOR_PHASE_02
```

On failure:

```text
KIOSK_DEMO_PHASE_01_BLOCKED
```

Do not start Phase 02 automatically.
