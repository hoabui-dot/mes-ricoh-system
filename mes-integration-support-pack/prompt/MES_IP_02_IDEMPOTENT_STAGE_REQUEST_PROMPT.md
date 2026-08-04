# AI Execution Prompt - Idempotent Stage Request

## Meaning

Implement logical request identity, retry safety, duplicate detection, replay safety, correlation identifiers and deterministic command processing.

## Read First

1. GLOBAL_RULE.md
2. Integration Contract Pack
3. Integration Validation Pack
4. MES_IP_02_IDEMPOTENT_STAGE_REQUEST.md

## Objective

Implement logical request identity, retry safety, duplicate detection, replay safety, correlation identifiers and deterministic command processing.

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
