# Phase 10 — Canonical Two-Line Seed, Safe Data Reset, and Deterministic Test Fixtures

## Objective

Create deterministic canonical data that proves the two-line feature without manual DB edits.

## Required canonical topology

Seed at least one product/Production Version with two equivalent execution lanes:

```text
SITE / PLANT
└── Production Area
    ├── LINE-1 Primary
    │   ├── required Work Centers
    │   ├── Workstations
    │   ├── Resource Assignments
    │   └── Machine Units where required
    └── LINE-2 Backup
        ├── required Work Centers
        ├── Workstations
        ├── Resource Assignments
        └── Machine Units where required
```

The Production Version must reference both lines with deterministic Primary/Backup priority.

## Canonical Work Orders / scenarios

Prepare deterministic fixtures or seed scripts for at least:

### Scenario A — Primary READY

All mandatory operations have at least one feasible Primary candidate.

### Scenario B — Primary BLOCKED, Backup READY

At least one mandatory Primary operation has zero feasible candidates, while every mandatory Backup operation remains feasible.

### Scenario C — Both BLOCKED

Both lines have at least one mandatory operation with zero feasible candidates, producing `RESOURCE_HOLD`.

### Scenario D — Alternative candidate resilience

One resource in Primary is inactive, but another candidate remains feasible, so Primary must still be selected.

## Seed correctness

- Use public/application setup paths where practical.
- If direct seed DB writes are necessary, keep them deterministic and isolated to test/dev seed tooling.
- Do not create invalid domain data merely to force a UI state.
- Restore any temporary state mutation used by tests.
- Keep employee skill scope consistent with the backend domain if labor participates.

## Reset safety

Any reset script must target only approved local/dev/test environments and must fail safely when environment protection checks fail.

## Verification

After reset/reseed, run:

- master-data integrity checks,
- line topology checks,
- line resource scope checks,
- Production Version eligibility checks,
- all four canonical line-selection scenarios.

## Deliverable

Create:

`AI_document/two-line/PHASE_10_CANONICAL_SEED_REPORT.md`

## Phase gate

PASS when a fresh local/test environment can reproduce all canonical scenarios from scripts/tests alone.
