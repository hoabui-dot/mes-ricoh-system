# MES Print Station Integration, Workstation Binding, and Seeded E2E Flow

Date: 2026-07-26
Process: `process/Implement-MES-Print-Station-Integration-+-Workstation-Binding-+-Seeded-End-to-End-Flow.md`

## Scope and audit findings

The MES master-data service is an Express/TypeScript service backed by PostgreSQL and mounted through Kong at `/api/mes/master-data`. Workstations, Work Centers, Sites, Shopfloors, Machines, and physical machine units already belong to the master-data domain. The existing Station Agent Gateway is the health and execution boundary for print stations; the Printer Adapter remains a separate service and is not used as the MES Workstation identity.

The implementation therefore keeps three identities separate:

1. A Workstation is an MES production resource and can contain machine-group requirements.
2. A Print Station is a logical print/marking endpoint with its own gateway URL, deployment mode, status, and capabilities.
3. A physical machine and the Printer Adapter are infrastructure/execution concerns and are not substituted for either master-data identity.

## Database model

Migration `0035_print_stations_and_workstation_bindings` adds:

- `md_print_station`: business code, localized name/description, Site and optional Shopfloor ownership, Station Gateway URL, `PHYSICAL`/`SIMULATION`/`HYBRID` deployment mode, `PRINT`/`LASER`/`VISION`/`PLC` capabilities, health/software fields, lifecycle status, active flag, and audit timestamps.
- `md_workstation_print_station_binding`: Workstation-to-Print-Station relationship, `PRIMARY`/`BACKUP` role, effective date range, active flag, and audit timestamps.

The schema enforces unique station codes, valid enum values, valid date ranges, and one open active Primary binding per Workstation. API validation additionally enforces same-Site ownership, compatible Shopfloor scope, active station status, and non-overlapping role/date ranges.

## Backend API

The process document names `/api/v1`; this repository's deployed service convention is `/api/mes/master-data`. The implemented routes are:

- `GET/POST /print-stations`
- `GET/PATCH/DELETE /print-stations/:id`
- `POST /print-stations/:id/test-connection`
- `GET /print-stations/:id/health`
- `GET /print-stations/:id/workstations`
- `GET/POST /workstations/:workstationId/print-station-bindings`
- `PATCH/DELETE /workstation-print-station-bindings/:bindingId`
- `GET /workstations/:workstationId/resolved-print-station`

Responses expose station/workstation business codes and localized names for UI use. Internal UUIDs are retained for API writes and joins but are not the primary user-facing identity.

The connection test probes `${gateway_base_url}/health` with a bounded timeout. A healthy response sets `ONLINE`; another successful HTTP response sets `DEGRADED`; timeout/network/non-success sets `OFFLINE`. The health projection reports the last check, error, software version, and station identity. The resolver returns the current effective active Primary first, then Backup, excludes disabled stations, and emits a `PRINT_STATION_HEALTH_NOT_READY` warning for Offline/Degraded stations.

Deleting a station soft-disables it and is rejected while active bindings exist. Deleting or deactivating a currently effective binding is conservatively rejected with `PRINT_BINDING_ACTIVE_REQUIRES_SAFE_REALLOCATION`; historical/inactive bindings remain auditable. The master-data service does not own the execution database, so it cannot safely infer active Work Order dependencies during a binding mutation.

## Seed and repeatable verification

The idempotent seed script is:

```text
npm run seed:mes:print-workstation
npm run seed:mes:print-workstation -- --health
npm run verify:mes:print-workstation
```

Defaults target the local MES API, Site `SITE-KZ3`, Workstation `WS-MOLD-KIOSK01`, station code `PRINT-STATION-01`, and Station Gateway `http://100.68.50.41:5001`. The script refuses missing or cross-Site Workstations, will not silently replace another active Primary binding, and updates an existing station without changing its Site. Health is optional during seed because a remote gateway may be unavailable; the verification script records `SKIPPED` for an unready gateway and fails structural/resolver checks.

The live demo flow was verified twice for idempotency, then with `--health`. The resulting station is `ONLINE`, has `PRINT` capability, and resolves as the active Primary for `WS-MOLD-KIOSK01`.

## MES Console

The new route is `/master-data/print-stations`. `PrintStationsScreen.tsx` uses the shared shadcn/Radix Card, Button, Input, SelectBase, Modal, and StatusBadge components. It supports station list/detail inspection, station creation, connection testing, binding inspection, and Primary/Backup binding creation. Localized names and status/mode/capability labels use the existing VI/EN/JA/KO client i18n system. The sidebar and breadcrumb include the route.

## Verification

- Migration `0035` applied successfully in the running MES master-data database.
- `npm run seed:mes:print-workstation -- --health` passed.
- `npm run verify:mes:print-workstation` passed all structural, binding, resolver, and health checks.
- `npm run build` in `services/mes-console` passed.
- MES Console was rebuilt and restarted with Docker; `/master-data/print-stations` returned HTTP 200.
- The existing Schema Registry compatibility warning remains non-blocking and is unrelated to this feature.

