# Bounded Context Canvas: QMS Nonconformance Service

Date: 2026-07-23
Status: Accepted for Phase 3 Step 2

## Responsibility

Own Nonconformance Reports (NCR), disposition decisions, and Corrective and Preventive Action (CAPA)
case management. It turns inspection failures or manually reported defects into auditable quality cases.

## Not My Responsibility

- Inspection plans, characteristics, or inspection result evaluation. Those belong to
  `qms-inspection-service`.
- MES/WMS database ownership or direct database reads.
- Automatic material hold/release decisions. Those are Phase 4 integration outcomes.
- QMS Console presentation.

## Owns

- `qms_ncr_numbering_rule` and `qms_ncr_numbering_sequence`.
- `qms_ncr` and immutable disposition history.
- `qms_capa` and `qms_capa_ncr_link`.

## Consumes

- `QMS.Inspection.InspectionFailed.v1`.

The event payload is the finalized Step 1 contract: `result_id`, `work_order_id`, `work_center_id`,
`item_revision_id`, `site_id`, `lot_or_label_ref`, `failed_quantity`, `failed_characteristics`, and
`defect_category`. The producer derives the worst linked category (`Critical` > `Major` > `Minor`), so
automatic NCR severity follows the defect evidence. For legacy events without a category, the consumer
deliberately defaults to `Major` as a conservative policy because under-severity is more hazardous than
over-severity and the quality review can reduce an over-classification.

## Publishes

- `QMS.Nonconformance.NCRRaised.v1`
- `QMS.Nonconformance.NCRDispositioned.v1`
- `QMS.Nonconformance.CAPAClosed.v1`

These payloads include identifiers and MES/WMS-relevant item, work-order, work-center, lot/label, and
disposition/CAPA status context so Phase 4 consumers do not need a synchronous callback.

## Ubiquitous Language

- **NCR:** a quality case describing a nonconforming product or process.
- **Disposition:** the authorized decision for affected material: use-as-is, rework, scrap, or return.
- **CAPA:** corrective/preventive work linked to one or more NCRs.
- **Active disposition:** the latest non-superseded decision; prior decisions remain audit history.
- **Verification:** an authorized review that confirms CAPA effectiveness before closure.

## Numbering and Idempotency

Human-readable NCR/CAPA codes use an atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING current_value`
sequence increment, matching MES traceability's numbering mechanism. Sequences are scoped by site, entity,
and UTC date. Inspection failure consumption locks on `hashtext(source_event_id)` and enforces a unique
source event constraint, so Kafka redelivery creates exactly one NCR.
