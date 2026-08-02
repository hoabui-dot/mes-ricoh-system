# Phase 10 - Full MES Reset and Won Seal Tech Seed

Date: 2026-08-02

Status: PASS

## Scope

Phase 10 added a guarded, repeatable local reset/seed/verify workflow for MES-owned data and a deterministic Won Seal Tech two-line production baseline.

The implementation follows `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`:

- Reset refuses unknown or production-like environments.
- Destructive reset/seed requires `ALLOW_DESTRUCTIVE_SEED=true`.
- Target environment and database identities are written to the verification artifact.
- Cleanup is child-first, exact, and limited to disposable MES Work Order rows plus `WST-SEED-*` seed rows.
- WMS/QMS production data, credentials, Keycloak, Kafka platform configuration, and printer secrets are not deleted.

## Implemented Commands

| Command | Status |
| --- | --- |
| `npm run reset:seed:mes` | IMPLEMENTED_AND_VERIFIED |
| `npm run seed:mes:won-seal-tech` | IMPLEMENTED_AND_VERIFIED |
| `npm run verify:mes:seed` | IMPLEMENTED_AND_VERIFIED |
| `npm run test:mes:two-line-flow` | IMPLEMENTED_AND_VERIFIED |

Required artifact:

- `artifacts/mes-seed-verification-20260802.json`

## Seed Content

The Phase 10 seed creates deterministic MES-owned rows under `WST-SEED-*`:

- Site reuse: released `SITE-KZ3`.
- Production Lines: `WST-SEED-LINE-1` primary and `WST-SEED-LINE-2` backup.
- Work Centers: 8 total, one equivalent Work Center per line and operation.
- Workstations: 8.
- Equipment: 8.
- Machine Units: 8.
- Resource Assignments: 8.
- Resource Capabilities: 8.
- Resource Calendars: 8.
- Main product: `WST-SEED-FG-SEAL-ASM-01-A`.
- Component: `WST-SEED-COMP-SEAL-RING-01-A`.
- EBOM: `WST-SEED-EBOM-SEAL-ASM-01`.
- MBOM: `WST-SEED-MBOM-SEAL-ASM-01`.
- Routing: `WST-SEED-ROUTING-SEAL-ASM-01`.
- Production Version: `WST-SEED-PV-SEAL-ASM-01`.
- Operations: Binding, Test 5 in 1, Air Test, Packing.
- Production Version line eligibility: Line 1 primary, Line 2 backup.

The Routing uses Line 1 Work Centers as source process Work Centers. Line 2 is seeded as a complete equivalent backup line. This preserves the invariant that one Routing defines the process while line selection chooses one complete Production Line for the Work Order.

## Verification Results

### Reset and Seed

Command:

```bash
npm run reset:seed:mes
```

Result: PASS

Highlights:

- MES Work Order cleanup: PASS.
- Work Order cleanup orphan audit: all zero after cleanup.
- Won Seal Tech machine reset: PASS.
- Machine fixture counts: 19 machines, 48 machine units, 17 machine groups, 37 assignments, 51 calendars, invalid count 0.
- `WST-SEED-*` cleanup from prior runs: PASS.
- Seed count verification: PASS.
- Work Order flow verification: PASS.
- Verification Work Order cleanup: remaining Work Orders 0.

### Repeatability

Command:

```bash
npm run verify:mes:seed && npm run verify:mes:seed
```

Result: PASS, PASS

Each verify run:

- Verified seed counts.
- Created a Work Order.
- Ran line selection.
- Selected `WST-SEED-LINE-1`.
- Ran Compute & Check.
- Committed all 4 operation resource allocations.
- Revalidated allocations as valid.
- Approved the Work Order.
- Cleaned the verification Work Order and workflow exactly.
- Verified remaining generated Work Orders: 0.

### Two-Line Flow

Command:

```bash
npm run test:mes:two-line-flow
```

Result: PASS

This command verified the Phase 10 seeded baseline flow and then ran the maintained full two-line regression:

- Phase 9 full two-line regression: 19 declared, 19 passed, 0 failed, 0 skipped.

## Artifact Summary

Final artifact:

- `artifacts/mes-seed-verification-20260802.json`

Final artifact status: `PASS`

The artifact contains:

- environment and database identities with passwords redacted;
- reset command outputs;
- seed IDs and counts;
- orphan counts;
- Work Order flow result;
- exact flow cleanup counts;
- Phase 9 regression command result for `test:mes:two-line-flow`.

## Runtime Notes

The local `mes-execution-service` container was rebuilt and restarted from current source during Phase 10 verification because the previously running container did not expose the current `POST /work-orders/{id}/line-replan` route. The rebuild also rebuilt `mes-master-data-service` as a compose dependency. After restart, Phase 10 line-selection verification passed.

The legacy `scripts/seed-mes-wo-complete-dataset.mjs` remains available but is not part of the default Phase 10 reset/seed path because it delegates to the separate WMS repository and requires WMS seed environment variables. Phase 10 does not delete or seed WMS data without a separate WMS reset contract.

## Gate

PASS.

- `reset:seed:mes` passes from a clean local disposable environment.
- `verify:mes:seed` passes repeatedly.
- `test:mes:two-line-flow` passes.
- Required artifact exists and has final `PASS` status.
- Generated verification Work Orders and workflows are cleaned exactly.
- No skipped test is counted as pass.
- No WMS/QMS production data or platform configuration is deleted.
