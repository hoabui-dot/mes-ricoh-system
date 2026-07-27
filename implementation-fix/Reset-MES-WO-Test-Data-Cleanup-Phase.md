# MES Work Order Reset and Cleanup, Phase 1

Date: 2026-07-27

## Scope

This phase implements cleanup only. It does not seed master data, create a
Work Order, alter released master data, or run the physical-print flow. Seed
and verification will be a separate phase after this baseline is approved.

## Script

`scripts/reset-mes-wo-test-data.mjs`

Commands:

```bash
npm run reset:mes:wo:dry-run

MES_ENV=development \
CONFIRM_DESTRUCTIVE_RESET=YES_DELETE_MES_TEST_DATA \
npm run reset:mes:wo
```

The default mode is dry-run. Reset mode requires a non-production environment,
an approved local/test database host and database name, and the exact
confirmation value. Credentials are redacted from generated artifacts.

## Audit and cleanup behavior

The script discovers public tables and foreign keys before auditing Work Order
records. It classifies each Work Order from its Production Version, snapshots,
operations, materials, and lifecycle references, then reports known orphan
records. Reset deletes child records before parent headers in one Execution DB
transaction, scopes outbox/workflow deletion to selected WO IDs/codes, cleans
related Kiosk outbound messages in its own transaction, and verifies orphans
afterward. Master-data tables and schema migrations are never deleted.

Artifacts are written to:

`artifacts/mes-reset-seed-verify/<timestamp>/`

including environment identity, schema discovery, audit, deletion plan,
deleted counts, integrity results, and summary.

## Verification

The dry-run completed successfully on the development database:

- Work Orders: `0`
- invalid Work Orders: `0`
- all audited orphan categories: `0`
- mutation: none

The destructive guard was also tested without confirmation and correctly
failed with `ENVIRONMENT_SAFETY` before connecting or mutating data.

The confirmed reset was then executed against the allow-listed development
database. It deleted zero rows because the baseline was already clean and
completed with zero remaining Work Orders and zero orphan rows. The generated
reset artifact is `artifacts/mes-reset-seed-verify/2026-07-27T16-49-17-001Z/`.

## Next phase

Seed a deterministic `E2E-*` master-data scenario through canonical APIs where
possible, verify Production Version readiness, then create and verify a strict
Work Order. The seed phase must not be added to this destructive cleanup
script.
