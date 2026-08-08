# MES Two-Line Primary/Backup Reimplementation Prompt Pack

Repository target: `https://github.com/hoabui-dot/mes-ricoh-system`

Primary business document: `WO-2-LINE.md`

This prompt pack is designed to reimplement and harden the MES two-line Primary/Backup resource-lane flow so that a Work Order selects one complete execution line, validates that every mandatory routing operation has at least one feasible execution candidate on that line, falls back to the backup line when the primary line is not feasible, and enters `RESOURCE_HOLD` when no complete eligible line is feasible.

## Execution order

1. `00_GLOBAL_EXECUTION_RULES.md`
2. `01_PHASE_0_BASELINE_AND_GAP_VERIFICATION.md`
3. `02_PHASE_1_LINE_DOMAIN_CONTRACT_AND_READINESS_POLICY.md`
4. `03_PHASE_2_MASTER_DATA_LINE_TO_WORKCENTER.md`
5. `04_PHASE_3_LINE_RESOURCE_SCOPE_API.md`
6. `05_PHASE_4_MES_CONSOLE_LINE_CONFIGURATION_WORKSPACE.md`
7. `06_PHASE_5_LINE_RELEASE_READINESS_GATE.md`
8. `07_PHASE_6_LINE_FEASIBILITY_EVALUATOR.md`
9. `08_PHASE_7_PRIMARY_BACKUP_SELECTION_AND_FALLBACK.md`
10. `09_PHASE_8_RESOURCE_PLANNING_ALIGNMENT_AND_REVALIDATION.md`
11. `10_PHASE_9_PRODUCTION_VERSION_AND_WO_DIAGNOSTICS_UI.md`
12. `11_PHASE_10_CANONICAL_SEED_AND_MIGRATION_DATA.md`
13. `12_PHASE_11_FULL_FLOW_E2E_REGRESSION_AND_FAILURE_SCENARIOS.md`
14. `13_PHASE_12_FINAL_AUDIT_AND_REPORT.md`

## Core target behavior

```text
Production Version
├── PRIMARY -> LINE-1
└── BACKUP  -> LINE-2

Create / plan Work Order
        ↓
Evaluate PRIMARY as a complete execution lane
        ↓
Every mandatory routing operation has >= 1 feasible candidate?
        ├── YES -> select PRIMARY
        └── NO  -> evaluate BACKUP
                    ├── YES -> select BACKUP
                    └── NO  -> RESOURCE_HOLD

Selected Line
        ↓
Exact resource proposal / manual resource planning
        ↓
Commit / revalidate / approve
        ↓
Execute
```

A single Work Order must not mix lines per operation unless a future explicitly approved business design introduces a controlled transfer/rework process.
