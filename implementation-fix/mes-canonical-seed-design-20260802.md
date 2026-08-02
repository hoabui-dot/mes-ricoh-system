# MES Canonical Seed Design - 2026-08-02

## Implemented Dataset

The canonical seed now rebuilds from an empty MES-owned reset:

- Base factory data: site, shopfloor, areas, UOMs, shifts, item/revision, MBOM, routing, production version.
- Base resource-planning fixture for `PV-FG-WS-CM01-R1`.
- Base labor fixture: three worker skills, four active workers, four worker-skill assignments, four target-date shift schedules, and three operation skill requirements.
- Deterministic two-line WST fixture `WST-SEED-PV-SEAL-ASM-01`.
- Execution read-model projections for base, labor, and WST fixtures.
- Traceability template, numbering rule, QR split rule, and four operation policies.
- Print-station master/runtime/bindings required by current full API flow setup.

## Rerun Design

The seed is deterministic and rerunnable through:

- `npm run seed:mes:canonical`
- `npm run reset:seed:verify:mes:canonical`

The seed uses local/test guards and writes machine-readable artifacts under `artifacts/mes-canonical-reset/<run-id>/`.

## Latest Passing Artifact

- Seed result: `artifacts/mes-canonical-reset/2026-08-02T09-59-14-659Z/seed-result.json`
- Status: PASS
