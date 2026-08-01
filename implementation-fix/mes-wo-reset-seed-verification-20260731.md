# MES WO Reset/Seed Verification - 2026-07-31

## Command and result

The existing command was used; no parallel seed script was created:

```bash
npm run reset:seed:mes:wo
```

The first run completed cleanup but stopped during scenario creation because
`createScenario()` referenced `manifest.workstation` before `manifest` existed.
The authoritative value is already available as `context.workstation`; the
existing script was corrected in place.

The strict rerun correctly stopped because the remote Print Station runtime was
offline:

```text
runtime_status=OFFLINE
kafka_status=CONNECTED
ready_printer_count=0
PRINT_STATION_RUNTIME_NOT_READY
```

This is a valid safety stop. It prevents claiming physical-print readiness when
the remote adapter has not sent a usable printer heartbeat.

For database and MES UI verification only, the completed run used:

```bash
ALLOW_PRINT_STATION_OFFLINE=true npm run reset:seed:mes:wo
```

Artifact:
`artifacts/mes-reset-seed-verify/2026-07-31T01-31-07-315Z/`

## Cleanup verification

The delegated Work Order cleanup removed the previous WO and its dependent
workflow/material/labor artifacts. The post-cleanup audit reported zero for:

- orphan operations, materials, execution sessions, confirmations;
- orphan print jobs, attempts and events;
- orphan allocations and capacity reservations;
- orphan workflow events/workflows.

The cleanup then reseeded labor (8 employees, 3 shifts), WMS demo data and the
owned MES fixture without truncating shared master data.

## Seeded master-data baseline

| Entity | Business identity | Status/result |
| --- | --- | --- |
| Item | `E2E-WO-FG-01` | Released |
| Item Revision | `E2E-WO-FG-01-R1` | Released, effective |
| EBOM | `EBOM-20260731-0003` | Released, 1 line |
| MBOM | `E2E-WO-MBOM-01` | Released, 1 line |
| Routing | `RT-20260731-0003` | Released, 3 operations |
| Production Version | `PV-20260731-0002` | Released and production-ready |
| Workstation | `WS-20260727-0006` | Released, used by all 3 Routing Operations |
| Machine Group | `MG-20260727-0004` | Released, 1 active Primary assignment |
| UOM | `PCS` | Released, precision 0, fractions disabled |
| WMS component stock | `SFG-MET-CM01-R1` | 2035 available, required 2 |

Ownership validation confirmed:

```text
ProductionVersion.item_revision_id
= EBOM.item_revision_id
= MBOM.item_revision_id
= Routing.item_revision_id
```

The MBOM issue operation resolves to exactly one released Routing Operation.
All three operations have a direct Workstation assignment, and all three
planning standards/capabilities plus three site-shift calendars were seeded.

## Seeded Work Order

| Field | Value |
| --- | --- |
| WO | `WO-20260731-0001` |
| Status | Draft |
| Production Version | `PV-20260731-0002` |
| Quantity | 2 PCS |
| Operations | 3 |
| Planning snapshots | 3 valid |
| Material requirements | 1 |
| Resource allocations | 0, intentionally pending user action |
| Print jobs | 0, intentionally pending approval/execution |

The seed leaves the WO in Draft by design. It does not fake approval,
allocation, staging, Kafka print commands or physical printer completion.

## Current limitation

The local MES projection sees the binding and Kafka connection, but the remote
Print Station currently reports `OFFLINE` and zero ready printers. Therefore the
seed is valid for MES master-data, WO planning and UI verification, but the
physical print flow is not verified by this run.

After the remote adapter reports `ONLINE` with at least one ready printer, run
the strict command again without `ALLOW_PRINT_STATION_OFFLINE` and then execute
the approval/allocation/print flow below.

## Suggested MES Console manual test

1. Open **Master Data -> Items**. Find `E2E-WO-FG-01`; verify Released status,
   localized name and base UOM `PCS`.
2. Open the Item Revision detail. Verify `E2E-WO-FG-01-R1` is Released and
   effective. Confirm no direct editing is available for released data.
3. Open **EBOM**. Find `EBOM-20260731-0003`, open detail, verify one engineering
   component and read-only UOM display.
4. Open **MBOM**. Find `E2E-WO-MBOM-01`, open detail, verify one component, its
   UOM and issue operation. Run **Check Structure** and confirm success.
5. Open **Routings**. Find `RT-20260731-0003`; verify operations 10/20/30,
   Work Center `WC-CUTTING`, and Workstation `WS-20260727-0006`.
6. Open **Production Versions**. Find `PV-20260731-0002`; verify Item Revision,
   EBOM, MBOM, Routing and Released status. Open the detail modal and verify
   localized names with codes as secondary text.
7. Open **Master Data -> Workstations** and inspect `WS-20260727-0006`.
   Confirm the Machine Requirements section is separate from Assigned Machines,
   and the assigned physical unit is shown from effective Resource Assignment.
8. Open **Work Orders** and open `WO-20260731-0001`. Confirm Draft status,
   quantity 2 PCS, three operation snapshots, one material requirement, and no
   print job before approval.
9. Run **Compute & Check**. Verify all operations show planning values and
   candidate diagnostics. The current environment may show warnings for remote
   Print Station readiness while its runtime is offline.
10. Select the valid resource proposal, commit allocations for all operations,
    and verify allocation status before approval. Do not use a requirement row
    as proof that a WO resource allocation is committed.
11. In strict mode, approve the WO. Verify it becomes Released and the WMS
    material request/staging flow follows the configured current business mode.
12. When the Print Station is online, verify operation 20 reaches print-station
    readiness, a Kafka batch print command is emitted, the remote adapter prints,
    and the WO detail updates from queued/printing to completed without refresh.
13. Verify approval retry is idempotent and does not create a second WO, print
    job or physical print.

## Verification commands

```bash
MES_MASTER_DATA_URL=http://127.0.0.1:13020 node scripts/test-mes-resource-planning-constraints.mjs
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml ps mes-master-data-service mes-console
```

The planning verification returned `PASS=10 FAIL=0` with two documented
non-destructive skips. The Master Data service and MES Console were healthy and
the Console returned HTTP 200.
