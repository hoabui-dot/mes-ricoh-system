# Won Seal Tech Machine Dataset

## Purpose

The script creates a deterministic Won Seal Tech demo resource dataset under the `WST-*` namespace. It uses the
existing MES Master Data model: Equipment definitions own Physical Machine Units; Workstation Machine Groups and
Requirements describe demand; Resource Assignments describe effective assignments; Resource Capabilities and Resource
Calendars provide planning inputs.

Printers are not duplicated here. Print Station owns printer definitions and bindings.

## Commands

Set `MES_MASTER_DATA_DATABASE_URL` or `DATABASE_URL` to the MES Master Data database:

```bash
npm run machines:verify
ALLOW_DESTRUCTIVE_SEED=true npm run machines:reset
```

`machines:reset` performs cleanup, seed, and verification. It refuses production and requires
`ALLOW_DESTRUCTIVE_SEED=true`. The script does not use execution-service or another service database.

For individual phases:

```bash
node scripts/reset-won-seal-tech-machines.mjs --cleanup
node scripts/reset-won-seal-tech-machines.mjs --seed
node scripts/reset-won-seal-tech-machines.mjs --verify
```

## Dataset

The seed creates 19 Equipment definitions and 40 Physical Machine Units across weighing, raw-material preparation,
mixing, preforming, compression molding, injection molding, post-curing, trimming, deflashing, inspection,
packaging, utility, and obsolete legacy examples. Active equipment is assigned to existing released Workstations:
`WS-MIXING-01`, `WS-CUTTING-01`, `WS-MOLD-KIOSK01`, and `WS-QC-01`.

Each active family receives one Machine Requirement Group, one required primary requirement, effective unit-level
Resource Assignments, an existing released Operation capability when its operation code exists, and current-date
Resource Calendar rows for every released Site shift. Missing operation prerequisites are skipped only when the
operation code is not present; missing Site, Workstation, or Shift prerequisites fail the seed.

## Cleanup and safety

Cleanup is restricted to Equipment codes, Physical Unit codes, Group codes, Assignment codes, Capability codes, and
Calendar codes owned by this dataset. It runs child-first and preserves unrelated history. Existing production
standard references to the namespace abort cleanup instead of deleting or rewriting history. The script never
deletes Work Orders, execution records, audit records, genealogy, or Print Station data.

The final verification reports calculated counts and checks assignment scope, valid physical units, planning rows,
and absence of invalid cross-site assignments. Re-running reset is idempotent.
