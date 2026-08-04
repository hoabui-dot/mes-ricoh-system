# AI Execution Prompt - Runtime Verification

## Meaning

Execute complete runtime verification through Kafka and WMS. Verify business state, not transport only.

## Read First

1. GLOBAL_RULE.md
2. Integration Contract Pack
3. Integration Validation Pack
4. MES_IP_05_RUNTIME_VERIFICATION.md

## Objective

Execute complete runtime verification through Kafka and WMS. Verify business state, not transport only.

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
