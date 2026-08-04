# AI Execution Prompt — Joint MES/PDA Verification and Return to Main WMS Phases

## Prompt Meaning

Runs final joint runtime verification and returns to the blocked main WMS phases after WMS-side fixes are complete.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_08_JOINT_MES_PDA_AND_MAIN_PHASE_RETURN.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Verify MES Staged/Shortage business flows, PDA execution flows, MES regression, and all affected main WMS phase gates.

## Execution Instructions

1. Inspect the current WMS implementation before changing code.
2. Record the current baseline for all affected flows.
3. Work only within WMS ownership.
4. Preserve current service boundaries and verified Kafka transport.
5. Implement only this phase's scope.
6. Update migrations additively when required.
7. Test both clean data and migrated legacy data.
8. Re-run every affected business flow, not only changed endpoints.
9. Capture database, outbox, inbox, Kafka, movement, balance, task, command, and reconciliation evidence where applicable.
10. Do not modify MES.
11. Do not guess mapping, version, or event semantics.
12. Stop when a major architecture conflict is discovered.

## Scope

- MES shortage flow
- MES staged flow
- MES requirement update evidence
- PDA receiving/putaway/picking/replenishment/transfer/shipping flow
- MES staging and consumption regression
- clean database full flow
- migrated database full flow
- failure recovery
- return to main WMS phases 04 through 10

## Required Acceptance

- both MES Staged and Shortage scenarios complete
- PDA/WMS full flow passes
- MES material staging and consumption regressions pass
- all affected main WMS phase gates are reverified
- remaining blockers are reported without modifying MES

## Required Outputs

- code and migration changes when applicable;
- tests;
- runtime evidence;
- phase report;
- final status:
  - `PASS`
  - `PARTIAL`
  - `BLOCKED_BY_CONTRACT`
  - `BLOCKED_BY_ENVIRONMENT`
  - `BLOCKED_BY_ARCHITECTURE`

Do not claim completion from build or health checks alone.
