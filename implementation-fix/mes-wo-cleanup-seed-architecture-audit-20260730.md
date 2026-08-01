# MES Cleanup and Complete Work Order Seed Audit

Date: 2026-07-30

## Scope

The existing command was retained:

```bash
npm run reset:seed:mes:wo
```

It owns `scripts/seed-mes-wo-complete-dataset.mjs`, which delegates Work Order
child-first cleanup to `scripts/reset-mes-wo-test-data.mjs`. No parallel seed
workflow was introduced.

## Outdated assumptions corrected

| Old assumption | Correction |
|---|---|
| Cleanup selected every `RT-*`, `PV-*`, `ITEM-*`, and `DEMO-*` row | Cleanup is limited to the owned `E2E-WO-*` routing/MBOM fixture, the exact `E2E-WO-FG-01` item and its structures, and PVs that reference those exact structures. |
| EBOM was absent from the scenario | The seed now creates, fills, releases, and verifies one EBOM owned by the output Item Revision. |
| MBOM and Routing were created without output ownership | Both API payloads now send the same `item_revision_id` as the output revision. |
| Production Version did not retain the EBOM baseline | PV creation includes `ebom_header_id`; EBOM remains audit-only and is not exploded into WO materials. |
| Component revision was only matched by code | The seed requires an effective Released component Revision and Released component Item. |
| Success depended only on the readiness endpoint | A direct database verification checks Released lifecycle, ownership equality, structure line counts, and exact MBOM issue-operation membership. |
| Item creation API had an invalid revision INSERT | Fixed the missing `$16` expression for `md_item_revision.specification_ref`. |
| Production Version site validation could be ambiguous | Qualified Item Revision effective-date columns as `r.effective_from`/`r.effective_to`. |

## Cleanup safety

The script preserves the existing guards:

- `MES_ENV` must be `development`, `local`, `test`, or `staging`.
- Database hosts must be local/test allow-listed hosts.
- Reset requires `CONFIRM_MASTER_DATA_RESET=YES_RESET_E2E_MASTER_DATA`.
- Work Orders and their execution, planning, print, allocation, workflow, outbox, and kiosk artifacts are audited and deleted child-first in a transaction.
- Master-data deletion is structure-scoped and runs after Production Version deletion.
- Users, roles, migrations, shared site/UOM/resource fixtures, unrelated structures, and historical Work Orders are not targeted.

## Runtime execution

Command:

```bash
npm run reset:seed:mes:wo
```

Result: passed on 2026-07-30.

Cleanup removed 15 disposable Work Orders, 45 operation snapshots, 15 material snapshots, 39 resource allocations, 13 print jobs, 13 print attempts, 13 print events, 15 approval/workflow records, and 80 related outbox events. Post-cleanup orphan checks were all zero.

The seed then created/reused the supporting labor, WMS, resource, calendar, print-station, and traceability fixtures. It created 8 employees, 3 shifts, 1,064 weekday schedule rows, 3 routing capabilities, 3 production standards, 3 worker requirements, and 3 resource calendars for the target date.

## Verified master-data graph

| Entity | Result |
|---|---|
| Item | `E2E-WO-FG-01`, Released |
| Item Revision | `E2E-WO-FG-01-R1`, Released and effective |
| EBOM | Released, 1 active engineering line |
| MBOM | `E2E-WO-MBOM-01`, Released, 1 active manufacturing line |
| Routing | `RT-20260730-0002`, Released, 3 active operations |
| Production Version | `PV-20260730-0001`, Released |
| Site/UOM | `SITE-KZ3` / `PCS`, both Released |
| Issue operation | MBOM line maps to exactly 1 selected Routing operation |

Verified IDs:

- Item Revision: `6fd21a71-c509-474f-a536-46e1af677636`
- EBOM: `06ab695f-11e1-4d56-974b-7383151a9547`
- MBOM: `8f965792-1d28-4179-be85-448e294b6b16`
- Routing: `bd753e43-d0ec-4ccc-8abd-601b124f7aa6`
- Production Version: `fb83a61e-5332-4d70-9ebb-578c523528b3`

The production-readiness endpoint returned `ready: true`, with no warnings. Print readiness was `ONLINE`, Kafka `CONNECTED`, and one active ready printer was reported. WMS component stock was live-checked at 2 required units and 2,035 available units.

## Work Order verification

The script created the Work Order through the current workflow API using the authoritative `production_version_id`:

- WO: `WO-20260730-0001`
- WO ID: `cf61ea07-380b-4940-ad1b-200e02d2f78c`
- Status after creation: `Draft`
- Operations: 3
- Material snapshots: 1
- Compute & Check: passed; 3 labor assignments returned
- Resource candidate lookup: all 3 operations `Ready`, one candidate each
- Planning snapshot validation: 3/3 valid
- Operation sequences: 10, 20, 30

This verifies the full Production Version -> Work Order creation and planning snapshot path. Approval, WMS material approval/staging, execution completion, and physical print are separate runtime actions and were not silently claimed by this seed command.

## Verification commands

```bash
npm run seed:mes:wo:dry-run
npm run reset:seed:mes:wo
npm --prefix services/mes-master-data-service run build
npm --prefix services/mes-console run build
go test ./...                         # from services/mes-execution-service
node --check scripts/seed-mes-wo-complete-dataset.mjs
git diff --check
```

All commands above passed. The MES Master Data Service was rebuilt and recreated before the successful seed run. The MES Console build passed; its existing Docker image was also rebuilt earlier in this work session.

## Remaining limitation

The scenario intentionally leaves the new WO in `Draft` after creation and Compute & Check. It does not auto-approve, stage WMS material, or trigger a printer, because those are business actions outside cleanup/seed and must be tested explicitly through their current APIs/UI.
