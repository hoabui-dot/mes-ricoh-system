# Harmonize Operation, Routing Operation, and Production Standard Ownership

Source process: `process-expand/Harmonize-Operation-Catalog,-Routing-Operation,-and-Production-Standard-Ownership.md`.

## Ownership matrix

| Data | Authoritative owner | Routing behavior | Work Order behavior |
| --- | --- | --- | --- |
| Confirmation mode, quantity reporting, partial completion, material scan, output label, planning flag | Operation Catalog | Read-only inherited display | Used from the approved operation context |
| Default cycle/setup/base quantity, required persons, efficiency, yield | Operation Catalog | Preloaded engineering defaults | Not reread after planning is captured |
| Work Center, sequence, predecessor, scheduling mode, queue/move, overlap, transfer batch, milestone | Routing Operation | Editable routing structure | Snapshotted through the routing operation |
| Base quantity, setup, cycle, labor, efficiency, yield | Routing-scoped Production Standard | Edited in the Routing Operation editor | Used for duration calculation and copied to `wo_operation` |
| Routing-specific worker skill requirements | Routing Operation skill requirements | Operation defaults can be overridden | Used by execution labor matching |
| Approved planning values and calculation version | Work Order Operation snapshot | Immutable after creation/approval | Compute & Check uses snapshot columns only |

## Implementation

- Migration `0041_harmonize_operation_routing_standard_ownership` adds
  engineering defaults to `md_operation`, backfills them from existing
  standards where available, and allows a Production Standard to be scoped to
  a Routing Operation without an Item Revision.
- Routing operation replacement validates planning values and persists one
  current generic Production Standard with `source_method = 'Routing'`.
  Historical standards are ended before replacement. Operation Catalog rows
  are never updated by this flow.
- Routing release requires current operations and standards for schedulable
  operations, then releases both in the same transaction.
- Production Version readiness resolves an Item Revision-specific standard
  first, then falls back to the released Routing Operation standard.
- Migration `000013_harmonize_work_order_planning_snapshot` extends the
  execution read model and `wo_operation` with base quantity, yield, required
  workers, calculation version, and a JSON planning snapshot. Work Order
  creation selects the item-specific standard first and the Routing standard
  second. Compute & Check uses base quantity, yield, efficiency, setup, queue,
  and move values from the snapshot.
- Routing UI displays Operation execution behavior as read-only and exposes
  planning fields separately. Selecting an Operation preloads its engineering
  defaults; editing those fields only changes the Routing standard.

## Verification

- MES Master Data TypeScript build: passed.
- MES Console production build: passed.
- MES Execution `go test ./...`: passed.
- `npm run rebuild:mes`: passed; all MES images built and containers recreated.
- Master Data migration `0041_harmonize_operation_routing_standard_ownership`
  applied successfully.
- Execution migration `000013_harmonize_work_order_planning_snapshot` applied
  successfully.
- Master Data and Execution containers are healthy; in-container health
  endpoints returned `status: ok`.
- Database inspection confirmed the Operation default columns and Work Order
  snapshot columns exist. Existing standards remain compatible; new
  Routing-scoped standards are created when a Routing operation replacement is
  saved.
- Existing non-blocking Schema Registry compatibility 409 warnings remain in
  startup logs.

## Known boundary

The current Work Order API creates its operation snapshot at Work Order
creation, which is earlier than approval. Approved Work Orders remain
immutable, and approval does not reread Operation Catalog or Routing values.
Moving snapshot creation exclusively to approval would be a follow-up contract
change because current Compute & Check and allocation flows operate on created
operation rows.

## Planning field help UI follow-up

The new Operation Catalog engineering-default fields and Routing planning fields
use the shared `FieldHelpPopover` component. The trigger is the circular alert
(`CircleAlert`) icon, and the popover content is resolved through the MES
Console VI/EN/JA/KO translation catalog. Existing localized help text is reused
for cycle time, setup time, reference quantity, and worker requirements; the
general planning explanation is used for efficiency and yield.
