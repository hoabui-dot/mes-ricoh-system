Prompt — Audit and Define MES-to-WMS Domain Events and Transactional Outbox Integration

Version: 1.0Mode: Architecture audit, source inspection, event inventory, gap analysis, and implementation-ready reportingTarget system: S-Factory MES EnterpriseIntegration boundary: MES → WMSPrompt language: EnglishRequired report language: Vietnamese

1. Role

You are working inside the existing S-Factory MES enterprise repository.

Act as:

a Senior MES Solution Architect;

a Senior WMS Integration Architect;

a Senior Domain-Driven Design Engineer;

a Senior Event-Driven Architecture Engineer;

a Senior Kafka Engineer;

a Senior Backend Engineer;

a Senior Database and Transactional Outbox Engineer;

and an enterprise integration auditor.

Your task is to inspect the current MES implementation and produce one authoritative report describing all MES-owned data and business changes that must be synchronized or published to WMS through versioned Domain Events and a Transactional Outbox.

This is not a generic MES/WMS integration article.

The report must be grounded in:

current MES source code;

current MES database schema;

current lifecycle rules;

current outbox implementation;

current Kafka topics and consumers;

current canonical seed;

current Work Order flow;

current material and production-output behavior;

and the current documented WMS integration boundary.

Do not invent APIs, tables, events, data fields, ownership, or lifecycle behavior.

When current source does not yet implement a required capability, classify it as a gap and provide an implementation-ready recommendation.

2. Primary Business Problem

MES currently owns or creates production-related master data such as:

Items
Item Revisions
UOMs
Material Groups
Raw Materials
Semi-Finished Products
Finished Products
Packaging Materials
Production-related lifecycle and effectivity

WMS cannot reliably perform:

inventory receipt
putaway
reservation
picking
material issue
line staging
return
finished-goods receipt
semi-finished receipt
lot/serial tracking
inventory reconciliation

when WMS does not know the same business item identity, revision, UOM, inventory-control policy, and lifecycle.

The integration must therefore determine:

which data is owned by MES;

which data WMS must receive;

which data WMS must not copy;

which changes require Domain Events;

which events must be written through the Transactional Outbox;

which transactional MES/WMS flows require commands and response events;

how WMS bootstraps when deployed after MES;

how both systems detect and repair projection drift;

whether CDC is needed;

whether CDC should observe only the outbox table rather than MES business tables.

3. Audit-Only Rule

This task is a report and design task.

Do not modify:

MES source;

WMS source;

database migrations;

seed scripts;

Kafka configuration;

outbox records;

runtime data;

tests;

deployment files.

Read-only inspection and existing non-destructive tests are allowed.

Do not create implementation code during this task.

A separate implementation phase will use the approved report.

4. Required Output

Create exactly one canonical Vietnamese Markdown report:

AI_document/MES_TO_WMS_DOMAIN_EVENT_OUTBOX_INTEGRATION_REPORT.md

Create supporting machine-readable artifacts only under:

artifacts/mes-to-wms-domain-event-audit/<run-id>/

At minimum create:

source-inventory.json
data-ownership-matrix.json
mes-to-wms-data-classification.json
current-outbox-audit.json
current-kafka-topic-inventory.json
domain-event-catalog.json
event-payload-field-matrix.json
bootstrap-and-reconciliation-design.json
gap-register.json
implementation-roadmap.json
final-verdict.json

The Markdown report is the single human-readable source of truth.

5. Mandatory Source Inspection

Read current documentation, including when present:

