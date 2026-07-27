# Reset and Seed Complete MES Work Order Dataset: Phase 2

Date: 2026-07-27

## Scope

Implemented the reusable development seed baseline for one complete MES Work
Order scenario. The seed now cleans Work Order snapshots first, removes the
disposable routing/MBOM/Production Version/item fixtures, rebuilds one released
finished-good configuration, seeds labor and WMS support data, and performs
live readiness checks.

## Commands

Dry run:

```bash
npm run seed:mes:wo:dry-run
```

Destructive development reset and seed:

```bash
MES_ENV=development \
CONFIRM_MASTER_DATA_RESET=YES_RESET_E2E_MASTER_DATA \
npm run seed:mes:wo
```

Shortcut with the development guard and confirmation included:

```bash
npm run reset:seed:mes:wo
```

This shortcut is intentionally destructive and is equivalent to the explicit
command above. It must only be used against the guarded local development
database.

The command first delegates Work Order cleanup to
`scripts/reset-mes-wo-test-data.mjs` with its independent destructive guard.
It then cleans disposable MES master fixtures and creates the new scenario.

## Cleanup policy

Removed from the development baseline:

- all Work Order headers and child snapshots/artifacts, including operations,
  material requirements, routing/planning snapshots, allocations, approval
  logs, execution/print history, workflow events, outbox records and kiosk
  messages;
- routing headers and operations with `RT-*` codes;
- MBOM headers/lines with `MBOM-*` or `E2E-WO-*` codes;
- Production Versions with `PV-*` codes;
- disposable items/revisions with `DEMO-*`, `ITEM-*`, or `E2E-WO-*` codes;
- dependent EBOM lines/headers, production standards, numbering rows, and
  execution read-model rows for the deleted fixture IDs;
- legacy projection rows whose master rows were already removed, identified
  by deterministic development codes (`RT-20260727-*`, `PV-20260727-*`,
  `PV-E2E-*`, `PV-FG-WS-*`, and `E2E-WO-*`).

Released `FG-*`, `SFG-*`, and `RM-*` items remain because they are shared
factory/WMS master data. The released component `SFG-MET-CM01-R1` is reused by
the new MBOM and has live inventory.

## Seeded scenario

- Finished item: `E2E-WO-FG-01`
- Revision: `E2E-WO-FG-01-R1`
- MBOM: `E2E-WO-MBOM-01`, one component line, quantity `1 PCS`
- Routing: generated `RT-YYYYMMDD-NNNN`, three released operations with
  predecessor sequence `10 -> 20 -> 30`
- Production Version: backend-generated `PV-YYYYMMDD-NNNN`, released and
  validated against the released item revision, MBOM and routing
- Site: `SITE-KZ3`
- Workstation: `WS-20260727-0006`, physical print capability retained
- Print station: `PRINT-STATION-01`, runtime `ONLINE`, Kafka `CONNECTED`, one
  active printer
- Labor: eight employees, three released shifts, weekday schedules for the
  demo horizon
- WMS: locations/bins, active component lots, balances, inbound and outbound
  demo records

## Implementation

Changed:

- `scripts/seed-mes-wo-complete-dataset.mjs`
  - local/development guard and dry-run plan;
  - transactional fixture cleanup by master IDs;
  - cleanup of EBOM and other dependent rows before item deletion;
  - execution projection cleanup by IDs plus legacy business-code fallback;
  - Work Order snapshot reset delegation;
  - labor and WMS seed orchestration;
  - live WMS lot/expiry/quantity verification;
  - master-data projection rebuild and Production Version/print readiness checks.
- `scripts/seed-mes-labor-demo.sh`
  - corrected active employee-skill upsert to use the partial unique active
    index, preserving historical rows without duplicate active skills.
- `package.json`
  - reusable `seed:mes:wo:dry-run` and `seed:mes:wo` commands.

## Verification result

Final run artifact:

`artifacts/mes-reset-seed-verify/2026-07-27T17-11-43-225Z/`

Verified:

- Work Orders after cleanup: `0`;
- orphan Work Order child records after cleanup: `0`;
- master Production Version readiness: `true`;
- item revision status: `Released`;
- MBOM and routing status: `Released`;
- routing operation count: `3`;
- MBOM line count: `1`;
- print station readiness: `ONLINE`, Kafka `CONNECTED`, ready printer count `1`;
- WMS active component stock: `2038.03 PCS`, required seed quantity `2 PCS`;
- active WMS lots are not expired for the planned date `2026-08-01`;
- execution read-model contains one current E2E item revision, MBOM, routing and
  Production Version after legacy projection cleanup.

The seed baseline is ready for the next phase: creating one Work Order through
the official execution API, verifying its snapshots, then allocating labor and
running the strict approval/material staging/execution/print flow. This report
does not claim that the physical-print Work Order flow was run by this seed
command.
