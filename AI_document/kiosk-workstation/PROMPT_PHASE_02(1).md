# Phase 02 — Demo Dispatch, Kafka Relay, and Realtime Synchronization

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-01/REPORT_PHASE_01.md`  
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
KIOSK_DEMO_PHASE_01_PASSED_READY_FOR_PHASE_02
```

When absent or blocked, create only:

```text
AI_document/Kiosk-Demo/Phase-02/REPORT_PHASE_02.md
```

with status:

```text
KIOSK_DEMO_PHASE_02_BLOCKED
```

Do not bypass the gate.

---

# 3. Objective


Ensure every eligible non-print operation of a Demo Shared Kiosk Work Order is routed to `KIOSK-DEMO-01` through Kafka, Kiosk Gateway, offline queue, and WebSocket, while normal production routing remains unchanged.


---

# 4. In Scope


- Demo dispatch policy.
- Kafka event consumers.
- Started, completed, failed, aborted, and Work Order status relay.
- Offline outbound queue.
- Explicit WebSocket auth acknowledgement.
- Reconnect and duplicate tolerance.
- Print Station manual-dispatch exclusion.


---

# 5. Out of Scope


- Grouped Work Order API.
- Final Kiosk list/detail UI.
- MES Print Station command flow.
- Offline production commands.


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


## 7.1 Dispatch every manual demo operation

Ensure the approved dispatch flow covers every eligible non-print manual Work Order Operation.

## 7.2 Preserve production routing

Normal events remain Work Center or terminal scoped.

Only approved demo dispatch reaches `KIOSK-DEMO-01`.

## 7.3 Exclude Print Station

Do not route Print Station operations as manual Job Cards.

A print status event may still trigger a Work Order refetch.

## 7.4 Extend Kiosk Gateway consumers

Relay:

- dispatch queued;
- operation started;
- operation completed;
- operation failed;
- operation aborted;
- Work Order status changed;
- Work Order completed.

## 7.5 Offline queue

Queue relevant terminal messages while offline.

Deliver FIFO after authenticated reconnect.

Mark delivery idempotently.

## 7.6 WebSocket protocol

Add explicit authentication acknowledgement.

Verify JWT according to the current trusted configuration.

Implement reconnect-safe duplicate handling and a full refetch after reconnect.


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


- Demo dispatch reaches only KIOSK-DEMO-01.
- Normal dispatch remains Work Center scoped.
- Print Station is excluded from manual dispatch.
- Started/completed/failed/aborted/status events relay.
- Offline queue stores and drains FIFO.
- Duplicate events do not duplicate state.
- Auth acknowledgement.
- Invalid/expired token rejection.
- Reconnect and refetch.
- Existing Print Station consumer regression.


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
artifacts/kiosk-demo-job-card/phase-02/<run-id>/
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
AI_document/Kiosk-Demo/Phase-02/REPORT_PHASE_02.md
```

Use `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

Report language: Vietnamese.

---

# 15. Acceptance Criteria


- Every manual demo operation is routable.
- Print Station is excluded.
- Production routing is unchanged.
- Failure and completion events reach Demo Kiosk.
- Offline queue and reconnect pass.
- Event handling is idempotent.
- Report authorizes Phase 03.


Every mandatory criterion must pass.

---

# 16. Completion Gate

On success:

```text
KIOSK_DEMO_PHASE_02_PASSED_READY_FOR_PHASE_03
```

On failure:

```text
KIOSK_DEMO_PHASE_02_BLOCKED
```

Do not start Phase 03 automatically.