AI_CONTEXT.md
UI_AI_CONTEXT.md
AI_document/REMEDIATION_MASTER_RULES.md
AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md
AI_document/MES_CONSOLE_REMEDIATION_FINAL_REPORT.md
AI_document/MES_CONSOLE_COMPLETE_UAT_AND_READY_TO_RUN_WO_CERTIFICATION.md
AI_document/MES_WO_AUTO_RESOURCE_ALLOCATION_TWO_LINE_PRINT_FLOW_FIX_REPORT.md
AI_document/Kiosk-Demo/**

Inspect the actual current repository paths for:

services/mes-master-data-service/**
services/mes-execution-service/**
services/mes-traceability-service/**
services/mes-kiosk-gateway-service/**
services/mes-console/**
services/wms*/**
scripts/**
migrations/**
e2e/**
package.json
docker-compose*.yml

Do not fail merely because example paths differ.

Search for the current implementation.

Inspect:

aggregate definitions;

database tables;

repositories;

services/use cases;

API handlers;

lifecycle enums;

revision/effectivity rules;

Work Order snapshots;

material requirement calculations;

material staging;

material consumption;

production output;

scrap and return behavior;

lot/serial/genealogy behavior;

Print Station output labels;

outbox tables;

outbox writers;

outbox publishers;

Kafka topic names;

event envelopes;

retry/dead-letter logic;

idempotency;

current consumers;

canonical seed;

integration and E2E tests.

Search source for:

outbox
domain event
integration event
Kafka
CDC
Debezium
item
item revision
UOM
material group
lot
serial
shelf life
packaging
barcode
material requirement
reservation
staging
issue
consumption
return
scrap
production output
finished goods
semi-finished
receipt
putaway
inventory
warehouse
Work Order

6. Architecture Principle to Validate

Evaluate the current architecture against this preferred pattern:

MES business transaction
→ MES business tables
+ MES outbox record in the same database transaction
→ outbox publisher or CDC on outbox table
→ Kafka versioned Domain Event
→ WMS idempotent consumer
→ WMS local projection or transactional workflow

Do not assume the preferred pattern is already implemented.

Determine the actual current implementation.

Explicitly compare it against:

CDC directly on MES business tables

The report must explain:

whether direct business-table CDC exists;

whether it is recommended;

whether Debezium or another CDC tool is needed;

whether CDC should observe only the outbox table;

whether an application outbox publisher is already sufficient;

the operational trade-offs of each option.

The report must not recommend cross-service database reads.

7. Data Ownership Matrix

Build a complete ownership matrix.

Required columns:

Data Object

Current MES aggregate/table

MES owner

WMS owner

Shared identity

WMS needs local copy

Direction

Synchronization type

Notes

At minimum classify:

Item
Item Revision
UOM
UOM Conversion
Material Group
Item Type
Raw Material
Semi-Finished Product
Finished Product
Packaging Material
Consumable
Lot-control policy
Serial-control policy
Shelf-life/expiry policy
Barcode/GTIN identity
Packaging specification
Label policy
Production Version
MBOM
Routing
Routing Operation
Work Order
Work Order Operation
Material Requirement
Material Reservation
Material Staging
Material Issue
Material Consumption
Material Return
Material Scrap
Production Output
Finished-Goods Expected Receipt
Semi-Finished Expected Receipt
Lot/Serial created by production
Quality/inspection status relevant to inventory
Print/label result relevant to warehouse receipt
Production Line
Work Center
Workstation
Machine Unit
Worker Skill
Employee
Warehouse
Zone
Bin
Putaway strategy
Picking strategy
Replenishment strategy
On-hand inventory
Inventory reservation
Inventory transaction

Classify every item as exactly one:

MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED
MES_AUTHORITATIVE_WMS_REFERENCE_OPTIONAL
WMS_AUTHORITATIVE
SHARED_WORKFLOW_NO_MASTER_COPY
NOT_REQUIRED_IN_WMS
DECISION_REQUIRED

8. Master Data Event Catalog

Identify every MES master-data change WMS must know.

For each event provide:

Event Name

Producer

Aggregate

Trigger

Lifecycle condition

WMS purpose

Required payload

Ordering key

Idempotency

Current status

At minimum assess the need for events equivalent to:

MES.MasterData.ItemCreated.v1
MES.MasterData.ItemUpdated.v1
MES.MasterData.ItemActivated.v1
MES.MasterData.ItemDeactivated.v1

MES.MasterData.ItemRevisionCreated.v1
MES.MasterData.ItemRevisionReleased.v1
MES.MasterData.ItemRevisionSuperseded.v1
MES.MasterData.ItemRevisionEffectivityChanged.v1

MES.MasterData.UomCreated.v1
MES.MasterData.UomUpdated.v1
MES.MasterData.UomConversionChanged.v1

MES.MasterData.MaterialGroupCreated.v1
MES.MasterData.MaterialGroupUpdated.v1

MES.MasterData.InventoryControlPolicyChanged.v1
MES.MasterData.PackagingSpecificationReleased.v1
MES.MasterData.BarcodeIdentityChanged.v1
MES.MasterData.LabelPolicyChanged.v1

Use actual naming conventions.

Do not require all example events when current domain does not support the concept.

Determine whether WMS should consume:

Draft
Released
Active
Inactive
Superseded
Effective
Expired

state changes.

The report must state which lifecycle states are safe for WMS operational use.

9. Required Master Data Payload

For every WMS-relevant Item/Revision event, evaluate these fields:

item_id
item_code
item_name
localized_names
item_type
revision_id
revision_code
lifecycle
effective_from
effective_to
base_uom_id
base_uom_code
allowed_uoms
uom_conversions
material_group_id
material_group_code
inventory_managed
lot_controlled
serial_controlled
expiry_controlled
shelf_life_days
quality_status_required
barcode_identifiers
packaging_specification
label_policy
site_scope
source_system
aggregate_version

Classify every field:

REQUIRED
OPTIONAL
WMS_OWNED_DO_NOT_PUBLISH
NOT_IMPLEMENTED
DECISION_REQUIRED

Do not put warehouse-specific rules such as bin assignment or putaway strategy into MES-owned master events unless current ownership explicitly says MES owns them.

10. Production Definition Data Boundary

Determine which production-definition data WMS actually needs.

Evaluate:

MBOM
Routing
Routing Operations
Production Version
Line Eligibility
Production Line
Work Center
Workstation
Machine requirements
Production Standard
Worker Skills

For each object state whether WMS needs:

full projection
small reference projection
event-derived requirement only
no copy

The report must avoid copying MES internal production topology into WMS without a warehouse use case.

A likely boundary to validate is:

WMS does not need full Routing or resource-planning topology.
WMS needs material requirements, target staging context, expected output, and warehouse-relevant identity.

Mark this as an inference unless current source confirms it.

11. Work Order and Material Workflow Events

Identify every MES-to-WMS production transaction or integration event.

At minimum evaluate events or commands equivalent to:

MES.Execution.WorkOrderReleased.v1
MES.Execution.WorkOrderChanged.v1
MES.Execution.WorkOrderCancelled.v1

MES.Execution.MaterialRequirementPublished.v1
MES.Execution.MaterialRequirementChanged.v1
MES.Execution.MaterialReservationRequested.v1
MES.Execution.MaterialReservationCancelled.v1

MES.Execution.MaterialStagingRequested.v1
MES.Execution.MaterialIssueRequested.v1
MES.Execution.MaterialConsumed.v1
MES.Execution.MaterialConsumptionReversed.v1
MES.Execution.MaterialReturnRequested.v1
MES.Execution.MaterialScrapped.v1

MES.Execution.ProductionOutputDeclared.v1
MES.Execution.FinishedGoodsReceiptRequested.v1
MES.Execution.SemiFinishedReceiptRequested.v1
MES.Execution.ProductionOutputReversed.v1

MES.Traceability.ProductionLotCreated.v1
MES.Traceability.SerialsCreated.v1
MES.Traceability.GenealogyUpdated.v1

For every event determine:

command or event;

producer;

consumer;

source of truth;

trigger;

lifecycle;

payload;

idempotency;

response/acknowledgement;

compensation/reversal;

retry behavior;

current implementation status.

Do not classify a request as a completed business fact.

For example:

MaterialReservationRequested

is not equivalent to:

MaterialReservationConfirmed

12. WMS-to-MES Response Events

Although the primary report is MES → WMS, identify all required WMS responses so the integration is complete.

At minimum evaluate:

WMS.MasterData.ItemProjectionApplied.v1
WMS.Inventory.MaterialReservationConfirmed.v1
WMS.Inventory.MaterialReservationRejected.v1
WMS.Inventory.MaterialIssuedToProduction.v1
WMS.Inventory.MaterialStaged.v1
WMS.Inventory.MaterialReturned.v1
WMS.Inventory.FinishedGoodsReceived.v1
WMS.Inventory.SemiFinishedGoodsReceived.v1
WMS.Inventory.ReceiptRejected.v1
WMS.Inventory.InventoryAdjustmentConfirmed.v1

For each response define how MES uses it:

update material readiness;

unblock approval;

unblock execution;

update staged quantity;

reconcile consumption;

close expected receipt;

display WMS error;

move Work Order to material hold.

Do not design only one-way fire-and-forget integration.

13. Raw Material, Semi-Finished, and Finished-Goods Rules

Define synchronization behavior for each item category.

13.1 Raw Material

State what WMS needs before:

reservation;

picking;

staging;

issue;

return;

scrap.

13.2 Semi-Finished Product

Classify semi-finished items into:

warehouse-managed
direct line-to-line WIP
hybrid

Define when a semi-finished Item/Revision must exist in WMS.

13.3 Finished Product

Define the gate requiring WMS Item/Revision projection before:

expected receipt;

label/lot registration;

finished-goods receipt;

putaway.

WMS must not silently create unknown items from a receipt request unless explicitly approved.

13.4 Packaging and Consumables

Determine whether WMS manages inventory for:

labels;

cartons;

pallets;

wrapping;

consumables.

Classify event requirements accordingly.

14. Event Envelope Standard

Audit the current Kafka event envelope.

Define the required standard fields:

event_id
event_type
event_version
occurred_at
published_at
producer
aggregate_type
aggregate_id
aggregate_version
correlation_id
causation_id
trace_id
site_id
site_code
schema_version
payload
metadata

Determine:

partition key;

ordering guarantee;

duplicate handling;

replay behavior;

compatibility policy;

timestamp format;

UUID/business-code usage;

sensitive-data restrictions.

Use existing conventions where present.

15. Transactional Outbox Design

Audit the current outbox implementation.

Document:

outbox table;

producer service;

transaction boundary;

serialization;

publisher;

polling or CDC;

publish status;

retry;

lock/claim strategy;

error state;

retention;

replay;

cleanup;

monitoring.

Required outbox fields to evaluate:

id
event_id
aggregate_type
aggregate_id
aggregate_version
event_type
event_version
payload
headers
occurred_at
available_at
published_at
status
attempt_count
last_error
correlation_id
causation_id
trace_id
partition_key

Determine whether current outbox guarantees:

business state committed
iff
event is durably recorded for eventual publication

Identify dual-write risks.

16. Kafka Topic Design

Inventory current topics.

Propose or validate topic boundaries such as:

mes.master-data.item-events.v1
mes.master-data.reference-events.v1
mes.execution.work-order-events.v1
mes.execution.material-events.v1
mes.execution.production-output-events.v1
mes.traceability.lot-serial-events.v1

Do not create unnecessary one-topic-per-event complexity without operational justification.

For each topic document:

producer;

consumers;

partition key;

ordering scope;

retention;

compaction;

schema strategy;

replay strategy;

dead-letter topic;

expected throughput;

data sensitivity.

Determine whether master-data topics should use log compaction.

17. CDC Decision

Create a dedicated decision section comparing:

Option A — Application Outbox Publisher

application writes outbox
→ application worker publishes Kafka

Option B — CDC on Outbox

application writes outbox
→ Debezium reads outbox
→ Kafka

Option C — CDC on Business Tables

Debezium reads Item/Revision/business tables directly

Evaluate:

business semantics;

coupling;

schema changes;

transaction safety;

operational complexity;

replay;

ordering;

observability;

failure recovery;

current infrastructure compatibility.

The report must choose:

RECOMMENDED
ACCEPTABLE
NOT_RECOMMENDED

for each option.

Direct business-table CDC must not be recommended without a documented legacy constraint.

18. WMS Local Projection Design

Define the WMS local projection required for MES-owned shared master data.

Possible projections to evaluate:

wms_item_projection
wms_item_revision_projection
wms_uom_projection
wms_uom_conversion_projection
wms_material_group_projection
wms_packaging_projection
wms_mes_sync_state
wms_consumed_event

For every projection document:

source event;

primary/shared identity;

version;

lifecycle;

effectivity;

WMS extension fields;

update rule;

idempotency;

stale-event handling;

deletion/deactivation behavior.

WMS must remain authoritative for:

warehouse
zone
bin
putaway
picking
replenishment
on-hand
warehouse reservation
inventory ledger

19. Bootstrap and Snapshot Strategy

Kafka events alone are not enough when WMS is introduced after MES already contains data.

Define a bootstrap process:

1. Read a consistent MES snapshot.
2. Import released/effective WMS-relevant master data.
3. Record snapshot watermark/version.
4. Start or resume Kafka consumption from the correct offset.
5. Apply events after the watermark.
6. Verify reconciliation.

Determine whether the current MES needs read-only snapshot APIs such as:

GET /integration/wms/items
GET /integration/wms/item-revisions
GET /integration/wms/uoms
GET /integration/wms/material-groups

Use actual API conventions.

Define pagination, effectivity filters, site scope, watermark, and authentication.

20. Reconciliation and Drift Detection

Define scheduled reconciliation between MES and WMS.

Required checks:

missing item
missing revision
revision mismatch
lifecycle mismatch
effectivity mismatch
UOM mismatch
inventory-control-policy mismatch
barcode mismatch
packaging mismatch
stale aggregate version
unknown WMS projection

Define:

reconciliation frequency;

report;

auto-repair versus manual approval;

replay;

alerting;

audit;

ownership of corrections.

Do not use reconciliation as a replacement for event delivery.

21. Synchronization Readiness Gates

Define when MES may safely initiate WMS-dependent workflows.

At minimum evaluate gates before:

material reservation
material staging
material issue
finished-goods expected receipt
semi-finished expected receipt
Work Order release
Work Order execution start
Work Order completion

Possible readiness states:

WMS_MASTER_SYNC_READY
WMS_MASTER_SYNC_PENDING
WMS_MASTER_SYNC_FAILED
WMS_ITEM_NOT_FOUND
WMS_REVISION_NOT_SYNCHRONIZED
WMS_UOM_NOT_SUPPORTED

Determine whether Work Order creation should be blocked, warned, or allowed when WMS projection is incomplete.

Do not introduce synchronous coupling without justification.

22. Error Handling and Recovery

Define behavior for:

Kafka unavailable;

outbox publisher unavailable;

WMS consumer unavailable;

malformed event;

unsupported event version;

duplicate event;

stale aggregate version;

out-of-order event;

WMS validation rejection;

unknown Item/Revision;

retry exhaustion;

dead-letter;

replay;

compensating/reversal event;

prolonged synchronization delay.

Define operator-visible diagnostics in MES Console where appropriate.

23. Security and Data Governance

Audit and define:

service authentication;

Kafka ACL;

topic authorization;

payload encryption requirements;

PII exclusion;

audit fields;

site scope;

traceability;

schema registry access;

secret management;

retention;

deletion/deactivation policy.

Do not send employee or unrelated production-resource data to WMS unless there is a supported warehouse use case.

24. Observability

Define required metrics:

outbox pending count
outbox oldest age
publish success/failure
event throughput
consumer lag
WMS projection apply success/failure
duplicate count
stale-event count
dead-letter count
reconciliation mismatch count
master-data sync latency
workflow rejection due to sync

Define logs, traces, dashboards, and alerts.

Use correlation and trace IDs across MES, Kafka, and WMS.

25. Testing Strategy

The report must define an implementation test matrix.

25.1 Outbox tests

business transaction and outbox atomicity;

rollback produces no outbox event;

retry;

duplicate publish;

publisher restart;

poison event;

retention.

25.2 Master-data integration

Item creation;

Item update;

Revision release;

deactivation;

effectivity;

UOM conversion;

lot/serial policy;

packaging/barcode;

duplicate event;

out-of-order event;

bootstrap;

reconciliation.

25.3 Material workflow

requirement publication;

reservation request/confirm/reject;

staging;

issue;

consumption;

reversal;

return;

scrap.

25.4 Production output

finished-goods expected receipt;

semi-finished expected receipt;

lot/serial;

receipt confirm/reject;

output reversal;

duplicate receipt prevention.

25.5 Failure and recovery

Kafka outage;

WMS outage;

consumer lag;

DLQ;

replay;

projection rebuild;

no cross-service database access.

26. Required Event Priority

Classify events into:

P0 — Required before MES/WMS operational integration
P1 — Required for complete production material flow
P2 — Required for advanced traceability or warehouse optimization
P3 — Optional/future

Create:

Priority

Event/Capability

Business blocker

Producer

Consumer

Current status

Required implementation

P0 should include only truly blocking capabilities.

27. Implementation Roadmap

Create phased implementation recommendations.

Validate a structure similar to:

Phase 0 — Ownership and event-contract approval
Phase 1 — Outbox hardening and event envelope
Phase 2 — Item/Revision/UOM master synchronization
Phase 3 — Bootstrap and reconciliation
Phase 4 — Work Order material-requirement integration
Phase 5 — Reservation, staging, and issue workflow
Phase 6 — Consumption, return, and scrap
Phase 7 — Finished/semi-finished receipt workflow
Phase 8 — Lot/serial and traceability integration
Phase 9 — Observability, DLQ, replay, security
Phase 10 — Full E2E certification

For each phase define:

scope;

service owner;

API/events;

migrations;

seed;

tests;

entry gate;

completion gate;

risks.

Do not implement the roadmap in this audit task.

28. Required Report Structure

Create:

AI_document/MES_TO_WMS_DOMAIN_EVENT_OUTBOX_INTEGRATION_REPORT.md

Required Vietnamese sections:

1. Tóm tắt điều hành
2. Phạm vi và nguyên tắc audit
3. Nguồn đã kiểm tra
4. Kiến trúc MES hiện tại
5. Kiến trúc Outbox/Kafka hiện tại
6. Vấn đề nghiệp vụ khi WMS không nhận master data
7. Ma trận quyền sở hữu dữ liệu
8. Phân loại dữ liệu cần đồng bộ
9. Event catalog cho master data
10. Payload chuẩn Item/Revision/UOM
11. Ranh giới Product Definition
12. Event catalog cho Work Order và vật tư
13. Event catalog cho sản lượng và nhập kho
14. Event phản hồi từ WMS về MES
15. Nguyên vật liệu, bán thành phẩm và thành phẩm
16. Chuẩn event envelope
17. Thiết kế Transactional Outbox
18. Thiết kế Kafka topic
19. Quyết định CDC
20. WMS local projection
21. Bootstrap và snapshot
22. Reconciliation và drift detection
23. Synchronization readiness gates
24. Error handling, DLQ và replay
25. Security và data governance
26. Observability
27. Test strategy
28. Event priority P0–P3
29. Gap register
30. Lộ trình triển khai
31. Rủi ro và quyết định cần phê duyệt
32. Kết luận cuối

29. Required Gap Register

Every missing capability must include:

Gap ID

Domain

Current behavior

Required behavior

Severity

MES service

WMS impact

Migration/API/Event required

Test required

Do not write vague gaps such as:

Need WMS synchronization
Need more Kafka events
Outbox should be improved

Use exact actionable findings.

30. Required Final Questions

The report must answer explicitly:

Which system is authoritative for Item, Revision, and UOM?

Which Item categories must be synchronized to WMS?

When must semi-finished products be synchronized?

Which MES master data must not be copied into WMS?

Which master-data events are P0?

Which Work Order/material events are P0?

Which events are commands versus facts?

What acknowledgements must WMS send back?

Does the current outbox guarantee transaction safety?

Is direct business-table CDC used?

Should CDC be introduced?

Should CDC monitor only the outbox table?

How will WMS bootstrap existing MES master data?

How will MES and WMS detect drift?

What happens when WMS has not synchronized an Item Revision?

Should Work Order creation, release, or execution be blocked?

What is the recommended implementation order?

What decisions still require product approval?

Is the architecture ready for implementation?

31. Final Verdict

End the report with exactly one:

MES_TO_WMS_EVENT_OUTBOX_BLUEPRINT_READY_FOR_IMPLEMENTATION

or:

MES_TO_WMS_EVENT_OUTBOX_BLUEPRINT_BLOCKED

Use BLOCKED when source evidence is insufficient to define safe contracts.

32. Final Response

After creating the report, respond with:

report path;

run ID;

MES-owned objects discovered;

WMS-relevant objects;

proposed Domain Event count;

current implemented event count;

missing P0 event count;

current outbox verdict;

CDC recommendation;

bootstrap recommendation;

reconciliation recommendation;

highest-severity gaps;

implementation roadmap phase count;

exact final verdict.

Do not implement the integration during this task.