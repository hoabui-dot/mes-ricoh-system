# Business Glossary

Each term lists owner, related modules, entities, and APIs where the implementation evidence is known.

## Work Order

Definition: production transaction instructing the factory to produce a quantity of a released Production Version.
Owner: `mes-execution-service`.
Modules: MES Console, Execution, Kiosk, WMS, Traceability, Print.
Entities: `wo_header`, `wo_operation`, `wo_material_requirement`, `wo_approval_log`.
APIs: `/api/mes/execution/work-orders`, `/compute-check`, `/approve`, `/reject`, `/start-execution`.

## Routing

Definition: ordered manufacturing process for an output item revision.
Owner: `mes-master-data-service`.
Modules: MES Console, Execution read model, Resource Planning.
Entities: `md_routing_header`, `md_routing_operation`, `rm_routing_header`, `rm_routing_operation`.
APIs: `/api/mes/master-data/routing-headers`, `/routing-headers/:id/operations`.

## Production Version

Definition: authoritative released combination of Item Revision, MBOM, Routing, and optional EBOM baseline used to create a Work Order.
Owner: `mes-master-data-service`.
Modules: MES Console, Execution.
Entities: `md_production_version`, `rm_production_version`.
APIs: `/api/mes/master-data/production-versions`, `/production-versions/:id/validate`.

## MBOM

Definition: manufacturing bill of material: component quantities, issue operation, scrap, backflush, phantom, optional flags, substitutes.
Owner: `mes-master-data-service`.
Modules: MES Console, Execution material snapshot, WMS integration.
Entities: `md_mbom_header`, `md_mbom_line`, `md_component_substitute`, `rm_mbom_header`, `rm_mbom_line`, `wo_material_requirement`.
APIs: `/mbom-headers`, `/mbom-headers/:id/lines/replace`, `/mbom-lines/:lineId/substitutes`.

## EBOM

Definition: engineering bill of material baseline. It does not drive material explosion, staging, execution, backflush, substitutes, or WO readiness.
Owner: `mes-master-data-service`.
Modules: MES Console product engineering.
Entities: `md_ebom_header`, `md_ebom_line`.
APIs: `/api/mes/master-data/ebom-headers` through generic master-data routes.

## Genealogy

Definition: trace from one label/material identity to related source or output labels.
Owner: `mes-traceability-service`.
Modules: Traceability, Execution.
Entities: `genealogy_event`, `label_instance`.
APIs: `/api/mes/traceability/labels/{id}/genealogy`.

## Traceability

Definition: QR/lot/serial policy and runtime records proving material/output identity history.
Owner: `mes-traceability-service`.
Modules: Traceability, Execution, Kiosk, Print.
Entities: `md_traceability_policy`, `md_qr_split_rule`, `md_numbering_rule`, `md_label_template`, `label_instance`.
APIs: `/policies/resolve`, `/labels/issue`, `/labels/split`, `/labels/consume`.

## Resource Assignment

Definition: effective-dated relationship assigning Equipment, Machine Group, or Machine Unit to a Workstation/Work Center context.
Owner: `mes-master-data-service`.
Modules: Resource master data, readiness, Resource Planning.
Entities: `md_resource_assignment`.
APIs: `/api/mes/master-data/resource-assignments`, `/resource-assignments/:id/end`, `/resource-assignments/:id/move`.

## Machine Unit

Definition: physical machine identity with asset code, optional serial, lifecycle, execution status, and planning eligibility.
Owner: `mes-master-data-service`.
Modules: Equipment management, readiness, allocation.
Entities: `md_machine_unit`.
APIs: `/api/mes/master-data/machines`, machine availability/readiness endpoints.

## Machine Group

Definition: grouped physical machine capacity used by workstation requirements and allocation.
Owner: `mes-master-data-service`; runtime allocation snapshots in `mes-execution-service`.
Entities: `md_machine_group`, `wo_resource_allocation`, `wo_capacity_reservation`.
APIs: resource foundation and allocation endpoints.

## Work Center

Definition: logical production capability location selected by Routing Operation.
Owner: `mes-master-data-service`.
Entities: `md_work_center`, `rm_work_center`.
APIs: `/work-centers`, `/work-centers/:id/headcount`.

## Workstation

Definition: candidate execution location under a Work Center. Resource Planning chooses it for a WO operation.
Owner: `mes-master-data-service`; committed runtime snapshot owner is `mes-execution-service`.
Entities: `md_workstation`, `md_resource_assignment`, `wo_resource_allocation`.
APIs: `/workstations`, `/workstations/:id`, `/resource-candidates`.

## Backflush

Definition: automatic material consumption at operation confirmation based on MBOM lines and operation mapping.
Owner: `mes-execution-service`.
Entities: `wo_material_requirement`, `material_consumption`.
APIs: operation confirm endpoint.
Status: implemented for current execution scope where code paths configure consumption; verify operation-specific rules before changes.

## Scrap

Definition: rejected or waste quantity recorded during execution or MBOM planning.
Owner: MBOM scrap in master data; execution scrap in MES execution; quality defects in QMS.
Entities: `md_mbom_line.scrap_rate`, operation confirmations, QMS defect/NCR entities.

## Rework

Definition: corrective production path after defect/nonconformance.
Owner: QMS/MES product decision.
Status: future work / requires product decision unless a specific source route proves implementation.

## NCR

Definition: nonconformance record raised for quality failures.
Owner: `qms-nonconformance-service`.
Entities: QMS nonconformance PostgreSQL tables from `infra/postgres/qms-nonconformance-init.sql`.
APIs: QMS nonconformance routes; QMS Console NCR screens.

## CAPA

Definition: corrective and preventive action linked to nonconformance.
Owner: `qms-nonconformance-service`.
Modules: QMS Console.
Entities: CAPA tables in QMS nonconformance DB.

## Lot

Definition: batch identity used for stock and traceability.
Owner: WMS for inventory lots; traceability service for label/QR identities.
Status: implemented in WMS/traceability scope, but inspect WMS service source before changing allocation logic.

## Batch

Definition: manufacturing grouping of quantity processed together.
Owner: MES execution and traceability depending on context.
Status: partly implemented through WO quantities, label quantities, and print batch policy.

## Reservation

Definition: commitment of capacity or inventory to a future/current need.
Owner: MES execution for capacity reservations; WMS for inventory reservations.
Entities: `wo_capacity_reservation`; WMS reservation tables.
APIs: resource allocation endpoints; WMS outbound APIs/events.
