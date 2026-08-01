# Machine and Equipment Architecture Implementation Report

## Scope

Implemented the Machine Definition / Physical Machine Unit separation from `process-fix/Machine-Equipment-architecture.md` without changing Work Order allocation ownership.

## Current ownership

| Concept | Authoritative source | Meaning |
|---|---|---|
| Machine Definition | `md_equipment` | Equipment type, site, Work Center, expected quantity, master lifecycle and aggregate planning state. |
| Physical Machine Unit | `md_machine_unit` | One identifiable physical machine with asset code, serial number, lifecycle, execution status and planning eligibility. |
| Machine requirement | `md_workstation_machine_requirement` | The type, role and quantity required by a Workstation. |
| Effective assignment | `md_resource_assignment` | The concrete Machine Unit/Equipment assignment to a Workstation, with effectivity and history. |
| WO allocation | `wo_resource_allocation` | The physical resource committed to a Work Order operation and time window. |

`md_equipment.quantity` is an expected quantity only. It is no longer treated as proof that identifiable physical resources exist. `md_equipment.serial_number` remains only as a legacy compatibility field and is migrated when it unambiguously represents a single unit.

## Database changes

Migration `0061_physical_machine_unit_identity_and_readiness` adds to `md_machine_unit`:

- `lifecycle_status`: `Draft`, `Released`, `Inactive`, or `Obsolete`.
- `physical_identity_status`: `Identified`, `PendingIdentification`, or `Ambiguous`.
- `planning_resource_flag`: explicit eligibility for planning and assignment.
- a partial unique index for non-empty serial numbers.

The migration creates `md_machine_unit_migration_reconciliation` so quantity/serial ambiguity is recorded rather than silently converted. Quantity-one equipment with a serial is identified automatically. Units without a serial remain `PendingIdentification` and are not planning resources. Historical assignment rows are retained.

## API implementation

Added or completed:

- `GET /api/mes/master-data/machines/:machineId/units`
- `POST /api/mes/master-data/machines/:machineId/units`
- `GET /api/mes/master-data/machine-units/:unitId`
- `PUT /api/mes/master-data/machine-units/:unitId`

The create API requires a serial number, creates an identified Released unit, and calculates planning eligibility from the parent Machine Definition. Updates recalculate identity and planning state. Deactivation, maintenance, and lifecycle changes are rejected while an effective assignment exists. Duplicate code/serial values return `MACHINE_UNIT_IDENTITY_DUPLICATE`.

Resource resolution, workstation machine-group persistence, availability counts and readiness candidates require all of:

```text
active_flag = true
execution_status = Available
physical_identity_status = Identified
planning_resource_flag = true
```

This prevents anonymous quantity-generated rows from being assigned or reserved.

## MES Console changes

Machine detail now contains a Physical Machine Units panel showing unit code, serial/identity state, lifecycle, execution state, planning eligibility and current effective Work Center/Workstation assignment. It supports adding a physical unit and changing its active/lifecycle state through the new APIs.

Workstation Create is context-aware: it shows Machine Requirements and an initial-assignment explanation, but does not show a false Current Assigned Machines section. Workstation Edit/Detail shows requirements, effective assignments, readiness and assignment history. Requirements describe demand; assignments describe actual `md_resource_assignment` rows.

## Verification

The following checks passed:

- Migration applied successfully in the running MES Master Data database.
- `npm run typecheck --workspace=mes-master-data-service`.
- `npm run build` in `services/mes-console`.
- `git diff --check`.
- MES Master Data `/health` returned HTTP 200 with Kafka and Print Station connectivity.
- Machine list and physical-unit list returned HTTP 200.
- Creating an identified unit returned HTTP 201 with `Identified`, `Released`, and planning eligibility enabled.
- Updating the unit to Maintenance/Available recalculated planning eligibility correctly.
- Reusing the same serial returned HTTP 409 `MACHINE_UNIT_IDENTITY_DUPLICATE`.
- Unit detail returned assignment context and `assignment_history`.
- Existing anonymous units were returned as `PendingIdentification` with planning eligibility disabled; they were not counted as available planning units.
- MES Master Data and MES Console containers were rebuilt and healthy.

## Remaining limitations

- The Console currently adds one identified unit at a time. Bulk import is intentionally not part of the Machine workflow.
- Physical-unit deletion is available only for units with no assignment history and no Workstation requirement pin;
  the API rechecks dependencies transactionally and returns `MACHINE_UNIT_DELETE_DEPENDENCY_EXISTS` otherwise.
- Machine detail shows current assignment context from Master Data. Work Order allocation and current WO usage remain owned by MES Execution and are not duplicated in Master Data.
- Existing legacy units without serial numbers require an explicit identification decision before they can become planning resources.
- A pre-existing Schema Registry compatibility warning for an unrelated Item Revision event was observed during service startup; it does not prevent this service from becoming healthy.

## Physical Unit pagination and deletion update

The Physical Machine Units section remains a card layout, but now uses the shared `BaseCardGrid` component. The component encapsulates TanStack pagination and exposes no TanStack API to the feature screen. The default page size is 10, with the standard 10/50/100 options.

Deletion is intentionally stricter than deactivation:

- `GET /machines/:machineId/units` returns assignment/reference counts and `can_delete`.
- `DELETE /machine-units/:unitId` locks the unit and rechecks all references in a transaction.
- Any `md_resource_assignment` history or Workstation requirement pin blocks deletion with HTTP 409 `MACHINE_UNIT_DELETE_DEPENDENCY_EXISTS`.
- A unit with no assignment and no Workstation requirement reference can be physically removed.
- Deactivation remains the correct action for a unit with history because it preserves the identity and audit trail.

Runtime verification after rebuild:

- Assigned unit `EQ-MOLD-HYD01-01`: delete returned HTTP 409 with assignment and requirement counts.
- Unused unit `EQ-MOLD-HYD01-05`: delete returned HTTP 200 and the unit was removed.
- Master Data health returned HTTP 200 after Kafka reconnect.

## Follow-up: Machine Definition and Physical Machine completion

The canonical Machine Definition form now sends only shared definition data. It no longer sends aggregate
`serial_number` or physical `execution_status`. The compatibility `quantity` column is labeled **Expected unit
count** and is informational; the UI explains that actual physical quantity comes from `md_machine_unit`.
Machine catalog lifecycle is edited separately from physical unit execution state. Machine Definition list rows no
longer expose unconditional delete/deactivate actions; physical unit actions are available from Machine Detail.

The Machine list endpoint now returns one projection containing total, identified, pending-identity, available,
assigned, maintenance, out-of-service, and planning-eligible counts. Reserved count is returned as unavailable when
the authoritative reservation belongs to MES Execution, rather than being fabricated by Master Data.

Added the canonical verification command:

```text
npm run test:mes:machine-flow
```

It creates unique disposable fixtures, validates identity uniqueness, sibling isolation, maintenance readiness,
assignment conflict/history, pending identity, obsolete-definition non-cascade, dependency-aware deletion, and
cleans child-first. Script configuration and manual operation are documented in
`product-doc/VI-MES-SCRIPTS-NOTE.md`.

The verified run on 2026-07-31 completed 18/18 checks with 0 failures and 0 skips. The maintenance assignment
case correctly returned `MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE`, the current stable availability error for a
Maintenance unit; this is accepted by the test because the business assertion is that the unit cannot be assigned.

The Physical Machine Units panel supports single-unit registration only. After creation, the panel reloads the same
paginated card projection used for detail display.
