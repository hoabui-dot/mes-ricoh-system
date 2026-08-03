# Kiosk Demo Job Card Implementation Rules

Version: 1.0  
Status: ACTIVE  
Target: S-Factory MES Enterprise  
Applies to: Phase 00 through Phase 08

---

# 1. Final Objective

The implementation is complete only when:

```text
one Work Order is created and released
→ KIOSK-DEMO-01 receives one grouped Work Order card
→ the Work Order detail contains every eligible non-print manual Job Card
→ the operator can Start, Complete, Fail, Abort, and Retry where permitted
→ MES Execution persists authoritative state
→ transactional outbox publishes Kafka events
→ Kiosk Gateway relays them through WebSocket
→ Kiosk UI and MES Console converge to the same state
```

Print Station operations remain outside Demo Kiosk manual handling.

---

# 2. Source Precedence

1. Current executable source.
2. Database schema and applied migrations.
3. Current API validation and responses.
4. Current Kafka and outbox contracts.
5. Current seed.
6. Maintained integration tests.
7. Maintained browser E2E.
8. Approved reports and architecture documents.
9. Current Kiosk reference document.
10. Historical documentation.

Do not invent behavior to fill a gap.

---

# 3. State Ownership

MES Execution owns:

- Work Order state;
- Work Order Operation state;
- execution sessions;
- good and scrap quantities;
- predecessor gates;
- failure state;
- retry policy;
- Work Order completion.

Kiosk Gateway owns:

- terminal definitions;
- terminal sessions;
- WebSocket connections;
- event relay;
- offline outbound queue.

Kiosk UI sends commands and renders read models. It does not own production state.

The browser must never publish Kafka directly.

Every state-changing flow must be:

```text
Kiosk UI
→ authenticated HTTP command
→ MES Execution validation and persistence
→ transactional outbox
→ Kafka event
→ Kiosk Gateway
→ WebSocket notification
→ authoritative refetch
```

---

# 4. Job Card Contract

Preferred definition:

```text
Job Card = Kiosk-facing projection of one executable Work Order Operation
```

Do not add a separate Job Card aggregate unless current source proves it is necessary.

A Job Card must expose:

- Work Order code;
- operation code, name, and sequence;
- selected Production Line;
- Work Center;
- Workstation;
- allocated resource or Machine Unit;
- execution target;
- current state;
- predecessor state;
- active execution session;
- operator and terminal;
- requested, good, and scrap quantities;
- start and finish timestamps;
- failure code and reason;
- action eligibility.

---

# 5. Work Order Grouping

The Kiosk list displays one card per Work Order.

Each Work Order card includes:

- Work Order code;
- item code and name;
- quantity and UOM;
- selected line;
- Work Order state;
- total manual Job Cards;
- waiting, ready, in-progress, completed, failed, and blocked counts;
- progress;
- last update time.

Clicking the card opens a detail route containing every eligible manual Job Card.

Do not show one top-level Work Order card per operation.

---

# 6. Demo Shared Kiosk Routing

Normal production terminals remain Work Center or terminal scoped.

Only operations using the approved demo dispatch mode, such as:

```text
dispatch_mode = DEMO_SHARED_KIOSK
```

may be aggregated at `KIOSK-DEMO-01`.

The Demo Kiosk may ignore Work Center for routing, but Work Center and Workstation must remain visible in the UI.

Never broadcast all production operations to all terminals.

---

# 7. Print Station Exclusion

Operations whose authoritative target is Print Station, for example:

```text
execution_target_type = PRINT_STATION
```

must not appear as manual Demo Kiosk Job Cards.

The Kiosk must not show Start, Complete, Fail, Abort, or Retry for Print Station operations.

Print remains:

```text
MES Execution
→ print command
→ Kafka
→ real Print Station
→ print result event
→ MES Execution
```

The Kiosk may display print status only as read-only Work Order context.

---

# 8. Manual State Model

Use current source enums where possible.

Conceptual success flow:

```text
Waiting/Blocked
→ Ready
→ InProgress
→ Completed
```

Conceptual failure flow:

```text
InProgress
→ ExecutionError or Failed
```

Abort is not failure.

Scrap is not automatically failure.

Phase 00 must determine the exact existing or approved:

- operation failure state;
- execution-session failure state;
- Work Order pause/hold behavior;
- successor blocking;
- retry behavior;
- reason-code model;
- event names.

---

# 9. Command Rules

## Start

Creates or resumes an authoritative execution session and publishes an operation-started event.

## Complete

Validates quantities and required identifiers, persists confirmation, completes the operation, evaluates successors, and publishes operation-finished events.

## Fail

Requires an approved reason, persists failure, applies Work Order failure policy, blocks successors, and publishes failure/status events.

