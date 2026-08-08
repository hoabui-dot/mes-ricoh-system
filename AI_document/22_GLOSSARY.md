# Master Glossary

## Technical Terms

ABAC: attribute-based access control using resource scope such as Site, Area, Work Center, Workstation.

ADR: architecture decision record explaining why a design choice exists.

Anti-corruption layer: mapping boundary that prevents one service model from leaking directly into another.

API Gateway: Kong route/auth/CORS boundary for external APIs.

Circuit breaker: dependency guard that opens after repeated failures and returns safe service errors.

Correlation ID: identifier used to trace a request/event flow across services.

DLQ: dead-letter queue. Current complete policy is unknown.

DTO: data transfer object used in API boundaries.

Effective dating: validity interval with `effective_from` / `effective_to`.

Idempotency: safe repeat behavior for the same logical request/event.

Outbox: database table storing events in the same transaction as business state.

Projection: local query/read model built from events.

Read model: service-owned copy of external facts for local decisions.

Schema Registry: Kafka schema registration service.

Snapshot: immutable copy of source data stored on a transaction such as Work Order.

## Manufacturing Terms

Backflush: automatic material consumption on operation confirmation.

Batch: production quantity processed as a group.

CAPA: corrective and preventive action.

EBOM: engineering bill of material owned by SAP; it is not currently stored or managed by MES.

Equipment: machine definition aggregate in MES master data.

Genealogy: relationship history between material/output labels.

Item: stable product/material identity.

Item Revision: effective engineering version of an Item.

Kiosk: shopfloor operator interface.

Lot: inventory/traceability batch identity.

Machine Group: grouped machine capacity.

Machine Unit: physical machine identity/asset.

MBOM: manufacturing bill of material.

NCR: nonconformance record.

Operation: reusable manufacturing step definition.

Phantom: MBOM component exploded into children without independent stocked output demand.

Production Standard: timing/capacity/labor standard for planning.

Production Version: released MES configuration combining MBOM and an independent Routing. Its output Item Revision is derived from MBOM, and Site is derived from Routing Work Centers.

Reservation: committed inventory or capacity.

Resource Allocation: runtime commitment of Workstation/resources to a WO operation.

Resource Assignment: effective master-data assignment of resources to Workstation/Work Center.

Routing: ordered manufacturing process.

Scrap: rejected/waste quantity.

Traceability: ability to identify material/output history.

UOM: unit of measure.

Work Center: logical routing and capacity location.

Work Order: production transaction to manufacture quantity.

Workstation: candidate execution location under a Work Center.
