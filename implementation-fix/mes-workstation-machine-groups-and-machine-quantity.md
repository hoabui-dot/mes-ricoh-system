# MES Workstation Machine Groups and Machine Quantity

Date: 2026-07-24
Process: `process-fix/Implement-Workstation-Machine-Groups-and-Machine-Quantity-Management.md`
Status: Core database, API, Console, readiness, allocation schema, migration, and runtime paths implemented.

## Root cause and model decision

The previous Workstation flow accepted one `machine_id` and created one generic Primary Resource Assignment. That could not represent a production combination, could not distinguish physical units, and made readiness/allocation evaluate only one Equipment candidate.

The existing `md_equipment` row is retained as the Machine Master/physical-machine compatibility identity because Phase 1/2 capability, calendar, production-standard, OEE, and historical references already point to it. A new `md_machine_unit` table provides independently addressable units without changing existing Equipment IDs. Existing records receive quantity `1` and one unit, for example `EQ-MOLD-HYD01-01`. New quantity values create units `-01`, `-02`, and so on. This avoids silently treating a quantity as independently schedulable equipment.

## Database and migration

Forward migration `0023_workstation_machine_groups_and_units`:

- Adds `md_equipment.quantity` with a minimum of one.
- Creates `md_machine_unit` with unit sequence, unit code, serial number, execution status, and active flag.
- Backfills one unit for every existing Machine using quantity one.
- Creates `md_workstation_machine_group` with Site, Shopfloor, Work Center, Workstation, localized name, effective period, lifecycle, minimum required machine count, and concurrency settings.
- Extends `md_resource_assignment` with `machine_group_id`, `machine_unit_id`, `requirement_type`, and `sequence_no`.
- Adds active-group indexes and uniqueness constraints for active group members and one active Primary assignment per group.
- Converts deterministic legacy Workstation/Machine assignments into a `MG-LEGACY-<workstation>` default group and marks the existing Machine as Primary/Required without fabricating Supporting members.

Execution migration `000011_machine_group_allocations.up.sql` adds Machine Group, Primary Unit, and Supporting Unit snapshot columns to Work Order allocations and allows `MachineUnit` reservations.

## Backend APIs and rules

Added:

- `GET /api/mes/master-data/machines/:id/units`
- `GET /api/mes/master-data/workstations/:id/machine-groups`
- `POST /api/mes/master-data/workstations/:id/machine-groups`
- `POST /api/mes/master-data/workstations/:id/machine-groups/:groupId/members`
- `POST /api/mes/master-data/workstations/:id/machine-groups/:groupId/members/:memberId/end`
- `POST /api/mes/master-data/workstations/:id/machine-groups/:groupId/replace-primary`

Group creation is transactional with member insertion. It requires one Primary, rejects duplicate physical units, checks same-Site active Machine status, resolves an available unit when one is not explicitly supplied, enforces minimum member count, and preserves effective-dated history. Supporting members have Required or Optional semantics. Ending the last active member is rejected. Primary replacement ends the old membership and inserts a new effective-dated Primary in the same group.

Machine quantity increase creates additional available units. Reduction deactivates units from the highest sequence downward and rejects units with active assignments using `MACHINE_UNIT_ACTIVE_ASSIGNMENT`; historical records are retained. Quantity zero, fractional, or negative values return `MACHINE_QUANTITY_BELOW_ONE`.

## Console UX

Workstation forms now use a reusable Machine Groups editor instead of a single Machine selector:

- Add/remove multiple groups.
- Localized group names.
- Exactly one Primary selector per group.
- Supporting Machine checkboxes with Required/Optional selector.
- Minimum required machine count.
- Business name/code and available-unit count display.
- Derived Factory, Shopfloor, and Work Center context remains read-only.

Machine forms now require quantity and show the physical-unit count. Machine and Workstation detail responses expose units, group identity, role, requirement, effective dates, and business codes. No UUID is used as a visible identity. Vietnamese, English, Japanese, and Korean translations were added for the new controls and validation concepts.

Resource Assignment creation now selects Workstation first, derives Site and Work Center, and optionally selects a Machine Group. Legacy assignments remain supported.

## Readiness and allocation

Phase 2 readiness now evaluates active group candidates in addition to legacy ungrouped assignments. A group candidate returns:

- `machine_group`
- `primary_machine`
- `supporting_machines` with required/optional and readiness state
- Primary Equipment compatibility fields for existing consumers

It blocks missing/multiple Primary members, unavailable Primary machines, unavailable Required Supporting machines, insufficient active members, capability failures, and calendar/standard failures. Optional Supporting unavailability is a warning. Capability and Production Standard precedence remains Primary Machine/Equipment-specific before Work Center fallback; Machine Group-specific standards were not duplicated in this phase.

Phase 3 allocation accepts `machine_group_id`, snapshots the selected group and units, keeps the Primary Equipment compatibility columns, and creates `MachineUnit` reservations for Required Supporting members. The existing Workstation, Work Center, and Primary Equipment reservations remain atomic with the group-unit reservations.

## Verification

Passed:

- MES Console `npm run build`
- MES master-data `npm run build`
- MES master-data unit tests: 3 passed
- MES execution `go test ./...`
- `git diff --check`
- Docker builds for master-data, execution, and Console
- Docker runtime: master-data healthy; Console running; execution migration `000011` applied
- Live Machine list returns `quantity` and `available_unit_count`
- Live Machine units endpoint returns the backfilled physical unit
- Live Workstation detail returns the migrated default Machine Group and Primary unit
- Live readiness returns a group candidate with Primary Machine, unit code, and Supporting Machine array

The pre-existing non-fatal Schema Registry compatibility warnings remain unrelated to this change.

## Remaining limitations

- Browser click-through and screenshots were not available in this execution environment, so the required visual evidence for both themes remains pending.
- The Console editor selects Machine Masters and lets the backend resolve an available unit; a dedicated per-unit searchable picker and serial-number editing panel should be added for full unit administration.
- Allocation revalidation still uses the legacy Primary Equipment identity as its compatibility key; the persisted group/unit snapshot is authoritative for new allocation records, but full group-aware revalidation/reporting should be expanded.
- Supporting-machine overlap policy is enforced conservatively through active unit uniqueness and required reservation conflicts; a separate explicit replacement-policy configuration is not yet modeled.