## Abort

Stops the current session without successful production confirmation. It must remain distinct from Fail.

## Retry

Uses the approved backend recovery policy and preserves failure history.

Every command must be authenticated, authorized, idempotent, audited, pessimistic, and backend validated.

---

# 10. Event Rules

Use repository topic and version conventions.

Required facts include, where supported:

- dispatch queued;
- operation started;
- operation completed;
- operation failed;
- operation aborted;
- Work Order status changed;
- Work Order completed.

Event payloads must include stable IDs and business context:

- event ID and timestamp;
- Work Order ID/code;
- operation ID/code/sequence;
- execution session;
- selected line;
- Work Center;
- Workstation;
- terminal;
- operator;
- state;
- failure reason when applicable.

Consumers must be idempotent.

---

# 11. Read API Rules

Provide Kiosk-oriented read contracts that return:

```text
one grouped Work Order summary
one Work Order detail with all manual Job Cards
```

The detail may contain Print Station operations only in a separate read-only collection.

The backend must return action eligibility and blockers. The UI must not reconstruct lifecycle rules.

No raw UUID is the primary visual identity.

---

# 12. Realtime Rules

WebSocket events trigger authoritative refetch.

Implement:

- explicit authentication acknowledgement;
- verified JWT;
- reconnect with bounded backoff;
- queued event delivery;
- duplicate-event tolerance;
- refresh after reconnect;
- visible connection status.

Consequential actions remain disabled while command delivery is unavailable.

---

# 13. Session Recovery

Active sessions must survive browser refresh.

Remove any `MOCK-*` session fallback.

The detail API or a dedicated API must return the active session.

Abort must check HTTP status before displaying success.

A retry of the same user attempt must reuse the same idempotency key.

---

# 14. Authentication and Authorization

Kiosk REST commands and WebSocket must use verified token identity.

Do not use browser-controlled role headers as security authority.

Validate signature, issuer, audience, expiry, role, site, terminal, and operation scope.

Protected routes must block unauthenticated local navigation.

Logout must close the socket, call the server logout API, invalidate the terminal session, and clear all browser state.

---

# 15. UI Rules

- Tablet-oriented large touch targets.
- One card per Work Order on list.
- All manual Job Cards on detail.
- Visible sequence, Work Center, Workstation, line, operator, and timestamps.
- Clear text plus color for state.
- No raw enum or raw translation key.
- No optimistic production success.
- Clear failure reason and next action.
- VI default; EN, JA, KO supported.
- Keyboard and accessibility smoke required.

---

# 16. Seed Rules

The canonical demo environment must include:

- `KIOSK-DEMO-01`;
- a demo operator;
- demo dispatch policy;
- failure reason codes;
- a complete executable Work Order flow;
- multiple manual operations;
- one final Print Station operation excluded from manual Kiosk cards;
- valid predecessor sequence;
- valid line/resource allocation;
- deterministic preparation, verification, and cleanup.

Prefer API-driven preparation over permanently seeded mutable Work Orders.

Seed and preparation must be idempotent.

---

# 17. Test Rules

Each phase must run applicable:

- typecheck/build;
- backend unit/integration;
- API integration;
- Kafka/outbox integration;
- WebSocket integration;
- real Playwright;
- cleanup;
- regression.

Skipped mandatory tests are failures.

Mocked UI events do not prove persisted MES state.

Final certification must prove:

```text
create one WO
→ one Kiosk WO card
→ all manual Job Cards visible
→ Print Station excluded
→ Start updates MES
→ Complete updates MES
→ Fail updates MES and WO policy
→ Retry works
→ sessions survive refresh
→ reconnect works
→ exact cleanup
```

---

# 18. Artifacts and Reports

Each phase creates:

```text
artifacts/kiosk-demo-job-card/phase-XX/<run-id>/
AI_document/Kiosk-Demo/Phase-XX/REPORT_PHASE_XX.md
```

Report language: Vietnamese.

Required artifact files:

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

Do not store secrets.

---

# 19. Phase Workflow

```text
read rules and previous report
→ verify entry gate
→ inspect source
→ record baseline
→ implement active scope
→ run focused tests
→ fix phase-caused failures
→ run regression
→ verify cleanup
→ write report
→ authorize next phase
```

Do not execute the next phase automatically.

---

# 20. Definition of Done

A phase is done only when:

- scope is complete;
- backend remains authoritative;
- Print Station exclusion is preserved;
- applicable builds pass;
- API/event/browser tests pass;
- cleanup passes;
- no mandatory skip exists;
- report exists;
- next gate is explicit.

Final status after Phase 08:

```text
KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED
```

or:

```text
KIOSK_DEMO_JOB_CARD_FLOW_NOT_CERTIFIED
```
