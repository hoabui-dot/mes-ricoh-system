# MES Print Station Capacity Allocation and Runtime Visibility

Date: 2026-07-27
Requirement: `process-fix/Complete-MES-Print-Station–Workstation-Capacity-Allocation-and-Runtime-Visibility.md`

## Capacity model

MES now models one Print Station to many Workstations and one current Print
Station per Workstation. A binding reserves a positive integer
`allocated_printer_quantity`; physical printer IDs remain owned by the Edge
Printer Adapter.

The authoritative capacity is:

```text
effectiveAllocationCapacity =
  min(configuredAllocationLimit when present, activeForWorkPrinterCount)
```

When runtime inventory is unavailable and no configured limit exists, capacity
is `null` and new allocations are rejected with
`PRINT_STATION_RUNTIME_NOT_AVAILABLE`. Runtime readiness is separate:
`readyPrinterCount` is compared with total allocation and never silently changes
or deletes a binding. Over-allocation is exposed as `allocation_deficit` and
new allocation/increases are blocked until capacity is restored or an existing
allocation is reduced/ended.

## Database changes

Migration `0037_print_station_capacity_allocation` adds:

- `md_print_station.configured_allocation_limit`
- `md_workstation_print_station_binding.allocated_printer_quantity`
- `ended_by` and `end_reason`
- runtime projection counts for registered, ready, busy, offline, and
  active-for-work printers
- positive quantity and non-negative capacity/count checks
- a unique current binding index on `workstation_id`

Legacy binding rows receive the explicit migration default quantity `1`. This
is a controlled demo migration default; it is not inferred from physical
printer IDs. Historical rows remain intact.

Create and quantity-update operations run in a transaction and lock the target
Workstation and Print Station rows before summing active allocations. The
Print Station row lock serializes concurrent allocation requests.

## API changes

Updated Master Data APIs:

- `GET /print-stations` and `GET /print-stations/:id` return capacity,
  allocated, remaining, runtime counts, runtime status, and allocation deficit.
- `GET /print-stations/:id/runtime` returns the complete runtime/capacity view.
- `GET /print-stations/:id/workstations` returns only current active bindings.
- `GET /print-stations/:id/workstation-candidates` filters active Workstations
  already bound anywhere and returns the maximum allocatable quantity.
- Binding create requires `allocated_printer_quantity` and enforces capacity.
- Binding PATCH supports transactional quantity changes.
- Binding DELETE ends the row with `effective_to`, `ended_by`, and optional
  `end_reason`; it does not delete history.
- Workstation list rows now include Print Station code, allocation quantity,
  and runtime status.
- Workstation detail now includes `print_station_integration` with station,
  allocation, runtime, heartbeat, and error information.

Stable errors include `WORKSTATION_ALREADY_HAS_PRINT_STATION`,
`INVALID_ALLOCATED_PRINTER_QUANTITY`, `PRINT_STATION_RUNTIME_NOT_AVAILABLE`,
and `PRINT_STATION_ALLOCATION_EXCEEDS_CAPACITY`.

## UI changes

`PrintStationsScreen` now:

- removes Site from the table;
- shows Workstations, capacity, allocated, remaining, and runtime status;
- displays ready/Kafka/runtime capacity in the detail panel;
- shows each active Workstation allocation quantity;
- loads server-filtered candidates instead of filtering only in the browser;
- requires an integer allocation quantity and disables linking at zero capacity;
- refreshes candidates and capacity after link/unlink mutations.

Vietnamese, English, Japanese, and Korean translations were added for the new
capacity labels and validation errors.

## Runtime verification

Passed:

- MES Master Data TypeScript compilation
- MES Console TypeScript compilation
- migration application in the running `mes-master-data-db`
- Master Data service Docker rebuild/restart
- `GET /api/mes/master-data/print-stations` HTTP 200
- `GET /api/mes/master-data/print-stations/{id}/workstation-candidates` HTTP 200
- `GET /api/mes/master-data/workstations` HTTP 200 with station/allocation fields

Live fixture evidence after migration:

```text
PRINT-STATION-01
effective capacity: 1
allocated quantity: 2
ready printers: 1
runtime status: ONLINE
candidate count: 0
```

The fixture is intentionally over-allocated after the runtime projection
reported one active-for-work printer while two Workstations retained their
historical allocations. No binding was deleted. The API blocks additional
allocation and exposes the shortage for the UI. The service also emitted an
existing, non-blocking Schema Registry compatibility warning during startup;
the service remained running and its migration/API checks passed.

## Remaining verification

Physical runtime recovery and a live concurrent two-request race test require
the deployment host's real Printer Adapter/Kafka heartbeat and a dedicated test
fixture. The database row lock and unique current-binding index are in place;
no physical printer allocation is claimed by this local verification.
## Workstation detail integration

The Workstation detail route now renders the active Print Station binding when
`print_station_integration` is present. It shows the station business code and
localized name, allocated quantity, runtime readiness, Kafka status, heartbeat,
and the printer snapshot using printer business codes and statuses. Internal
UUIDs are not rendered. The detail API now includes the runtime printer
snapshot from `md_print_station_runtime_projection` so the UI can show the
actual devices associated with the bound station.

The workstation selector bug was corrected as well. Candidate loading now
returns active Workstations with `lifecycle_status = 'Released'` that belong to
the Print Station's Site and have no current binding. Shopfloor is optional,
matching the binding validation rule, so a valid released Workstation is not
silently hidden just because its Shopfloor value differs or is unset.

The Workstation detail CRUD now exposes a localized Release action for Draft,
In Review, and Inactive Workstations. The action uses the shared confirmation
dialog and the existing transactional `/:resource/:id/release` endpoint. After
success, the detail view refreshes its lifecycle state; the Workstation then
appears in the Print Station selector when it satisfies the Site and binding
eligibility rules.

## Runtime status correction

The MES runtime projection consumer was silently dropping Printer Adapter Kafka
heartbeats because the .NET producer serializes envelope and payload fields in
PascalCase (`Payload`, `PrinterCode`, `Status`, and similar), while the
consumer only looked for camelCase/snake_case names. Field lookup is now
case-insensitive, so heartbeats and status events update the Print Station
projection instead of leaving the UI on the stale `OFFLINE` fallback.

The Print Station binding action remains clickable when capacity is exhausted;
the transactional binding API returns the stable capacity error and the UI
shows it as a toast. Binding is not disabled based only on runtime state.

## Binding lock correction

Binding creation failed with PostgreSQL error `FOR UPDATE cannot be applied to
the nullable side of an outer join`. The station lock query joined the optional
runtime projection and applied an unscoped `FOR UPDATE`. Both binding creation
and binding quantity update now use `FOR UPDATE OF ps`, locking only the
authoritative `md_print_station` row while leaving the optional runtime row
nullable. MES Master Data Service compilation passed after the correction.

MES Console and MES Master Data service production builds passed after this
change. Live API verification was unavailable in this shell because Docker
socket access was denied and the local service port was not running.
