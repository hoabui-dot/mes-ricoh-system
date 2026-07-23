# Bounded Context Canvas: QMS Inspection Service

Date: 2026-07-23
Status: Accepted for Phase 3 Step 1

## Responsibility

Own inspection plans, defect-code master data, inspection characteristics, and inspection results. The
service determines whether a recorded inspection passes or fails and publishes the result for downstream
quality workflows.

## Not My Responsibility

- MES work-order or operation lifecycle.
- MES/WMS database ownership or direct database reads.
- NCR, disposition, CAPA, or material hold decisions. Those belong to
  `qms-nonconformance-service` in Phase 3 Step 2 and cross-cluster integration in Phase 4.
- Frontend presentation. QMS Console is Phase 3 Step 3.

## Owns

- `qms_defect_code`
- `qms_inspection_plan`
- `qms_inspection_characteristic`
- `qms_inspection_result`
- `qms_inspection_result_detail`
- Local reference projections for MES item revisions, operations, sites, and UOMs.

## Consumes

- `MES.MasterData.ItemRevisionReleased.v2`
- `MES.MasterData.RoutingReleased.v1` (for trace context)
- `MES.Execution.OperationFinished.v1`

The operation catalog is validated through the explicit MES master-data API with an `opossum` circuit
breaker. The local projections are retained for event correlation and future read-only UI use; QMS never
queries a MES database.

## Publishes

- `QMS.Inspection.InspectionPlanReleased.v1`
- `QMS.Inspection.InspectionResultRecorded.v1`
- `QMS.Inspection.InspectionFailed.v1`

`InspectionFailed.v1` is the Step 2 contract. Its payload contains `result_id`, `work_order_id`,
`work_center_id`, `item_revision_id`, `site_id`, `lot_or_label_ref`, `failed_quantity`,
`defect_category`, and a `failed_characteristics` array with characteristic and defect identifiers,
localized names, measured values, and comments. `defect_category` is the worst category across linked
failed defect codes (`Critical` > `Major` > `Minor`).

## Ubiquitous Language

- **Inspection Plan:** versioned instructions defining what an inspection checks.
- **Characteristic:** one measurable or pass/fail line in a plan.
- **Variable:** numeric characteristic evaluated against optional min/max/target values.
- **Attribute:** pass/fail characteristic.
- **Draft Result:** an inspection task created from a completed inspection operation and not yet finalized.
- **Finalized Result:** a server-evaluated result with immutable pass/fail outcome.
- **Missing Plan:** a completed inspection operation for which no effective released plan exists.

## Idempotency and Compatibility

`MES.Execution.OperationFinished.v1.event_id` is unique in `qms_inspection_result.source_event_id`.
Redelivery returns the existing draft and does not create another result. The result event payload is
versioned and intentionally contains all context needed by Step 2, avoiding a synchronous callback.
