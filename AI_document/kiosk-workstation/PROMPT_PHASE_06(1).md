# Phase 06 — Authentication, Terminal Session, Reconnect, and Reliability Hardening

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-05/REPORT_PHASE_05.md`  
Required report language: Vietnamese

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, Kiosk reference document, source, migrations, event contracts, seed, tests, and previous report before changing anything.

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_05_PASSED_READY_FOR_PHASE_06
```

Otherwise create only `AI_document/Kiosk-Demo/Phase-06/REPORT_PHASE_06.md` with:

```text
KIOSK_DEMO_PHASE_06_BLOCKED
```

# 3. Objective


Harden the Demo Kiosk so protected routes, REST commands, WebSocket authentication, terminal sessions, reconnect, logout, and runtime configuration are reliable and do not depend on insecure browser-controlled identity headers.


# 4. In Scope


- Protected routes.
- REST bearer token.
- Kong and backend JWT validation.
- WebSocket signature, issuer, audience, and expiry validation.
- Explicit auth acknowledgement.
- Reconnect with bounded backoff.
- Offline queued-event drain.
- Server logout.
- Browser-state cleanup.
- Runtime gateway and WebSocket URL configuration.
- Demo-credential configuration.


# 5. Out of Scope


- Enterprise-wide SSO redesign.
- Offline production-changing command queue.
- Physical printer authentication.
- New Job Card business behavior.


# 6. Mandatory Inspection

Inspect current Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka/outbox, WebSocket, Print Station, Kong, Keycloak, seed, Docker, and tests.

Search every consumer before changing contracts.

# 7. Required Work


## 7.1 Protected routes

Require an authenticated terminal/operator session for Work Order list and detail.

Direct unauthenticated navigation must redirect to terminal login.

## 7.2 REST identity

Attach the Keycloak bearer token to MES REST commands through Kong.

Remove security dependence on browser-controlled `X-Role-Code`.

## 7.3 WebSocket verification

Verify token signature, issuer, audience, expiry, and relevant claims.

Send explicit `auth_ack` or source-compatible acknowledgement before marking the UI connected.

## 7.4 Reconnect

Implement bounded exponential backoff.

After reconnect and queued-event drain, refetch Work Order list and current detail.

Do not replay production commands.

## 7.5 Terminal session

Ensure only the approved active connection/session policy applies.

Make terminal status and last-seen behavior deterministic.

## 7.6 Logout

Call the Kiosk Gateway logout endpoint.

Close the socket.

Invalidate the server terminal session.

Clear token, operator, terminal, active Work Order, and active session browser state.

## 7.7 Runtime configuration

Use supported build/runtime environment values.

Remove hardcoded gateway host behavior.

## 7.8 Demo credentials

Keep demo defaults only through explicit demo configuration.

Do not hardcode credentials as a production default.


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


- Unauthenticated direct route.
- Missing token.
- Invalid signature.
- Wrong issuer.
- Wrong audience.
- Expired token.
- Valid login.
- REST bearer authentication.
- WebSocket auth acknowledgement.
- Reconnect after socket loss.
- FIFO queued-event drain.
- Duplicate event tolerance.
- Logout server session.
- Browser storage cleanup.
- Runtime URL configuration.
- Existing success/failure Job Card E2E regression.


Run applicable frontend typecheck/build, backend tests/builds, API integration, Kafka/outbox, WebSocket, real Playwright, and regression.

Record exact declared, executed, passed, failed, and skipped counts.

# 12. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-06/<run-id>/
```

Include baseline, changes, build, API, event, WebSocket, browser, cleanup, and acceptance evidence.

# 13. Report

Create:

```text
AI_document/Kiosk-Demo/Phase-06/REPORT_PHASE_06.md
```

Use `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

# 14. Acceptance Criteria


- Routes are protected.
- REST and WebSocket identity are verified.
- Browser-controlled role headers are not authoritative.
- Reconnect and refetch work.
- Queued events drain without duplication.
- Logout closes the server session.
- Runtime URLs are configurable.
- Phase 05 flows still pass.
- Report authorizes Phase 07.


# 15. Completion Gate

Success:

```text
KIOSK_DEMO_PHASE_06_PASSED_READY_FOR_PHASE_07
```

Failure:

```text
KIOSK_DEMO_PHASE_06_BLOCKED
```

Do not start Phase 07 automatically.
