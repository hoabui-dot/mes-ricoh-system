# Audit and Complete the MES-to-WMS Material Request Flow

## Role

Act as a senior MES/WMS domain architect, backend engineer, integration engineer, database engineer, and QA engineer.

The expected business rule is:

> When a Work Order reaches the lifecycle state that makes it ready for execution, MES must create and publish the required material demand to WMS so warehouse staff can allocate and stage materials for the Work Order and its Work Centers.

The current WMS Console indicates that this flow is not fully handled or that the expected endpoint/consumer is unavailable.

Audit the complete MES-to-WMS flow from source code, database, APIs, events, runtime configuration, and UI. Fix the root cause and verify the integration end to end.

Do not add a frontend-only workaround.

---

## 1. First Determine the Correct Lifecycle Trigger

Do not assume the trigger is `WOCreated`.

Inspect the current Work Order lifecycle and determine exactly which state means:

```text
Ready for material preparation and execution

Possible current states include:

Draft
Approved
InProgress
Completed
Cancelled

Verify whether the correct trigger is:

Work Order approval
A separate Released/Ready state
Completion of Compute & Check
An explicit material-staging action
Another existing lifecycle transition

The expected domain behavior is normally:

Draft WO
→ Compute and readiness checks
→ Approved / Ready for execution
→ Material request sent to WMS
→ WMS allocation and staging
→ Production execution

If Approved is currently the executable-ready state, use that explicitly.

If the lifecycle lacks a clear Ready or Released state, document the gap and choose the smallest safe design consistent with the existing source.

Do not publish material requests when the Work Order is still Draft unless the current business contract explicitly requires early planning demand.

2. Audit the Existing Flow

Inspect at least:

MES execution
Work Order creation use case
Compute & Check use case
Approval/release use case
Work Order status transitions
Approval transaction
Material requirements generated from MBOM
Work Center assignment on WO operations/material requirements
WMS outbound HTTP client
POST /work-orders/:id/stage-materials
Circuit breaker and timeout handling
Outbox writer and relay
Existing MES execution events
Idempotency behavior
Approval log
Retry behavior
Service manifest
Kong route configuration
Environment variables and Compose wiring
WMS outbound
POST /api/wms/outbound/material-requests
Request handler
Request schema
Database tables and migrations
Material request status lifecycle
Allocation logic
FEFO behavior
Staging-first behavior
Shortage response
Duplicate-request protection
Inventory-service client
Circuit breaker
Outbox events
Any Kafka consumers
WMS Console request list/detail API
WMS Console
/outbound/requests
Create dialog
List query
Detail view
Status mappings
API base URL
Authentication
Empty/error states
Any text claiming that the endpoint is unsupported

The current architecture already distinguishes synchronous MES-to-WMS calls from asynchronous outbox events, and material staging is currently described as a separate WMS outbound call rather than an atomic part of approval. Verify the actual implementation before changing that boundary.

3. Define the Canonical Business Flow

Implement and document one canonical flow.

Recommended target:

1. Planner creates Draft Work Order.
2. MES explodes MBOM into WO material requirements.
3. MES snapshots Routing into WO operations.
4. Planner runs Compute & Check.
5. Planner approves the Work Order.
6. MES transitions the WO to Approved/Ready.
7. MES records the lifecycle event in its transactional outbox.
8. A reliable integration action creates the WMS material request.
9. WMS stores one request per logical material demand.
10. WMS checks staging stock first.
11. WMS allocates remaining stock from Storage using FEFO.
12. WMS returns Ready, Partial, or Shortage status.
13. MES stores WMS request and staging status on its local material requirements.
14. WMS Console displays the generated request.
15. Operators may start execution only according to the defined material-readiness rule.

Clearly separate:

WO lifecycle transition
Event publication
WMS request creation
Inventory allocation
Physical picking
Transfer to staging
Production consumption

Do not treat all of these as one status.

4. Decide Between Event-Driven and Synchronous Integration

The request says MES should publish an event when the WO becomes ready.

Inspect whether WMS currently has a consumer for a suitable event.

Possible event:

MES.Execution.WOApproved.v1

or a more explicit event:

MES.Execution.WOReadyForMaterialStaging.v1

Use an existing event only if its payload and semantics are sufficient.

Preferred architecture

MES approval transaction:

Update WO status
+ Insert approval log
+ Insert outbox event
= one MES transaction

Then:

MES outbox
→ Kafka
→ WMS outbound consumer
→ Create material request idempotently

This avoids making Work Order approval depend directly on WMS availability.

Alternative

Keep the existing explicit synchronous staging endpoint when the current architecture intentionally requires planner-controlled staging:

POST /work-orders/:id/stage-materials

In this design:

Approval only marks WO ready.
The UI or a background integration action triggers staging.
Retries are explicit and safe.
Required decision

Do not accidentally support two independent automatic creation paths that produce duplicate WMS requests.

Choose and document one canonical owner for automatic request creation:

WMS Kafka consumer, or
MES synchronous WMS client, or
An explicit staging command

Other entry points may reuse the same idempotent application service but must not create duplicate records.

5. Event Contract

When using an event, define a versioned contract.

Example:

{
  "event_id": "uuid",
  "event_type": "MES.Execution.WOReadyForMaterialStaging.v1",
  "occurred_at": "2026-07-23T11:45:00Z",
  "source_service": "mes-execution-service",
  "trace_id": "uuid",
  "correlation_id": "uuid",
  "payload": {
    "wo_id": "uuid",
    "wo_code": "WO-20260723-0001",
    "site_id": "uuid",
    "site_code": "SITE-KZ3",
    "item_revision_id": "uuid",
    "item_code": "FG-WS-CM01-R1",
    "planned_quantity": 500,
    "uom_id": "uuid",
    "uom_code": "PCS",
    "planned_start_at": "2026-07-24T01:00:00Z",
    "planned_end_at": "2026-08-01T10:00:00Z",
    "material_requirements": [
      {
        "wo_material_requirement_id": "uuid",
        "item_revision_id": "uuid",
        "item_code": "RM-STL-05-R1",
        "required_qty": 505,
        "uom_id": "uuid",
        "uom_code": "PCS",
        "issue_operation_id": "uuid",
        "operation_code": "OP-PREP",
        "work_center_id": "uuid",
        "work_center_code": "WC-PREP-01",
        "backflush": false,
        "optional": false
      }
    ]
  }
}

Use the actual repository envelope and naming conventions.

Do not include only IDs when WMS requires stable business display data.

Do not copy fields that WMS can resolve from its own read models unless doing so is required for historical snapshot integrity.

6. WMS Material Request Model

Verify or implement a clear WMS material request structure.

At minimum:

Request ID
Request code
Source system
Source event ID
Work Order ID
Work Order code
Site
Work Center
Required-by date
Status
Created time
Updated time
Request lines

Each line should include:

Source MES material-requirement ID
Item Revision ID
Item business code
Required quantity
UOM
Allocated quantity
Staged quantity
Shortage quantity
Allocation strategy
Issue operation
Work Center
Status

Recommended request statuses:

Requested
CheckingStock
PartiallyAllocated
Allocated
Picking
Staged
Shortage
Cancelled
Completed
Failed

Use only states supported by the actual domain implementation.

Do not create UI-only database states.

7. Idempotency

The WMS consumer or endpoint must be idempotent.

A repeated event or HTTP request must return the same logical material request.

Use a stable uniqueness key such as:

source_event_id

and/or:

wo_id + work_center_id + item_revision_id + required_qty + operation

The repository already documents an advisory-lock/idempotency approach for staging requests. Preserve or improve it rather than introducing a competing mechanism.

Required behavior:

Same event delivered twice:
One WMS request only.
Same Work Order approved twice:
No duplicate material request.
Retry after HTTP timeout:
Return existing result.
Same idempotency key with conflicting payload:
Return conflict and log the discrepancy.
Consumer restart:
Reprocessing remains safe.
8. Material Grouping Rules

Determine whether WMS requests are grouped:

Per Work Order
Per Work Center
Per operation
Per material
Per warehouse
Per required date

The current UI describes material requests for a WO/Work Center.

Define the grouping rule explicitly.

Recommended:

One request header per WO + Work Center
One line per WO material requirement

This makes staging destination and operational ownership clear.

However, use the current implementation if it has a verified different rule.

Handle materials used at different Work Centers separately.

Do not combine incompatible staging destinations into one request.

9. Core Use Cases

Implement and test all of the following.

UC-01 — Successful approval and request creation

Given:

WO is Draft
Readiness passes
Material requirements exist
WMS is available
Sufficient stock exists

When:

Planner approves the WO

Then:

WO becomes Approved/Ready
MES emits the expected outbox event
WMS creates the material request
WMS lines match MES requirements
Allocation succeeds
WMS Console shows the request
MES displays linked WMS status
UC-02 — Multiple materials

A WO contains several MBOM requirements.

Expected:

Every required non-optional material is included
Quantities include scaling and scrap rules
Correct UOM is preserved
Each line is linked to its issue operation and Work Center
No material line is silently omitted
UC-03 — Multiple Work Centers

A WO has material demands for different Work Centers.

Expected:

Requests are grouped according to the canonical grouping rule
Each request uses the correct staging destination
No material is staged to the wrong Work Center
UC-04 — Existing staging stock

Some stock already exists at the target Work Center staging location.

Expected:

WMS uses eligible staging stock first
Only the remaining demand is allocated from Storage
No unnecessary duplicate transfer occurs
UC-05 — FEFO allocation

Multiple eligible lots exist.

Expected:

Earliest-expiring valid lot is selected first
Expired stock is excluded
Quarantined or blocked stock is excluded
Lot allocation remains auditable
UC-06 — Full shortage

No sufficient stock exists.

Expected:

WMS creates or updates the request according to the domain rule
Status becomes Shortage
Shortage detail includes item and missing quantity
MES does not report staging as successful
Approval behavior follows the selected architecture:
Async architecture: WO may remain Approved, with material shortage shown separately
Blocking synchronous architecture: approval/staging result must clearly reflect the business conflict

Do not confuse shortage with service failure.

UC-07 — Partial stock

Some, but not all, quantity exists.

Expected:

Allocated, staged, and shortage quantities are preserved separately
Request status is PartiallyAllocated or the verified equivalent
No quantity arithmetic is lost
UC-08 — Duplicate event delivery

Deliver the same event twice.

Expected:

One request header
One set of request lines
No double stock transfer
Consumer acknowledges the duplicate safely
UC-09 — Duplicate approval request

Submit approval twice or retry after a timeout.

Expected:

Work Order lifecycle remains valid
One approval transition according to the lifecycle rules
One logical WMS request
No duplicate event side effect
UC-10 — WMS unavailable

Stop or isolate WMS outbound.

Expected for event-driven architecture:

MES approval commits
Event stays retryable in outbox/broker
WMS processes it after recovery
No event is lost

Expected for synchronous architecture:

Circuit breaker and bounded timeout apply
MES returns a retryable dependency error
No false success
Retry does not duplicate the request

The existing cross-service client uses circuit-breaker behavior and preserves shortage as a business result. Do not regress it.

UC-11 — Inventory service unavailable

WMS receives a request but cannot query or transfer inventory.

Expected:

Material request remains in a recoverable state
No false staged status
No partial transfer is hidden
Retry is idempotent
Circuit-breaker behavior is preserved
UC-12 — Invalid item mapping

WMS does not know the MES Item Revision or UOM mapping.

Expected:

Request is rejected or moved to an explicit integration-error state
Stable error code
Human-readable remediation
No stock mutation
Event is not endlessly poison-retried without observability
UC-13 — Invalid Work Center mapping

The MES Work Center has no valid WMS staging location.

Expected:

Request cannot be staged
Clear mapping error
No fallback to an arbitrary warehouse/location
No stock transfer
UC-14 — Optional material

An MBOM line is optional.

Verify the intended rule:

Include it as optional demand, or
Exclude until explicitly selected

Do not treat an optional line as mandatory shortage without domain evidence.

UC-15 — Backflush material

Backflush materials may still need physical availability/staging.

Verify whether they should be included in WMS demand.

Do not confuse consumption mode with procurement/staging requirement.

UC-16 — Phantom component

Phantom components must follow the exploded material structure.

Expected:

WMS receives actual required child/raw material demand
It does not stage a non-stock phantom header unless that item is genuinely stocked
UC-17 — Cancelled WO before staging

When a ready WO is cancelled before stock transfer:

WMS request is cancelled or marked no longer required
Allocations are released where supported
No future automatic staging occurs

Define whether this uses an event such as:

MES.Execution.WOCancelled.v1
UC-18 — Cancelled WO after staging

When materials are already staged:

Do not silently delete stock movements
Use an explicit return/reversal workflow if supported
Preserve immutable inventory ledger history
If return flow is not implemented, record it as a gap
UC-19 — WO quantity or configuration change

Released/Approved Work Orders should not silently mutate material demand.

Determine whether the system:

Forbids edits
Creates a new revision
Cancels and recreates the WO
Emits a material-request adjustment event

Do not update WMS demand without an explicit auditable contract.

UC-20 — Out-of-order events

WMS receives cancellation before creation, or receives an older update after a newer state.

Expected:

Event version/timestamp/state guard prevents regression
Consumer does not create an active request for a cancelled WO
Processing remains observable
UC-21 — Concurrent consumers

Two WMS consumer instances process the same Work Order.

Expected:

Database uniqueness/advisory locking prevents duplicates
One logical request remains
UC-22 — Security

Verify:

Only trusted MES service identity can create automatic WMS requests
A normal browser cannot impersonate MES
Wrong-client tokens are rejected
User-facing manual create endpoint has appropriate WMS role checks
Internal automatic integration does not depend on spoofable browser headers
10. Error Contract

Use stable error codes.

Examples:

WMS_MATERIAL_SHORTAGE
WMS_ITEM_MAPPING_NOT_FOUND
WMS_UOM_MAPPING_NOT_FOUND
WMS_STAGING_LOCATION_NOT_FOUND
WMS_INVENTORY_UNAVAILABLE
WMS_DUPLICATE_PAYLOAD_CONFLICT
WMS_INVALID_WORK_ORDER_STATE
MES_WMS_EVENT_PUBLISH_FAILED

Return:

Stable code
Human-readable message
Retryable boolean
Correlation/trace reference
Shortage details where applicable

Do not expose raw database errors to the UI.

11. MES and WMS UI Expectations
MES Console

Work Order detail should show:

Material request status
WMS request code
Requested
Allocated
Staged
Shortage
Last synchronization time
Retry action, when safe

Do not show WMS completion unless confirmed.

WMS Console

/outbound/requests must display automatically generated MES requests.

Show:

WMS request code
WO code
Work Center
Required-by date
Material line count
Allocation status
Staging status
Shortage status
Source: MES
Created time
Actions

The create dialog may remain for legitimate manual requests, but automatic MES requests must not require manual re-entry.

12. Persistence and Reconciliation

Add or verify a reconciliation mechanism.

The system must be able to answer:

Which Approved WOs have no WMS material request?
Which WMS requests refer to missing or cancelled WOs?
Which events failed permanently?
Which requests are stuck in checking/allocation?
Which MES material requirements disagree with WMS request lines?

At minimum, provide an admin/script reconciliation query.

Do not make cross-service database reads in application code. Reconciliation should use explicit APIs, events, or an offline operational script with clearly documented access.

13. Observability

Add structured logs and traces with:

trace_id
correlation_id
event_id
wo_id
wo_code
wms_request_id
wms_request_code
work_center_id
item_revision_id
status
retry_count
error_code

Metrics should include:

mes_wms_material_request_events_total
wms_material_requests_created_total
wms_material_request_duplicates_total
wms_material_request_shortages_total
wms_material_request_failures_total
wms_material_request_processing_duration
wms_material_request_retries_total

Add dead-letter or failed-message visibility if the existing Kafka infrastructure supports it.

14. Automated Tests

Add focused unit, repository, contract, integration, and concurrency tests.

Required test areas:

Lifecycle trigger
Event payload
Outbox transaction
Consumer idempotency
Request grouping
Quantity arithmetic
FEFO
Staging-first allocation
Shortage
Partial allocation
Expiry exclusion
Invalid mappings
Cancellation
Retry
Circuit breaker
Duplicate delivery
Concurrent processing
Authorization
UI API compatibility

Do not rely only on the final console test script.

15. Mandatory End-to-End Console Test Script

After build and runtime deployment succeed, create one console-executable test script that exercises all applicable use cases end to end.

Suggested location:

scripts/test-mes-wms-material-request-flow.sh

or, if richer assertions are needed:

scripts/test-mes-wms-material-request-flow.ts

The script must:

Check required containers and health endpoints.
Acquire appropriate test tokens or use approved internal service authentication.
Record a unique test-run ID.
Create or reuse isolated test master data.
Create test inventory lots with controlled quantities and expiry dates.
Create Draft Work Orders.
Trigger readiness/approval.
Wait for event processing with bounded polling.
Query MES and WMS APIs.
Assert database-visible/API-visible outcomes.
Exercise each use case independently.
Print PASS/FAIL per case.
Print a final summary.
Exit non-zero when any assertion fails.
Preserve logs and identifiers long enough for diagnosis.
Clean up test data only after assertions and report capture complete.

Use unique codes such as:

E2E-MES-WMS-<timestamp>-<case>

Do not depend on fixed production/demo IDs when avoidable.

16. Required Test Cases in the Script

At minimum include executable cases for:

01 successful full allocation
02 multiple materials
03 multiple Work Centers
04 existing staging stock
05 FEFO
06 full shortage
07 partial shortage
08 duplicate event
09 duplicate approval/retry
10 WMS unavailable and recovery
11 inventory unavailable and recovery
12 missing item/UOM mapping
13 missing staging location
14 optional material rule
15 backflush material rule
16 phantom explosion
17 cancellation before staging
18 concurrent duplicate processing
19 authorization rejection
20 reconciliation check

If a case is not currently implementable, the script must mark it:

SKIPPED_WITH_DOCUMENTED_GAP

and link it to the implementation/gap report.

Do not silently omit cases.

17. Test Data Cleanup

After the full test suite completes, remove all data created by the script.

Cleanup must be safe and scoped to the unique test-run ID.

Delete or reverse only test-created data.

Never use broad statements such as:

DELETE FROM material_request;

Required cleanup order should respect foreign keys and immutable-ledger rules.

For mutable test entities:

Request lines
Request headers
Test Work Orders and dependent test rows
Test master-data fixtures
Test mapping rows

For immutable inventory ledger data:

Do not delete ledger rows if the domain forbids deletion.
Create compensating/reversal movements when supported.
Mark test data with the run ID.
If physical deletion is allowed only in isolated development databases, gate it behind an explicit environment check.

The script must refuse cleanup when:

Environment is not clearly development/test
Database host/name is not allow-listed
The test-run marker is missing

Suggested safety guard:

ALLOW_E2E_DATA_CLEANUP=true
APP_ENV=development|test

After cleanup, verify:

No active test WOs remain
No active test material requests remain
No test stock balance remains
No accidental non-test record was modified

Print the cleanup result.

18. Build and Runtime Verification

Run at minimum:

MES execution unit/integration tests
WMS outbound tests
WMS inventory tests
Shared contract tests
Frontend builds where UI contracts changed
Docker Compose configuration validation
Rebuild/recreate affected services
Database migrations
Health checks
Kafka consumer-group check
Outbox relay check
Circuit-breaker failure injection
End-to-end console script

Inspect logs for:

Duplicate creation
Consumer crashes
Infinite retry loops
Schema Registry incompatibility
Failed authorization
Quantity mismatch
Unhandled poison messages
19. Required Implementation Report

Create:

implementation-fix/mes-wms-work-order-material-request-integration.md

Include:

Original issue
Verified current behavior
Correct lifecycle trigger
Architecture decision
Sequence diagram
MES files changed
WMS files changed
Database migrations
API changes
Event schemas and compatibility
Idempotency strategy
Grouping strategy
Status mapping
Every use case and result
Edge cases
Security verification
Failure-injection results
Console test script
Cleanup behavior
Commands and outputs
Remaining gaps
Evidence status for every major claim

If the current code does not support the requested event flow safely, create a gap report rather than claiming success.

20. Acceptance Criteria

The task is complete only when:

The exact executable-ready Work Order transition is identified.
That transition reliably initiates the WMS material-demand flow.
MES and WMS use one canonical integration path.
The lifecycle event is written through the MES transactional outbox.
WMS processes the request idempotently.
Duplicate events cannot create duplicate requests or stock transfers.
Material quantities match MES WO requirements.
Requests are mapped to the correct Work Centers.
Staging stock is used before Storage stock.
FEFO, expiry, quarantine, and shortage rules are preserved.
WMS unavailability does not cause false success or lost demand.
WMS Console displays automatically generated MES requests.
MES shows accurate WMS request/staging status.
Cancellation and retry behavior are documented and tested.
Security prevents unauthorized request creation.
Automated backend tests pass.
The end-to-end console script runs every supported use case.
Each case reports PASS, FAIL, or documented SKIP.
Test data is safely cleaned after verification.
The implementation report records the exact evidence and remaining limitations.