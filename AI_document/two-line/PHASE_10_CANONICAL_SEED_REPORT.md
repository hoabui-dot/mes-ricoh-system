# Phase 10 Canonical Seed Report

Date: 2026-08-07

## Objective

Provide a safe, deterministic two-line MES dataset that reproduces Primary, Backup, Resource Hold, and alternative-candidate behavior without manual database changes.

## Canonical topology

- Site: Won Seal Tech canonical site.
- Primary: `WST-SEED-LINE-1`, priority 1.
- Backup: `WST-SEED-LINE-2`, priority 2.
- Both lines contain all four Routing Work Centers and their scoped Workstations, Resource Assignments, Equipment, Machine Units, capabilities, production standards, and calendars.
- Primary Binding has two independent candidates. The additional candidate is `WST-SEED-WS-L1-BINDING-ALT` with an `Alternate` assignment.
- The canonical Production Version exposes deterministic Primary/Backup eligibility.

## Implementation summary

- Expanded the canonical seed from 8 to 9 Workstations, Equipment records, Machine Units, and Resource Assignments.
- Expanded operation capabilities from 12 to 13 and resource calendars from 8 to 9.
- Added the alternative Primary Binding candidate through normal, valid domain records rather than an invalid test-only state.
- Expanded the two-line fixture script from three to four scenarios.
- Added state snapshot and restoration for every Workstation mutation used by the scenarios.
- Kept reset ownership bounded to canonical records. Operations referenced by non-canonical Routings are reused and are not deleted.
- Made verification accept additive execution-calendar rows while retaining minimum canonical topology assertions.

## Canonical scenarios

| Scenario | Expected | Result |
| --- | --- | --- |
| Primary READY | Primary selected; every operation feasible | PASS |
| Primary BLOCKED, Backup READY | Backup selected with fallback diagnostics | PASS |
| Both BLOCKED | No selected line; `RESOURCE_HOLD` persisted | PASS |
| Alternative candidate resilience | Base Primary Binding Workstation inactive; alternate remains feasible; Primary selected | PASS |

Alternative-candidate evidence records two candidates for the affected operation, one feasible candidate, and one exclusion with `WORKSTATION_INACTIVE`.

## Reset safety and integrity

- Reset requires `MES_ENV=development` and `ALLOW_DESTRUCTIVE_SEED=true`.
- Full reset additionally requires the explicit full-reset confirmation variables.
- Canonical cleanup uses namespace/ownership predicates and checks references before deleting shared operations.
- Fresh reset/reseed verification reported:
  - 2 Production Lines
  - 8 line Work Centers
  - 9 Workstations
  - 9 Equipment records
  - 9 Machine Units
  - 9 Resource Assignments
  - 13 Resource Capabilities
  - 9 Resource Calendars
  - 4 Production Versions
  - 8 Production Version line eligibilities
  - 0 orphan/integrity defects
- Temporary fixture mutations were restored and disposable Work Orders, allocations, and reservations were cleaned.

## Commands and evidence

- `npm run reset:seed:mes`: PASS.
- `npm run seed:mes:canonical`: PASS.
- `npm run verify:mes:canonical-seed`: PASS.
- `npm run test:mes:two-line-resource-planning:phase7`: PASS with four generated scenarios.
- `npm run test:mes:two-line-resource-lifecycle:phase8`: PASS, 5/5, 0 skipped.
- Fixture evidence: `artifacts/mes-two-line-uat-phase7-gate/`.
- Lifecycle evidence: `artifacts/mes-two-line-uat-phase8-gate/`.
- Reset/seed evidence: `artifacts/mes-canonical-reset/2026-08-07T09-33-35-953Z/`.

## Files changed

- `scripts/mes-phase10-reset-seed-verify.mjs`
- `scripts/mes-two-line-uat-fixtures.mjs`
- `scripts/verify-mes-canonical-seed.mjs`
- `scripts/test-mes-two-line-exact-selection-phase7.mjs`
- `package.json`
- `AI_document/two-line/PHASE_10_CANONICAL_SEED_REPORT.md`

## Schema and migration assessment

No migration was required. The existing schema already supports multiple valid candidates for one line operation. This phase adds deterministic seed records and verification only.

## Phase gate

PASS
