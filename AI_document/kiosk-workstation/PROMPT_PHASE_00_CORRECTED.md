Phase 00 — Current-State Audit and Final Domain Contract

Version: 1.0Status: AUTHORIZED_READY_FOR_EXECUTIONTarget: S-Factory MES EnterpriseMaster rules: AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.mdPrevious report: Not applicable — first phaseRequired report language: Vietnamese

1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, Kiosk reference document, current source, current migrations, current event contracts, current seed, current tests, and the previous report before modifying anything.

2. Entry Gate

Phase 00 is the first phase and has no previous phase report.

The act of the user supplying and instructing the AI to execute this Phase 00 prompt is the explicit authorization to begin.

This prompt carries the authorization token:

USER_AUTHORIZED_PHASE_00

Therefore:

PHASE_00_ENTRY_GATE = PASSED

Do not search for this token in a previous report.

Do not create a blocked report merely because no previous report exists.

Record the following in REPORT_PHASE_00.md:

Authorization source: Direct user instruction to execute PROMPT_PHASE_00.md
Authorization token: USER_AUTHORIZED_PHASE_00
Entry gate: PASSED

Phase 00 may be blocked only when a real audit prerequisite is unavailable, such as inaccessible source code, missing required services, missing current schema, or inability to inspect the current implementation.

3. Objective

Audit the current Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka, WebSocket, and Print Station boundaries.

Produce the final source-backed contract for:

Work Order grouping;

Job Card projection;

Demo Shared Kiosk routing;

manual Start, Complete, Fail, Abort, and Retry;

Work Order impact when a manual operation fails;

successor blocking;

Print Station exclusion;

realtime synchronization;

session recovery;

authentication and authorization.

This phase is audit and design only.

4. In Scope

Route, API, table, enum, state-transition, event-topic, and test inventory.

Current manual operation success flow.

Current abort and scrap behavior.

Current or missing manual failure flow.

Current Work Order pause/hold and retry behavior.

Current demo dispatch routing.

Current Print Station operation behavior.

Current session, WebSocket, identity, and security limitations.

Final ADR and Phase 01–08 implementation map.

5. Out of Scope

Source changes.

Migrations.

Seed mutations.

New endpoints.

UI implementation.

Runtime Work Order creation or destructive reset.

6. Mandatory Inspection

Inspect actual current paths for:

services/kiosk-operator-ui;

services/mes-kiosk-gateway-service;

services/mes-execution-service;

services/mes-traceability-service;

current Print Station integration;

Kong, Keycloak, Kafka, outbox, WebSocket, PostgreSQL;

canonical seed, preparation scripts, tests, Docker Compose;

MES Console Work Order Detail refresh behavior.

Search every consumer before changing an API or event.

7. Required Work

7.1 Define Job Card ownership

Determine whether a Job Card can remain a Kiosk projection of a Work Order Operation. Do not create a new aggregate without evidence.

7.2 Define grouped Work Order behavior

Specify one list card per Work Order and all manual Job Cards in detail.

Define exact counts and progress semantics.

7.3 Define Print Station exclusion

Trace execution_target_type, dispatch, print jobs, printer results, and Kiosk rendering.

Specify whether Print Station appears as read-only context.

7.4 Define manual failure semantics

Trace current:

operation states;

execution-session states;

Work Order states;

predecessor rules;

reason codes;

retry/reopen;

outbox and events.

Choose one exact backend-owned contract.

7.5 Define event matrix

Inventory producers and consumers for dispatch, started, completed, failed, aborted, Work Order status, and Work Order completed.

7.6 Define security and recovery contract

Decide:

route guard;

REST bearer token;

WebSocket JWT verification;

auth acknowledgement;

reconnect;

logout;

active-session recovery;

idempotency.

7.7 Deliverables

Create supporting artifacts:

current-state-map.json
approved-state-machine.json
event-inventory.json
route-screen-contract.json
failure-policy-decision.json
phase-dependency-map.json

Do not modify source or data.

8. Non-Negotiable Guardrails

The browser never publishes Kafka directly.

MES Execution remains authoritative.

One Kiosk list card represents one Work Order.

Work Order detail contains every eligible non-print manual Job Card.

Print Station operations are not manually handled at Demo Kiosk.

Demo shared routing must not change production-terminal routing.

Abort is not Fail.

Scrap is not automatically Fail.

No optimistic production success.

No raw UUID as the primary UI identity.

No applied migration may be edited.

No mandatory test may be skipped.

9. API and Event Contract

Use current repository conventions.

All state-changing commands must:

validate
→ persist
→ write transactional outbox
→ publish event

Events and consumers must be versioned and idempotent.

10. UI Contract

Use VI as default and support EN, JA, and KO.

Use backend-derived states, blockers, and action eligibility.

Print Station may appear only as read-only Work Order context.

11. Database, Seed, and Cleanup

Use additive migrations only when required.

Preserve history.

Use deterministic business codes.

Every generated record and temporary state must have exact cleanup.

12. Mandatory Testing

Run existing non-destructive API tests for current operation behavior.

Run existing Kafka/WebSocket tests.

Run current Kiosk smoke in read-only mode.

Classify each test as unit, integration, real browser, mocked browser, or source-only.

Do not claim runtime behavior from source inspection alone.

Also run applicable:

npm --prefix services/kiosk-operator-ui run typecheck
npm --prefix services/kiosk-operator-ui run build
go test ./...

Run affected service builds, API integration, Kafka/outbox, WebSocket, Playwright, and regression.

Record exact declared, executed, passed, failed, and skipped counts.

13. Artifacts

Create:

artifacts/kiosk-demo-job-card/phase-00/<run-id>/

At minimum:

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

14. Required Report

Create:

AI_document/Kiosk-Demo/Phase-00/REPORT_PHASE_00.md

Use AI_document/Kiosk-Demo/REPORT_TEMPLATE.md.

Report language: Vietnamese.

15. Acceptance Criteria

Job Card ownership is explicit.

Work Order grouping is explicit.

Print Station exclusion is explicit.

Manual failure and Work Order impact are explicit.

Abort, scrap, and failure are distinguished.

Retry behavior is explicit.

Required event additions are listed.

Security and session-recovery requirements are listed.

No source or data was modified.

Report authorizes Phase 01.

Every mandatory criterion must pass.

16. Completion Gate

On success:

KIOSK_DEMO_PHASE_00_PASSED_READY_FOR_PHASE_01

On failure:

KIOSK_DEMO_PHASE_00_BLOCKED

Do not start Phase 01 automatically.