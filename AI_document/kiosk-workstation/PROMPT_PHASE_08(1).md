# Phase 08 — Full End-to-End Certification and Final UAT

Version: 1.0  
Status: READY_AFTER_ENTRY_GATE  
Target: S-Factory MES Enterprise  
Master rules: `AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_IMPLEMENTATION_RULES.md`  
Previous report: `AI_document/Kiosk-Demo/Phase-07/REPORT_PHASE_07.md`  
Required report language: Vietnamese

# 1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as a Senior MES Domain Engineer, Backend Engineer, Frontend Engineer, Kafka/WebSocket Engineer, Database Engineer, Security Engineer, and QA Automation Engineer.

Current source is authoritative. Read the master rules, Kiosk reference document, source, migrations, event contracts, seed, tests, and previous report before changing anything.

# 2. Entry Gate

Begin only when the previous report contains:

```text
KIOSK_DEMO_PHASE_07_PASSED_READY_FOR_PHASE_08
```

Otherwise create only `AI_document/Kiosk-Demo/Phase-08/REPORT_PHASE_08.md` with:

```text
KIOSK_DEMO_PHASE_08_BLOCKED
```

# 3. Objective


Certify the complete Demo Kiosk Job Card flow using real backend, Kafka, Kiosk Gateway, WebSocket, Kiosk UI, and MES Console evidence.


# 4. In Scope


- Full static/build regression.
- Success Work Order UAT.
- Failure and retry UAT.
- Abort distinction.
- Realtime Kafka/WebSocket synchronization.
- Active-session recovery.
- Reconnect and queued events.
- Security verification.
- Four-language and accessibility smoke.
- Print Station exclusion.
- Exact cleanup.
- Final report.


# 5. Out of Scope


- New feature development.
- Manual Print Station operation.
- Fake physical print result from Kiosk.
- Mocked final-state certification.


# 6. Mandatory Inspection

Inspect current Kiosk UI, Kiosk Gateway, MES Execution, MES Console, Kafka/outbox, WebSocket, Print Station, Kong, Keycloak, seed, Docker, and tests.

Search every consumer before changing contracts.

# 7. Required Work


## 7.1 Success certification

Execute:

```text
prepare success WO
→ verify one Kiosk Work Order card
→ verify all manual Job Cards
→ verify Print Station excluded
→ Start first eligible Job Card
→ verify MES Work Order Detail shows InProgress
→ Complete
→ verify MES shows Completed
→ verify successor unlocks
→ repeat for all manual Job Cards
→ verify print operation remains external/read-only
```

When the real Print Station runtime is available, observe its authoritative result.

When unavailable, document the external dependency hold without simulating completion in Kiosk.

## 7.2 Failure certification

Execute:

```text
prepare failure WO
→ Start eligible Job Card
→ Fail with reason
→ verify operation failure in MES
→ verify Work Order pause/hold
→ verify successors blocked
→ verify Kiosk grouped counts
→ Retry according to policy
→ complete after retry
```

## 7.3 Abort certification

Prove Abort does not appear as Fail and does not create production confirmation.

## 7.4 Session recovery

Refresh browser while a Job Card is InProgress.

Recover the authoritative session and valid buttons.

## 7.5 Realtime

Prove each command produces persisted state, outbox/Kafka event, gateway relay, WebSocket notification, Kiosk refetch, and MES Console refetch.

## 7.6 Reconnect

Disconnect Kiosk, generate relevant events, reconnect, drain queued events FIFO, and converge to current state.

## 7.7 Security

Run route, REST token, WebSocket token, terminal scope, and logout tests.

## 7.8 Final cleanup

Verify zero generated:

- Work Orders;
- execution sessions;
- confirmations;
- failure records or attempts not meant to persist;
- allocations;
- reservations;
- outbound queue leaks;
- test Kafka messages where inspectable.

## 7.9 Final documents

Create:

```text
AI_document/Kiosk-Demo/KIOSK_DEMO_JOB_CARD_FINAL_REPORT.md
```

and final evidence:

```text
final-success-evidence.json
final-failure-evidence.json
final-retry-evidence.json
final-sync-evidence.json
final-security-evidence.json
final-cleanup-evidence.json
final-certification.json
```


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


- Frontend typecheck/build.
- Affected Go tests/builds.
- MES Execution operation lifecycle integration.
- Kiosk grouped read API integration.
- Kafka/outbox matrix.
- Kiosk Gateway/WebSocket integration.
- Real Playwright success flow.
- Real Playwright failure/retry flow.
- Abort flow.
- Active-session refresh.
- Reconnect and queue drain.
- Kiosk/MES Console synchronization.
- Print Station exclusion.
- Authentication and authorization.
- VI/EN/JA/KO smoke.
- Accessibility smoke.
- Cleanup.
- Full prior-phase regression.
- Zero mandatory skipped tests.


Run applicable frontend typecheck/build, backend tests/builds, API integration, Kafka/outbox, WebSocket, real Playwright, and regression.

Record exact declared, executed, passed, failed, and skipped counts.

# 12. Artifacts

Create:

```text
artifacts/kiosk-demo-job-card/phase-08/<run-id>/
```

Include baseline, changes, build, API, event, WebSocket, browser, cleanup, and acceptance evidence.

# 13. Report

Create:

```text
AI_document/Kiosk-Demo/Phase-08/REPORT_PHASE_08.md
```

Use `AI_document/Kiosk-Demo/REPORT_TEMPLATE.md`.

# 14. Acceptance Criteria


- One WO card appears per Work Order.
- Every expected non-print manual Job Card appears.
- Print Station is never manually handled.
- Start and Complete synchronize to MES.
- Fail synchronizes to MES and applies the approved WO policy.
- Successors are blocked after failure.
- Retry works.
- Abort remains distinct.
- Active session survives refresh.
- Reconnect and queued delivery work.
- Security tests pass.
- Kiosk and MES Console converge.
- Cleanup is exact.
- Zero mandatory tests are skipped.
- Final report status is `KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED`.


# 15. Completion Gate

Success:

```text
KIOSK_DEMO_JOB_CARD_FLOW_CERTIFIED
```

Failure:

```text
KIOSK_DEMO_PHASE_08_BLOCKED
```

Do not start no automatic next phase automatically.
