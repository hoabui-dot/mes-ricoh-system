# Phase 3 — Integrate Resource Planning into Work Order Allocation

## Role

Act as a senior MES domain architect, production planner, backend engineer, database engineer, frontend engineer, integration engineer, and QA engineer.

Phase 1 established the resource hierarchy and effective-dated Resource Assignments.

Phase 2 implemented Resource Capability, Resource Calendar, Equipment/Work Center Production Standard resolution, Operation Skill Requirements, duration calculation, and the non-persistent planning-readiness API.

Phase 3 must integrate these planning constraints into the Work Order lifecycle by implementing:

- Persistent resource allocation for each Work Order Operation
- Candidate recommendation and manual planner selection
- Resource allocation validation
- Capacity conflict detection
- Allocation snapshots
- Revalidation before Work Order release
- Controlled reallocation with audit history
- MES Console allocation UX
- Initial handoff fields required by future Kiosk execution

Do not implement a fully autonomous optimization scheduler, operator assignment, actual shop-floor confirmation, or OEE calculation in this phase.

Read and follow:

- Current `AI_CONTEXT.md`
- Product Documents III and IV
- Phase 1 and Phase 2 implementation reports
- Work Order execution schemas and lifecycle
- Resource readiness implementation
- Current migrations, APIs, tests, service manifests, Docker runtime, and MES Console source

Running source code and database migrations are the source of truth.

---

# 1. Phase Goal

After Phase 3, every schedulable Work Order Operation must be able to store a verified planned allocation:

