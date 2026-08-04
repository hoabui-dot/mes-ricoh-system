# AI Execution Prompt - Business Fixture

## Meaning

Create disposable Released Work Orders, Material Requirements and deterministic Staged and Shortage scenarios using MES APIs only.

## Read First

1. GLOBAL_RULE.md
2. Integration Contract Pack
3. Integration Validation Pack
4. MES_IP_04_BUSINESS_FIXTURE.md

## Objective

Create disposable Released Work Orders, Material Requirements and deterministic Staged and Shortage scenarios using MES APIs only.

## Instructions

- Work only inside MES.
- Do not modify WMS.
- Preserve current architecture.
- Preserve Kafka transport.
- Produce implementation and runtime evidence.
- Re-run all affected business flows.
- If migrations change data, execute migration rehearsal and regression.
- Register blockers instead of guessing.
- Stop immediately when a major architecture conflict is discovered.

## Required Output

- Phase report
- Test evidence
- Runtime evidence
- Final status:
  - PASS
  - PARTIAL
  - BLOCKED
