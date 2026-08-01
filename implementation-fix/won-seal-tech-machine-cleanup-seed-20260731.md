# Won Seal Tech Machine Cleanup and Seed

## Implementation

Added `scripts/reset-won-seal-tech-machines.mjs` with `--cleanup`, `--seed`, `--verify`, and `--reset` modes.
The script uses the MES Master Data database only and resolves Site, released Workstations, Shifts, and Operations
by business code. It does not query or write another service database and does not duplicate Print Station printer
ownership.

Cleanup is limited to the deterministic `WST-*` namespace. It removes child relationships first, checks for generated
Production Standard references, and rolls back on failure. It never deletes Work Orders, execution history, audit
records, genealogy, or Print Station records. Reset is blocked in production and requires
`ALLOW_DESTRUCTIVE_SEED=true`.

The seed creates Equipment definitions and Physical Machine Units, then creates Workstation Machine Groups,
Machine Requirements, effective Resource Assignments, existing Operation capabilities where the released operation
code exists, and current-date Resource Calendar rows for released Site shifts. Machine Requirements remain distinct
from Resource Assignments, and runtime Work Order allocations remain owned by MES Execution.

## Commands

```bash
ALLOW_DESTRUCTIVE_SEED=true npm run machines:reset
npm run machines:verify
```

Database connection uses `MES_MASTER_DATA_DATABASE_URL` or `DATABASE_URL`.

## Runtime verification

The reset was run twice consecutively on 2026-07-31. Both runs passed:

| Projection | Count |
|---|---:|
| Equipment definitions | 19 |
| Released Equipment definitions | 17 |
| Physical Machine Units | 40 |
| Planning-eligible units | 37 |
| Machine Groups | 17 |
| Effective Resource Assignments | 37 |
| Resource Calendar rows | 51 |
| Invalid cross-scope assignments | 0 |

Result: `PASSED`. The second run produced the same logical counts, confirming deterministic cleanup and seed behavior.