```text
Work Order Operation
    → Work Center
    → Workstation
    → Equipment
    → Shift
    → Planned start/end
    → Resource Assignment snapshot
    → Capability snapshot
    → Production Standard snapshot
    → Calendar decision

The system must answer:

Which resource is planned to execute this operation?

Why was this resource considered eligible?

When will the operation run?

Which standard and capacity assumptions were used?

Is the allocation still valid before release?

Has another Work Order created a capacity conflict?

Who assigned or changed the resource, when, and why?
2. Preserve the Correct Domain Boundary

Routing continues to reference the logical default Work Center.

Do not update Routing Operations to point directly to physical Equipment.

The planning flow is:

Routing Operation
→ Default Work Center
→ Effective Resource Assignments
→ Eligible Workstation/Equipment candidates
→ Planner or planning service selects one
→ Selection is stored on the Work Order Operation

MD_RESOURCE_ASSIGNMENT remains the effective-dated relationship between Work Center, Workstation, and Equipment. Equipment cannot be treated as belonging permanently to a Work Center without the assignment record.

3. Audit the Current Work Order Execution Model

Before changing code, inspect:

Work Order header schema
Work Order operation schema
Work Order creation transaction
Routing snapshot behavior
Compute & Check use case
Approval/release use case
Work Order statuses
Existing planned start/end fields
Existing Work Center references
Current resource fields, if any
Approval logs and audit tables
Outbox events
Work Order detail API
Work Order Console create/detail pages
Existing realtime creation workflow
Kiosk job contracts
Current optimistic-locking/version fields
Cancellation and editing restrictions

Explicitly determine whether the Work Order operation currently stores:

work_center_id
workstation_id
equipment_id
shift_id
planned_start_at
planned_end_at

Do not create duplicate fields when partial equivalents already exist.

Classify each required behavior with the project evidence vocabulary.

4. Persistent Work Order Resource Allocation Model

Implement a dedicated allocation model rather than mixing all history into mutable Work Order Operation columns.

Recommended structure:

interface WorkOrderResourceAllocation {
  allocationId: string;

  workOrderId: string;
  workOrderOperationId: string;

  siteId: string;

  plannedWorkCenterId: string;
  plannedWorkstationId?: string;
  plannedEquipmentId?: string;
  plannedShiftId: string;

  plannedStartAt: string;
  plannedEndAt: string;

  source:
    | "PlannerSelected"
    | "SystemRecommended"
    | "ManualOverride"
    | "Reallocation";

  status:
    | "Draft"
    | "Validated"
    | "Committed"
    | "Superseded"
    | "Cancelled";

  validationStatus:
    | "Valid"
    | "ValidWithWarnings"
    | "Invalid"
    | "Stale";

  resourceAssignmentId?: string;
  resourceCapabilityId?: string;
  productionStandardId?: string;
  resourceCalendarId?: string;

  candidateRank?: number;
  recommendationScore?: number;

  setupTimeMin: number;
  runTimeMin: number;
  queueTimeMin: number;
  moveTimeMin: number;
  totalDurationMin: number;

  warningCodes: string[];
  validationSnapshot: ResourceAllocationValidationSnapshot;

  allocatedBy: string;
  allocatedAt: string;

  supersededByAllocationId?: string;
  changeReason?: string;

  rowVersion: number;
}

Adapt names to the existing execution-service conventions.

The allocation belongs to mes-execution-service, not the master-data service.

5. Snapshot Requirements

A Work Order must remain historically understandable even when master data changes later.

Store references plus a compact immutable planning snapshot.

Example:

{
  "assignment": {
    "id": "uuid",
    "role": "Primary",
    "effective_from": "2026-07-01T00:00:00Z",
    "effective_to": null
  },
  "capability": {
    "id": "uuid",
    "scope": "ProductRevisionEquipment",
    "priority_no": 1,
    "speed_factor": 0.95,
    "min_lot_size": 1,
    "max_lot_size": 1000
  },
  "calendar": {
    "level": "Equipment",
    "status": "Available",
    "available_minutes": 450,
    "capacity_factor": 0.9,
    "fallback_used": false
  },
  "standard": {
    "id": "uuid",
    "level": "Equipment",
    "base_quantity": 100,
    "setup_time_min": 20,
    "cycle_time_sec": 12,
    "efficiency_factor": 0.95
  },
  "calculation": {
    "setup_time_min": 20,
    "run_time_min": 106,
    "queue_time_min": 5,
    "move_time_min": 2,
    "total_duration_min": 133
  }
}

Do not copy entire master-data rows into execution.

Snapshot only the business facts needed for audit and historical interpretation.

6. Allocation Lifecycle

Use a controlled lifecycle:

Candidate generated
→ Draft allocation selected
→ Allocation validated
→ Allocation committed
→ Work Order released

When changed:

Committed allocation
→ Superseded
→ New allocation created

Do not overwrite committed allocation history.

Recommended rules:

Draft Work Order:
Allocation may be created, changed, or removed.
Pending Approval:
Changes require revalidation and appropriate permission.
Released:
Allocation is locked by default.
Reallocation requires an explicit command, reason, permission, and audit.
In Progress:
Reallocation is restricted.
Do not move an already-started operation silently.
Completed/Cancelled:
No new allocations.

Match the actual Work Order lifecycle from source code.

7. Candidate API Integration

Reuse the Phase 2 readiness engine rather than duplicating eligibility rules in mes-execution-service.

Because services own separate databases, use an explicit API contract.

Suggested master-data endpoint:

POST /api/mes/master-data/resource-planning/readiness

MES execution sends:

{
  "site_id": "uuid",
  "product_revision_id": "uuid",
  "routing_operation_id": "uuid",
  "work_center_id": "uuid",
  "quantity": 500,
  "planned_date": "2026-08-05",
  "shift_id": "uuid"
}

The execution service then persists the selected candidate and snapshot in its own database.

Preserve:

Circuit breaker
Bounded timeout
Stable dependency errors
Trace/correlation propagation
No cross-service database reads
8. Work Order Candidate Endpoint

Add a Work Order-oriented endpoint.

Suggested contract:

GET /api/mes/execution/work-orders/:woId/operations/:operationId/resource-candidates

Query parameters may include:

planned_start_at
shift_id

The endpoint should:

Read the Work Order and operation.
Validate lifecycle permissions.
Call the Phase 2 readiness API.
Enrich the response with current WO allocation state.
Detect provisional capacity conflicts in execution data.
Return deterministic candidates.

Example response:

{
  "operation": {
    "id": "uuid",
    "sequence": 40,
    "code": "OP-MOLD",
    "name": {
      "vi": "Ép dính và lưu hóa",
      "en": "Molding and Vulcanization"
    }
  },
  "requested_window": {
    "start_at": "2026-08-05T08:00:00+07:00",
    "shift_id": "uuid"
  },
  "current_allocation": null,
  "candidates": [
    {
      "rank": 1,
      "readiness": "Eligible",
      "workstation": {},
      "equipment": {},
      "shift": {},
      "planned_start_at": "2026-08-05T08:00:00+07:00",
      "planned_end_at": "2026-08-05T10:13:00+07:00",
      "total_duration_min": 133,
      "available_minutes": 450,
      "remaining_minutes_after_allocation": 317,
      "capacity_conflicts": [],
      "warnings": []
    }
  ],
  "blocking_errors": [],
  "warnings": []
}
9. Capacity Reservation Model

Implement persistent planning occupancy to detect collisions.

Recommended model:

interface ResourceCapacityReservation {
  reservationId: string;

  allocationId: string;
  workOrderId: string;
  workOrderOperationId: string;

  resourceType: "WorkCenter" | "Workstation" | "Equipment";
  resourceId: string;

  shiftId: string;
  startAt: string;
  endAt: string;

  capacityUnits: number;
  concurrentSlot?: number;

  status:
    | "Tentative"
    | "Committed"
    | "Released"
    | "Cancelled";

  createdAt: string;
  updatedAt: string;
}

At minimum reserve:

Equipment time when Equipment is selected.
Workstation concurrency.
Work Center concurrency/capacity where the model requires it.

Do not reserve Employee capacity in this phase.

10. Capacity Conflict Rules

Check:

Equipment cannot execute overlapping committed jobs unless explicitly modeled as multi-capacity.
Workstation concurrent jobs cannot exceed maxConcurrentJobs.
Work Center concurrent jobs cannot exceed maxConcurrentJobs.
Requested duration must fit within resolved available minutes.
Planned window must not cross PlannedDown or Holiday periods.
Operation predecessor timing must be respected.
Same WO operation cannot have two active committed allocations.
Cancelled or superseded reservations do not consume capacity.

Use database-safe concurrency controls.

Possible techniques:

PostgreSQL exclusion constraint for single-capacity Equipment time ranges
Serializable/locked validation transaction
Resource/day/shift advisory locks
Unique active-allocation constraints

Do not rely only on a pre-save availability query.

11. Finite Versus Infinite Scheduling Mode

Respect the Routing Operation and Work Center configuration.

For finite scheduling:

Capacity conflict blocks commitment.
Availability minutes must be sufficient.
Overlap must follow routing rules.

For infinite scheduling:

Candidate may be committed with capacity warnings.
Conflicts remain visible.
The system must not claim capacity is available.

Do not treat Infinite as “skip all resource validation.”

Assignment, capability, equipment status, and standards remain mandatory.

12. Predecessor and Operation Sequence Rules

Use Routing snapshot dependencies stored on WO Operations.

For a linear flow:

Operation 20 start
>=
Operation 10 planned end + move/queue rule

For multiple predecessors:

Operation start
>=
latest planned completion of all mandatory predecessors

When overlap is allowed:

Use transfer-batch rules.
Do not allow arbitrary overlap.
Document the calculation.

When predecessor allocations move, mark dependent allocations stale and require recalculation.

13. Allocation Commands

Implement explicit commands.

Create or select allocation
POST /api/mes/execution/work-orders/:woId/operations/:operationId/resource-allocation

Example:

{
  "workstation_id": "uuid",
  "equipment_id": "uuid",
  "shift_id": "uuid",
  "planned_start_at": "2026-08-05T08:00:00+07:00",
  "candidate_reference": "opaque-or-signed-reference",
  "row_version": 3
}

The server must revalidate all master-data and capacity facts.

Never trust the candidate response as final authorization.

Revalidate
POST /api/mes/execution/work-orders/:woId/resource-allocations/revalidate
Reallocate
POST /api/mes/execution/work-orders/:woId/operations/:operationId/reallocate

Requires:

new resource selection
change reason
expected row version
Remove Draft allocation
DELETE /api/mes/execution/work-orders/:woId/operations/:operationId/resource-allocation

Only where lifecycle permits.

14. Optimistic Concurrency and Idempotency

Every allocation mutation must support:

Idempotency key
Work Order/operation row version
Conflict detection
Safe retry
No duplicate reservations

Required behavior:

Same idempotency key and payload:
Return existing result.
Same key with conflicting payload:
Return 409.
Stale Work Order version:
Return a stable concurrency error.
Two planners choose the same machine/time:
One succeeds.
The other receives a conflict and updated candidates.

Suggested errors:

WO_ALLOCATION_VERSION_CONFLICT
RESOURCE_CAPACITY_CONFLICT
RESOURCE_CANDIDATE_STALE
RESOURCE_ASSIGNMENT_EXPIRED
RESOURCE_CAPABILITY_CHANGED
RESOURCE_CALENDAR_CHANGED
PRODUCTION_STANDARD_CHANGED
OPERATION_PREDECESSOR_CONFLICT
15. Revalidation Before Work Order Release

Work Order release must not trust old allocation results.

Before transitioning to Released:

Verify every schedulable WO Operation has a valid committed allocation.
Recheck Assignment effective range.
Recheck Capability.
Recheck Equipment master and execution state.
Recheck Calendar.
Recheck Production Standard.
Recheck capacity reservation.
Recheck predecessor timing.
Recheck mandatory skill requirement configuration.
Mark stale allocations and block release when necessary.

Use one consistent orchestration flow.

Do not partially release a Work Order with invalid resource allocations unless the domain explicitly supports partial release.

16. Calendar Fallback Policy

Phase 2 currently supports an advisory fallback when no explicit calendar record exists.

In Phase 3:

Return a visible warning such as:
RESOURCE_CALENDAR_FALLBACK_USED
Persist that fact in the allocation snapshot.
Do not present the fallback as confirmed machine availability.
Allow Site policy to define:
CalendarRequired
or
CalendarFallbackAllowed

When CalendarRequired = true, missing calendar blocks allocation/release.

Do not hard-code one policy for all Sites without documenting the decision.

17. Work Order Allocation UX

Add a dedicated Resource Planning section to Work Order detail.

Recommended desktop layout:

┌───────────────────────────────────────────────────────────────┐
│ Work Order WO-20260724-0008                                  │
│ Product · Quantity · Status · Planned period                 │
├───────────────────────────────────────────────────────────────┤
│ Operations timeline                                          │
│                                                               │
│ 10 Mixing             Allocated · EQ-MIX-01     08:00–09:10  │
│ 20 Metal Preparation  Needs allocation                        │
│ 30 Cutting            Warning · Calendar fallback             │
│ 40 Molding            Conflict · Equipment already occupied   │
└───────────────────────────────────────────────────────────────┘

Selecting an operation opens an allocation workspace.

18. Allocation Workspace Design

Recommended layout:

┌────────────────────────────┬──────────────────────────────────┐
│ Operation context          │ Resource candidates              │
│                            │                                  │
│ Operation                  │ Recommended                      │
│ Quantity                   │ ┌──────────────────────────────┐ │
│ Default Work Center        │ │ Workstation / Equipment      │ │
│ Predecessors               │ │ Time window                  │ │
│ Earliest possible start    │ │ Duration                     │ │
│ Current allocation         │ │ Capacity remaining           │ │
│                            │ │ Warnings                     │ │
│                            │ └──────────────────────────────┘ │
└────────────────────────────┴──────────────────────────────────┘

Each candidate card should show:

Rank and recommendation reason
Workstation name/code
Equipment name/code
Manufacturer/model
Assignment role
Capability priority and speed factor
Applied standard level
Shift
Planned start/end
Duration
Available and remaining capacity
Conflict status
Warnings
Select action

Do not show UUIDs.

19. Explain Recommendation, Do Not Hide It

For each recommended candidate, show a concise explanation:

Recommended because:

• Primary assignment
• Capability priority 1
• Equipment-specific production standard
• Available for the complete requested shift
• No overlapping committed Work Orders

For lower-ranked candidates:

Ranked lower because:

• Alternate assignment
• Capability priority 2
• Work Center standard fallback

Avoid a black-box “Best machine” label without reasons.

20. Resource Allocation Statuses in UI

Use clear statuses:

Not Allocated
Draft Selection
Validated
Committed
Warning
Conflict
Stale
Superseded
Cancelled

A warning is not the same as a conflict.

Examples:

Warning:
Calendar fallback
Work Center standard fallback
Infinite-capacity overlap
Conflict:
Equipment occupied
Assignment expired
PlannedDown
Capability denied

The backend owns severity.

21. Bulk Allocation Assistance

Provide a controlled action:

Recommend resources for all operations

This action may generate draft recommendations but must not silently commit them.

Required flow:

Generate recommendations
→ Display all proposed allocations
→ Highlight warnings/conflicts
→ Planner reviews
→ Planner commits

Do not call this an automatic scheduler.

It is a planning assistant using deterministic Phase 2 rules.

22. Reallocation UX

For a committed allocation, provide:

Reallocate resource

The dialog must show:

Current Workstation/Equipment
Current planned period
New candidate
Impact on dependent operations
Capacity effects
Mandatory change reason
Whether operation has already started
Whether material staging is linked to the Work Center

When Work Center changes:

Recheck WMS staging implications.
Do not silently keep material staging pointed to the old Work Center.
If automatic WMS adjustment is not implemented, block or create a documented follow-up task.
23. Events and Transactional Outbox

Meaningful allocation changes must use the execution-service transactional outbox.

Suggested events:

MES.Execution.WOResourceAllocated.v1
MES.Execution.WOResourceReallocated.v1
MES.Execution.WOResourceAllocationCancelled.v1
MES.Execution.WOResourceAllocationStale.v1

Only publish committed business changes, not every candidate query.

Example payload:

{
  "wo_id": "uuid",
  "wo_code": "WO-20260724-0008",
  "wo_operation_id": "uuid",
  "operation_code": "OP-MOLD",
  "work_center": {
    "id": "uuid",
    "code": "WC-MOLD"
  },
  "workstation": {
    "id": "uuid",
    "code": "WS-MOLD-01"
  },
  "equipment": {
    "id": "uuid",
    "code": "EQ-MOLD-01"
  },
  "shift_id": "uuid",
  "planned_start_at": "...",
  "planned_end_at": "...",
  "allocation_version": 1
}

Preserve schema compatibility and use stable business identity fields where consumers need them.

24. Kiosk Handoff Preparation

This phase should prepare, but not fully enforce, future Kiosk behavior.

Expose planned allocation fields in the Work Order operation API:

planned_work_center
planned_workstation
planned_equipment
planned_shift
planned_start/end
allocation status

Do not yet claim:

Operator is skill-validated
Actual machine is confirmed
Job is locked to the terminal
Equipment telemetry is connected

Those belong to Phase 4.

25. Security and Permissions

Define explicit permissions:

View resource candidates
Create Draft allocation
Commit allocation
Reallocate Released WO
Override warning
Override finite-capacity conflict

Recommended roles:

Planner:
View/select/commit before release.
Plant Manager:
Reallocate released operations and override approved warnings.
Executive:
Read-only unless existing policy says otherwise.
Operator:
No planning allocation mutation.

All mutations require authenticated user identity and audit metadata.

26. Audit Trail

Record:

Who selected the resource
Previous allocation
New allocation
Timestamp
Change reason
Candidate rank
Validation result
Warning overrides
Master-data references
Trace ID
Work Order row version

Do not depend only on application logs for business audit.

27. Required Use Cases
UC-01 — Allocate recommended Primary Equipment

Given an eligible Primary Equipment with available capacity:

Candidate is ranked first.
Planner selects it.
Allocation and capacity reservation commit atomically.
UC-02 — Select Alternate Equipment

Planner selects a lower-ranked Alternate resource.

Expected:

Selection is allowed when eligible.
Reason may be required according to policy.
Allocation records the selected candidate rank.
UC-03 — Equipment overlap conflict

Two WOs attempt to reserve the same single-capacity Equipment during overlapping periods.

Expected:

One succeeds.
One receives RESOURCE_CAPACITY_CONFLICT.
No double reservation remains.
UC-04 — Workstation concurrency

Workstation maxConcurrentJobs = 2.

Expected:

Two overlapping jobs may be committed.
The third is blocked.
UC-05 — Work Center finite-capacity conflict

Finite Work Center has insufficient available capacity.

Expected:

Commit is blocked.
UC-06 — Infinite scheduling warning

Infinite scheduling has overlapping demand.

Expected:

Allocation may commit.
Warning is persisted and visible.
The UI does not claim sufficient capacity.
UC-07 — Assignment expires before planned start

Expected:

Candidate becomes stale.
Commit or release is blocked.
UC-08 — Equipment enters Maintenance

A previously valid committed allocation points to Equipment now in Maintenance.

Expected:

Revalidation marks it stale/invalid.
Work Order release is blocked or reallocation is required.
UC-09 — Calendar changes to PlannedDown

Expected:

Allocation becomes stale.
Revalidation returns a blocking error.
UC-10 — Production Standard superseded

Expected:

Existing Draft allocation recalculates.
Committed historical snapshot remains auditable.
Release uses the currently valid policy and requires revalidation.
UC-11 — Predecessor timing

Operation 20 cannot start before Operation 10 completes.

Expected:

Invalid start time is rejected or corrected.
UC-12 — Parallel predecessors

Operation has multiple predecessors.

Expected:

Earliest start uses the latest required predecessor completion.
UC-13 — Allocation revalidation before release

All allocations remain valid.

Expected:

Release proceeds.
UC-14 — Missing operation allocation

A required operation has no committed allocation.

Expected:

Release is blocked with the exact operation identified.
UC-15 — Reallocate Draft WO

Expected:

Old Draft allocation is superseded.
New reservation replaces it.
History remains visible.
UC-16 — Reallocate Released WO

Expected:

Permission and change reason required.
Downstream effects are evaluated.
Audit event is emitted.
UC-17 — Duplicate commit request

Expected:

Same idempotency request returns the existing allocation.
No duplicate reservation.
UC-18 — Concurrent planners

Expected:

Stale row version is rejected.
UI refreshes current allocation/candidates.
UC-19 — Calendar fallback warning

Expected:

Candidate may be allocated only if Site policy permits.
Warning is stored in snapshot.
UC-20 — Cancel Work Order

Expected:

Future reservations are released/cancelled.
Historical allocations remain auditable.
28. Database Migrations

Create forward-only migrations.

Required items:

Work Order resource-allocation table
Capacity-reservation table
Allocation audit/history support
Snapshot JSONB or normalized snapshot fields
Idempotency record or integration with existing mechanism
Optimistic row-version fields
Indexes for:
Work Order operation
Equipment time window
Workstation time window
Work Center time window
Shift/date
Active allocation status
Exclusion/uniqueness constraints where appropriate

Preserve existing Work Orders.

Do not fabricate allocations for historical Work Orders.

Legacy Work Orders may show:

Resource allocation unavailable for historical record

unless authoritative historical data exists.

29. Automated Tests
Backend

Test:

Candidate retrieval
Allocation creation
Snapshot persistence
Capacity conflict
Concurrent commits
Idempotency
Workstation concurrency
Work Center concurrency
Finite/infinite rules
Assignment expiry
Equipment status change
Calendar change
Standard change
Predecessor timing
Revalidation
Release blocking
Reallocation
Cancellation
Outbox atomicity
Authorization
Optimistic concurrency
Frontend

Test:

Operation allocation status
Candidate cards
Recommendation explanation
Selection and commit
Warning/conflict display
Revalidation
Bulk recommendations
Reallocation dialog
Change-reason requirement
No UUID display
VI/EN/JA/KO
Keyboard navigation
Light/dark themes
Loading, empty, and dependency-error states
Integration

Run:

Create WO
→ Compute resource candidates
→ Select resource per operation
→ Commit reservations
→ Revalidate
→ Release WO
→ Change Equipment to Maintenance
→ Detect stale allocation
→ Reallocate
→ Revalidate successfully
30. Mandatory Console Test Script

Create:

scripts/test-mes-work-order-resource-allocation.mjs

The script must:

Check MES master-data and execution health.
Create isolated test data using a unique run ID.
Create or reuse valid Item/MBOM/Routing/Production Version fixtures.
Create Work Center, Workstation, Equipment, Assignment, Capability, Calendar, Standard, and Skill Requirement fixtures.
Create multiple Work Orders.
Query candidates.
Commit allocations.
Test conflicts and concurrency.
Test revalidation.
Test reallocation.
Test release blocking and success.
Print PASS, FAIL, or SKIPPED_WITH_DOCUMENTED_GAP.
Exit non-zero on failure.
Clean up mutable test data safely.
Preserve immutable audit/outbox evidence according to repository policy.
Refuse destructive cleanup outside an isolated development/test environment.

Unlike the shared-demo Phase 2 probe, Phase 3 should use an isolated test database or isolated fixture namespace so mutation scenarios are genuinely executed.

Do not report skipped mutation cases as complete verification.

31. Runtime Verification

After implementation:

Apply migrations.
Build master-data and execution services.
Build MES Console.
Run unit and integration tests.
Rebuild/recreate affected containers.
Verify health.
Create a test Work Order.
Query candidates.
Commit allocations.
Verify reservation rows.
Trigger a concurrency conflict.
Revalidate.
Release the Work Order.
Trigger stale allocation through maintenance/calendar change.
Reallocate.
Verify outbox events.
Run the full console script.
Perform browser review in VI and EN.
Verify no UUIDs are visible.
Inspect logs for duplicate reservations or transaction failures.
32. Required Implementation Report

Create:

implementation-fix/mes-work-order-resource-allocation-phase-3.md

Include:

Phase goal
Existing Work Order audit
New allocation model
Capacity reservation model
Snapshot strategy
Candidate API integration
Conflict rules
Finite/infinite behavior
Predecessor timing
Lifecycle permissions
Revalidation-before-release behavior
Reallocation behavior
WMS staging implications
API contracts
Events
Database migrations
UI design
Use-case results
Concurrency tests
Console script results
Cleanup results
Docker/runtime verification
Browser verification
Remaining Phase 4 dependencies

Clearly state that Phase 3 does not implement:

Automatic optimization across all Work Orders
Employee/operator assignment
Kiosk terminal enforcement
Actual Equipment confirmation
Actual start/finish resource recording
Telemetry/IoT integration
OEE calculation
Predictive maintenance
33. Acceptance Criteria

Phase 3 is complete only when:

Each schedulable WO Operation can persist a planned resource allocation.
Routing remains linked to Work Center, not directly to Equipment.
Candidates reuse Phase 2 readiness rules.
Planner can review and select a candidate.
Allocation stores Work Center, Workstation, Equipment, Shift, and planned time.
Allocation stores an immutable validation snapshot.
Equipment and Workstation capacity conflicts are transaction-safe.
Finite and infinite scheduling rules are distinguished.
Routing predecessor timing is enforced.
Allocation changes preserve history.
Reallocation requires audit and reason where appropriate.
Work Order release revalidates all allocations.
Missing, stale, or invalid allocations block release.
Duplicate requests cannot create duplicate allocations or reservations.
Concurrent planners receive deterministic conflicts.
Cancellation releases future capacity reservations.
Allocation events use the transactional outbox.
MES Console clearly explains recommendations, warnings, and conflicts.
No UUIDs appear in normal business UI.
Isolated mutation tests, builds, migrations, API probes, Docker runtime checks, and browser verification pass or are explicitly reported as gaps.