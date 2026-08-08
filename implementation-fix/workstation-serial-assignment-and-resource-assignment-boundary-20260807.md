# Workstation Serial Assignment and Resource Assignment Boundary

## Decision

`md_equipment` remains the equipment definition or equipment family. `md_machine_unit` remains one physical machine and owns the unique serial. A Workstation is the authoring boundary for selecting physical units.

The Workstation form now manages a table of equipment requirements. Each row selects an equipment definition, role, requirement type, and exact available machine-unit serials. The payload uses `pinned_machine_unit_ids`, so a workstation can contain three units of one equipment definition and two units of another definition in the same machine group.

The Master Data API already performs the required transaction and validation: the unit must be identified, active, planning-eligible and Available; it must belong to the selected equipment; and a Primary unit cannot overlap another Workstation assignment. Existing assignments are ended and replaced atomically when a Workstation configuration is updated.

## Production Line and Work Order Impact

`md_resource_assignment` is retained as a generated/runtime projection. Production Line resource scope, line readiness, resource proposal, capacity checks and Work Order allocation consume this table and the pinned unit requirements. Removing the table or API would break those flows. The standalone Console CRUD page was therefore removed from the sidebar and old URLs redirect to Workstations; the backend endpoints remain for projections, history, compatibility and Production Line scope reads.

## Seed and Cleanup

The canonical reset command remains:

```bash
npm run reset:seed:verify:mes:canonical
```

The seed now creates each Work Center shift set before employee schedules and stores material-group names as localized JSON objects. The run on 2026-08-07 passed reset, seed and read-only verification, including zero assignment overlaps, zero resource-scope orphans and zero labor candidate gaps.

## Verification Boundary

The UI allows only serials returned by the Workstation availability load. The backend remains authoritative because availability can change between form load and save. A stale serial selection must be rejected by the transaction rather than silently reassigned.
