# Operation to Routing to Workstation Authority Audit

## Audit result

The previous authoring model had three overlapping relationships: `md_routing_operation.work_center_id`, `md_work_center_composition`, and active rows in `md_workstation_operation_capability`. The Routing UI selected a Work Center indirectly through the capability endpoint, while Workstation CRUD edited capabilities separately. Execution already expected `workstation_id` in its routing read model and Work Order snapshots, so the direct field was missing only from master-data ownership.

## Implemented

- Added nullable `md_routing_operation.workstation_id` with an index and foreign key in migrations `0059_routing_operation_authoritative_workstation` and controlled backfill `0060_backfill_released_routing_workstations`.
- Routing replacement validates the selected Workstation is active/effective, belongs to the selected Work Center, and matches its Site. Stable errors include `ROUTING_OPERATION_WORKSTATION_REQUIRED`, `ROUTING_OPERATION_WORKSTATION_NOT_FOUND`, `ROUTING_OPERATION_WORKSTATION_WORK_CENTER_MISMATCH`, and `ROUTING_OPERATION_WORKSTATION_SITE_MISMATCH`.
- Routing replacement and Routing release event payloads now persist/expose the direct Workstation.
- MES Console Routing create/edit forms select Workstation after Work Center and clear it when Work Center changes. Routing Operation editor now uses the same direct field.
- Workstation create/edit no longer sends or saves Supported Operations/capabilities. Workstation detail no longer returns active capability rows to the form. The legacy capability API/table remains available as a compatibility/deprecation surface for historical data and existing dependency audits; it is no longer the authoring source.
- Existing operation-to-Work Center endpoint no longer filters Work Centers by capability. Work Center Composition remains for hierarchy compatibility, does not validate against the deprecated capability table, and is not used to resolve a Routing Operation's execution Workstation.
- The complete MES WO seed now sends `workstation_id` in every Routing Operation payload.

## Downstream compatibility

Execution already consumed `workstation_id` from the Routing event/read model and snapshots it into `wo_operation`; the master-data event now supplies the authoritative value. Runtime resource allocation and Print Station binding remain separate: Routing chooses the default Workstation, while planning chooses actual equipment/machine allocation.

## Verification

- `npm --prefix services/mes-master-data-service run build`: passed.
- `npm --prefix services/mes-console run build`: passed before the final runtime rebuild; Docker build also passed after the Routing form changes.
- MES master-data container rebuilt and healthy. Migration `0059` and `0060` applied successfully.
- Database audit after migration: 18 Routing Operations, 18 direct Workstation assignments, 0 Released Routing Operations missing an assignment.
- `npm run test:mes:operation-flow` passed after the refactor. It verifies direct active Workstation assignments, inactive-operation rejection, Work Center hierarchy compatibility without a capability row, detail/dependency responses, and cleanup. Because the existing dependency-aware Operation API preserves audit history, its disposable Operation is ended as Inactive when physical deletion is rejected.

## Remaining limitation

The legacy capability table/API is retained for historical compatibility and has not been physically dropped. No new Workstation CRUD path writes it. A later cleanup can archive/drop it only after all external consumers and historical reporting have been migrated.
