# Joint MES/PDA Verification and Return to Main WMS Phases

## Meaning of This Phase

Runs final joint runtime verification and returns to the blocked main WMS phases after WMS-side fixes are complete.

## Objective

Verify MES Staged/Shortage business flows, PDA execution flows, MES regression, and all affected main WMS phase gates.

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

## Required Inputs

- WMS Integration Support `GLOBAL_RULE.md`
- MES–WMS Integration Contract Pack
- Integration Validation Pack
- Existing WMS architecture and enterprise WMS documentation
- Current MES and PDA integration reports relevant to this phase

## Architecture Constraints

- Work only inside WMS unless this phase is explicitly verification-only.
- Do not modify MES.
- Do not redesign WMS architecture.
- Preserve database-per-service ownership.
- Preserve verified Kafka transport.
- Do not add shared Redis or cross-database access.
- Do not implement deferred domains.

## Required Deliverables

- implementation or verification artifacts required by this phase;
- updated tests;
- migration files where required;
- runtime evidence;
- phase completion report;
- updated blocker and readiness status.

## Verification Requirements

Use all applicable levels:

- unit tests;
- contract tests;
- database integration;
- migration rehearsal;
- API behavior;
- Kafka integration;
- idempotency;
- concurrency;
- failure recovery;
- clean-data full flow;
- migrated-data full flow;
- MES/PDA joint verification where applicable.

## Acceptance Criteria

- [ ] both MES Staged and Shortage scenarios complete
- [ ] PDA/WMS full flow passes
- [ ] MES material staging and consumption regressions pass
- [ ] all affected main WMS phase gates are reverified
- [ ] remaining blockers are reported without modifying MES

## Stop Conditions

Stop and report when:

- a shared contract is unresolved;
- ownership would change;
- direct MES database access is required;
- an incompatible event change is required;
- a fixture requires unsafe production SQL;
- a major architecture conflict is discovered.

## Required Final Status

Use one:

```text
PASS
PARTIAL
BLOCKED_BY_CONTRACT
BLOCKED_BY_ENVIRONMENT
BLOCKED_BY_ARCHITECTURE
```
