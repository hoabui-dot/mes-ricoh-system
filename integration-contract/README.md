# MES–WMS Integration Contract Pack

## Purpose

This pack is the shared integration architecture and governance source of truth for MES, WMS, PDA Backend, Kafka, Schema Registry, and related platform services.

It does not belong exclusively to MES.

It does not belong exclusively to WMS.

It defines the contracts between systems and must be stored in a neutral architecture or integration documentation location.

## Required Reading Order

1. `GLOBAL_RULE.md`
2. `phase/ICP_M1_CURRENT_STATE_BASELINE.md`
3. `phase/ICP_00_FOUNDATION.md`
4. `phase/ICP_01_SYSTEM_BOUNDARY.md`
5. `phase/ICP_02_DOMAIN_OWNERSHIP.md`
6. `phase/ICP_03_EVENT_CONTRACT.md`
7. `phase/ICP_04_DATA_MAPPING_MANIFEST.md`
8. `phase/ICP_05_VERSIONING_AND_CONCURRENCY.md`
9. `phase/ICP_06_IDEMPOTENCY_AND_EXACTLY_ONCE.md`
10. `phase/ICP_07_FAILURE_RECOVERY_AND_RECONCILIATION.md`
11. `phase/ICP_08_TEST_AND_ACCEPTANCE.md`
12. `phase/ICP_09_OPEN_DECISIONS.md`
13. `phase/ICP_10_CHANGE_MANAGEMENT.md`
14. `phase/ICP_11_ARCHITECTURE_GUARDRAILS.md`
15. `phase/ICP_12_INTEGRATION_READINESS_MATRIX.md`

Each phase has a matching AI execution prompt under `prompt/`.

## Directory Structure

```text
integration-contract/
├── README.md
├── GLOBAL_RULE.md
├── phase/
├── prompt/
├── reports/
├── baseline/
└── templates/
```

## Important Principle

Phase documents define architecture and governance.

Prompt documents instruct an AI agent how to execute that phase.

Changing a prompt does not automatically change the shared contract.

Changing a shared contract requires the change-management process defined in ICP-10.
