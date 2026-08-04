# AI Execution Prompt - Consumer Correctness

## Meaning

Harden the WMS result consumer. Implement durable inbox, explicit offset commit, version safety, ordering, transition guard, duplicate handling, unknown aggregate handling and exactly-once business effect.

## Read First

1. GLOBAL_RULE.md
2. Integration Contract Pack
3. Integration Validation Pack
4. MES_IP_01_CONSUMER_CORRECTNESS.md

## Objective

Harden the WMS result consumer. Implement durable inbox, explicit offset commit, version safety, ordering, transition guard, duplicate handling, unknown aggregate handling and exactly-once business effect.

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
