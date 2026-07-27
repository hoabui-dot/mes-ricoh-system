# Audit and Repair Work Order Compute & Check, Resource Proposal, and Complete MES Seed Data

## Background

The current Work Order flow contains two suspicious behaviours:

1. **Compute & Check appears to return nearly identical results for every Work Order**, and capacity status is always shown as `Ready`.
2. The Resource Proposal feature fails with:

```text
mes-master-data-service retryable dependency failure:
readiness failed: 500 Internal Server Error
```

The Resource Proposal workflow depends on several master-data and planning domains:

```text
Factory / Site
→ Shopfloor
→ Work Center
→ Workstation
→ Machine / Equipment
→ Resource Assignment
→ Resource Capability
→ Shift
→ Resource Calendar
→ Production Standard
→ Worker / Employee
→ Worker Skills
```

The project already contains a destructive reset-and-seed command:

```bash
npm run reset:seed:mes:wo
```

This command must be expanded so that it resets and seeds a complete, internally consistent MES dataset capable of passing:

- Work Order creation;
- snapshot creation;
- Compute & Check;
- resource candidate proposal;
- resource allocation readiness;
- approval;
- execution.

This task must audit both backend and frontend.

If any required feature is broken, incomplete, stubbed, or cannot be verified, create a Markdown report and stop the task without applying speculative workarounds.

---

# Primary Objectives

Perform a complete evidence-based audit of:

1. Work Order `Compute & Check`.
2. Resource Proposal and readiness APIs.
3. Shift management.
4. Resource Calendar management.
5. Resource Capability management.
6. Resource Assignment.
7. Production Standard resolution.
8. Work Center, Workstation, Machine, Shopfloor, and Factory hierarchy.
9. Worker, skill, shift, and calendar availability.
10. Frontend behaviour for all relevant screens.
11. The existing `reset:seed:mes:wo` command.

The final seeded dataset must produce at least one Work Order whose operations return real, different, explainable Compute & Check results and valid Resource Proposal candidates.

---

# Mandatory Stop-on-Failure Policy

This task must not hide failures or bypass business logic.

If any required feature is:

- missing;
- stubbed;
- returning hard-coded data;
- consistently returning synthetic defaults;
- throwing an unexplained HTTP 500;
- incompatible with the current database schema;
- missing frontend support;
- missing required API support;
- unable to pass runtime verification;

then:

1. create a detailed Markdown report;
2. include evidence;
3. classify the failure;
4. stop further mutation or seeding;
5. wait for the next instruction.

Suggested report path:

```text
implementation-fix/mes-wo-resource-planning-audit-blocker.md
```

Do not continue to seed around a broken implementation.

Do not create fake `Ready` results.

Do not bypass resource readiness in this task.

---

# Phase 1 — Audit the Current Compute & Check Flow

Locate the official endpoint, expected to be similar to:

```text
POST /api/mes/execution/work-orders/{wo_id}/compute-check
```

Trace the full flow:

```text
MES Console
→ HTTP request
→ execution handler
→ compute service
→ WO snapshots
→ calendar / shift / worker / planning lookup
→ duration and capacity calculation
→ response
→ frontend rendering
```

Inspect:

- route registration;
- handler;
- service;
- repository;
- database queries;
- external service calls;
- DTO mapping;
- frontend API client;
- React Query or state caching;
- UI rendering.

Determine whether the response is:

- genuinely calculated;
- partially calculated;
- hard-coded;
- default-filled;
- cached incorrectly;
- reused across different Work Orders;
- based on current master data;
- based on WO snapshots;
- based on only one fallback calendar.

---

# Phase 2 — Verify Compute & Check Inputs

For every Work Order operation, capture all inputs used by Compute & Check:

```text
WO ID
WO quantity
WO target date
operation ID
routing operation ID
sequence
Work Center ID
setup time
cycle time
base quantity
yield
efficiency
queue time
move time
required workers
required skills
planned start
planned end
Shift ID
calendar source
available minutes
capacity factor
worker availability
```

Prove whether these inputs differ across operations.

The duration calculation should be explainable, for example:

```text
run_minutes =
    cycle_time_sec / 60
    × work_order_quantity / base_quantity
    ÷ standard_yield
    ÷ efficiency_factor

total_duration =
    setup_time
    + run_minutes
    + queue_time
    + move_time
```

Use the actual formula implemented in the source code.

Do not replace it with an assumed formula.

---

# Phase 3 — Detect Constant or Fake Results

Create at least three controlled test cases:

## Case A — Different quantity

```text
WO quantity = 10
WO quantity = 100
```

The operation run time must change when cycle-based planning applies.

## Case B — Different Production Standards

Use two operations with different:

```text
setup time
cycle time
base quantity
yield
efficiency
required workers
```

Their calculated results must differ.

## Case C — Capacity unavailable

Configure one valid test calendar as:

```text
AvailabilityStatus = PlannedDown
```

or:

```text
AvailableMinutes = 0
```

The result must not remain `Ready`.

If all cases return identical values or always return `Ready`, classify the implementation as one of:

```text
COMPUTE_CHECK_HARD_CODED
COMPUTE_CHECK_DEFAULT_FALLBACK_ONLY
COMPUTE_CHECK_CACHE_LEAK
COMPUTE_CHECK_SNAPSHOT_MISMATCH
COMPUTE_CHECK_CALENDAR_NOT_EVALUATED
COMPUTE_CHECK_FRONTEND_STALE_STATE
```

Then create the blocker report and stop.

---

# Phase 4 — Verify Compute & Check Snapshot Ownership

Determine whether Compute & Check uses:

```text
WO immutable snapshots
```

or:

```text
current mutable master data
```

The expected rule is:

```text
Work Order creation
→ creates operation and planning snapshots

Compute & Check
→ consumes those snapshots
→ may query current availability data such as calendars and workers
→ must not recreate missing Routing snapshots
```

Verify that:

- Routing operation snapshots exist before Compute & Check.
- Production Standard values are already snapshotted where designed.
- Compute & Check does not silently fill missing operation data.
- Compute & Check does not create missing snapshot rows.
- Approval does not become the first place that discovers missing snapshots.

If snapshot ownership is inconsistent, report it and stop.

---

# Phase 5 — Reproduce the Resource Proposal HTTP 500

Reproduce the exact UI action:

```text
Work Order detail
→ Resource Planning
→ Propose Resources
```

Capture:

- browser request URL;
- method;
- request body;
- response status;
- response body;
- correlation ID;
- frontend console error;
- MES Execution logs;
- MES Master Data logs;
- downstream dependency logs;
- database errors.

Trace the expected call chain:

```text
MES Console
→ MES Execution resource-candidates endpoint
→ ResourcePlanningClient
→ MES Master Data readiness endpoint
→ planning repositories
→ response
```

Likely APIs include:

```text
GET /api/mes/execution/work-orders/{wo_id}/operations/{operation_id}/resource-candidates

POST /api/mes/master-data/resource-planning/readiness
```

Prove the actual routes from source code.

---

# Phase 6 — Correct Error Semantics

The following result is incorrect for normal business unavailability:

```text
500 Internal Server Error
```

A valid planning request with no matching resource should return a structured business result such as:

```json
{
  "severity": "Blocked",
  "candidates": [],
  "errors": [
    {
      "code": "NO_ELIGIBLE_RESOURCE",
      "message": "No eligible resource candidate was found."
    }
  ]
}
```

Reserve HTTP 500 for genuine system failures such as:

- SQL scan failure;
- schema mismatch;
- unhandled exception;
- unavailable mandatory dependency;
- malformed internal data;
- programming error.

Do not convert system errors into “no candidate”.

Do not convert no-candidate results into HTTP 500.

---

# Phase 7 — Audit the Resource Readiness Algorithm

Inspect the real implementation of:

```text
POST /api/mes/master-data/resource-planning/readiness
```

Determine whether it truly evaluates:

- Site compatibility;
- Routing Operation;
- Work Center;
- Workstation;
- Machine / Equipment;
- effective Resource Assignment;
- active status;
- planning-resource flag;
- Resource Capability;
- capability eligibility;
- capability priority;
- quantity limits;
- Shift;
- Resource Calendar;
- calendar inheritance;
- available minutes;
- capacity factor;
- Production Standard;
- required workers;
- required skills;
- lot-size constraints;
- print-station readiness for print operations.

Identify any:

- TODO;
- stub;
- fallback that always returns `Ready`;
- hard-coded 480-minute calendar;
- ignored Shift;
- ignored Resource Capability;
- ignored worker requirement;
- incorrect nullable scan;
- empty UUID;
- stale projection;
- missing event-consumer data.

---

# Phase 8 — Audit Shift Feature

Audit backend and frontend for Shift management.

Verify:

## Backend

- list API;
- detail API;
- create API;
- update API;
- status handling;
- cross-midnight support;
- break calculation;
- net available minutes;
- Site ownership;
- uniqueness rules;
- validation;
- database migration;
- seed support.

## Frontend

- route exists;
- list loads;
- create form works;
- update form works;
- time input works;
- status renders correctly;
- Site selector works;
- translations exist;
- errors are visible;
- no raw UUID is exposed.

## Runtime

Create at least:

```text
Shift A: 08:00–16:00
Break: 60 minutes
Net available: 420 minutes
```

and optionally:

```text
Shift B: 16:00–00:00
```

Verify the readiness API actually consumes the selected Shift.

If Shift is only CRUD data and is ignored by readiness, report and stop.

---

# Phase 9 — Audit Resource Calendar Feature

Audit backend and frontend for Resource Calendar.

Verify support for:

```text
Work Center calendar
Workstation calendar
Machine / Equipment calendar
Site
date
Shift
AvailabilityStatus
AvailableMinutes
CapacityFactor
Reason
```

Validate inheritance order from the current implementation, expected to be similar to:

```text
Equipment
→ Workstation
→ Work Center
```

Test:

## Available

```text
status = Available
available_minutes > required_duration
capacity_factor > 0
```

Expected result:

```text
Ready or ReadyWithWarnings
```

## Insufficient capacity

```text
available_minutes < required_duration
```

Expected result:

```text
Blocked or capacity warning according to policy
```

## Planned down

```text
status = PlannedDown
```

Expected result:

```text
Blocked
```

## Holiday

```text
status = Holiday
```

Expected result:

```text
Blocked
```

## Missing calendar

Verify the documented fallback policy.

If missing calendar currently produces a default 480-minute `Ready`, ensure the response clearly reports the fallback warning.

Do not allow fallback data to look like fully validated capacity.

---

# Phase 10 — Audit Resource Capability

Verify Resource Capability supports:

```text
Site
Product Revision or Item Group
Operation
Work Center
optional Equipment
eligibility
priority
speed factor
minimum lot size
maximum lot size
setup family
effective dates
status
```

Test precedence:

```text
Equipment-specific capability
overrides
Work Center capability
```

Test explicit denial:

```text
eligibility = false
```

Expected result:

```text
Blocked
```

Verify quantity limits using the seeded WO quantity.

Ensure Resource Capability is connected to the exact:

```text
Product Revision
Operation
Work Center
Equipment
```

used by the WO operation.

---

# Phase 11 — Audit Resource Assignments and Hierarchy

Completely reset and reseed:

```text
Factory / Site
Shopfloor
Work Center
Workstation
Machine / Equipment
Resource Assignment
```

Verify canonical relationships:

```text
Factory / Site
→ Shopfloor
→ Work Center
→ Workstation
→ Machine
```

Ensure:

- all entities are active;
- all belong to the same Site;
- Workstation belongs to the correct Work Center;
- Machine is eligible for planning;
- Resource Assignment is effective on the WO date;
- assignment status is active;
- scheduling flag is true;
- no conflicting primary assignment exists;
- print operation Workstation has a valid Print Station binding if required.

---

# Phase 12 — Audit Workers, Skills, and Availability

Reset and seed:

```text
workers / employees
skills
employee skills
operation skill requirements
worker-to-resource scope
worker shift assignment
worker calendar / schedule
```

For each operation that requires workers:

- required worker count must be positive;
- mandatory skills must exist;
- enough active workers must have the required skill;
- workers must belong to the correct Site or resource scope;
- workers must be available in the selected Shift and date.

Create at least one negative test:

```text
required workers = 2
available qualified workers = 1
```

Compute & Check or readiness must not return an unexplained `Ready`.

---

# Phase 13 — Audit Production Standard Resolution

Reset and seed valid Production Standards for every Routing Operation.

Verify fields:

```text
Product Revision
Routing Operation
Work Center
optional Equipment
base quantity
setup time
cycle time
labour count
yield
efficiency
source method
valid from
valid to or review date
status / lifecycle
```

Test precedence:

```text
Equipment-specific standard
overrides
Work Center standard
```

Every candidate response must show which Production Standard was selected.

Do not permit a candidate with zero or missing cycle time unless the operation type explicitly allows it.

---

# Phase 14 — Expand `reset:seed:mes:wo`

Update the existing package command:

```bash
npm run reset:seed:mes:wo
```

Do not create a parallel competing reset command unless necessary.

The command must reset and seed all required data for a fully valid resource-planning scenario.

The reset scope must include, where owned by the development seed:

```text
WO transactional data
WO operation snapshots
WO material requirements
resource allocations
capacity reservations
approval logs
execution sessions
print jobs
outbox/inbox test rows
Items
Item Revisions
MBOMs
MBOM lines
Operations
Routings
Routing Operations
Production Standards
Production Versions
Factories / Sites
Shopfloors
Work Centers
Workstations
Machines / Equipment
Resource Assignments
Resource Capabilities
Shifts
Resource Calendars
Workers / Employees
Skills
Employee Skills
Operation Skill Requirements
worker schedules
Print Station bindings
WMS test inventory and reservations
```

Preserve:

```text
schema migrations
required system roles
authentication configuration
global UOM reference data where shared
real remote Printer Adapter runtime identity unless explicitly owned by the seed
```

---

# Phase 15 — Seed One Perfect Resource-Planning Dataset

Use deterministic business-code prefixes such as:

```text
E2E-WO-
E2E-SITE-
E2E-SF-
E2E-WC-
E2E-WS-
E2E-MC-
E2E-SHIFT-
```

Seed:

## Factory hierarchy

```text
1 active Factory / Site
1 active Shopfloor
3 active Work Centers
3 active Workstations
at least 1 eligible Machine for each machine-required Workstation
```

## Shift

```text
E2E-SHIFT-A
08:00–16:00
60-minute break
420 net minutes
```

## Calendars

Create calendars for the test date and Shift for:

- Work Centers;
- Workstations;
- Machines.

Ensure sufficient capacity.

## Workers

Create enough workers to satisfy every mandatory labour requirement.

## Product data

Create:

- one Finished Good Item;
- one Released Item Revision;
- component Items and Revisions;
- one Released MBOM;
- one Released Routing;
- three Routing Operations;
- valid Production Standards;
- one Released Production Version.

## Routing operations

Use deliberately different planning values.

Example:

```text
Operation 10:
setup = 10 min
cycle = 30 sec
workers = 1

Operation 20:
setup = 20 min
cycle = 60 sec
workers = 2

Operation 30:
setup = 5 min
cycle = 10 sec
workers = 1
```

This makes identical Compute & Check results impossible if the implementation is correct.

## Resource capabilities

Create an eligible capability for each operation and resource.

Set lot-size ranges to include the test WO quantity.

## WMS

Seed sufficient material stock through the official WMS integration path.

---

# Phase 16 — Seed Positive and Negative Calendar Cases

The script should create one active positive dataset and optional isolated negative fixtures.

## Positive fixture

All operations have:

```text
valid Shift
valid Calendar
sufficient available minutes
valid capability
effective assignment
valid Production Standard
enough qualified workers
```

Expected:

```text
resource candidate count > 0
severity = Ready or ReadyWithWarnings
```

## Negative fixture

Create separately and remove after verification:

```text
one Machine PlannedDown
```

Expected:

```text
candidate blocked
```

Do not leave negative fixtures active in the final seeded dataset.

---

# Phase 17 — Verify the Frontend

Audit MES Console screens for:

```text
Shift
Calendar
Resource Capability
Factory
Shopfloor
Work Center
Workstation
Machine
Worker
Work Order Compute & Check
Work Order Resource Planning
```

Verify:

- list pages load;
- detail pages load;
- forms submit;
- selectors show business names and codes;
- no 500 is hidden as “no candidate”;
- loading state resets;
- stale candidate cards are cleared;
- errors show correlation IDs;
- Compute & Check results update after each call;
- React Query cache keys include WO ID and operation ID;
- one WO response is not reused for another WO;
- capacity status is rendered from backend data;
- fallback warnings are displayed;
- candidate selection works;
- allocation commit works where enabled.

---

# Phase 18 — End-to-End Verification

After reset and seed:

1. Verify all seeded master data through APIs.
2. Create a WO using the seeded Production Version.
3. Verify snapshots exist immediately.
4. Call Compute & Check.
5. Capture operation-level results.
6. Confirm operations have different calculated values.
7. Confirm capacity inputs identify the seeded Shift and Calendar.
8. Open Resource Planning.
9. Request candidates for each operation.
10. Confirm each operation has at least one valid candidate.
11. Confirm no HTTP 500 occurs.
12. Confirm selected records identify:
    - Work Center;
    - Workstation;
    - Machine;
    - Shift;
    - Calendar;
    - Capability;
    - Production Standard.
13. Commit allocations if strict allocation mode is enabled.
14. Revalidate allocations.
15. Approve the WO.
16. Start execution.

---

# Phase 19 — Required Diagnostic Artifacts

Generate:

```text
artifacts/mes-resource-planning-audit/<timestamp>/
├── environment.json
├── compute-check-code-path.md
├── compute-check-inputs.json
├── compute-check-results.json
├── compute-check-comparison.md
├── readiness-request.json
├── readiness-response.json
├── readiness-error-chain.md
├── shift-audit.md
├── calendar-audit.md
├── capability-audit.md
├── assignment-audit.md
├── production-standard-audit.md
├── worker-skill-audit.md
├── frontend-audit.md
├── reset-seed-manifest.json
├── seeded-entity-ids.json
├── resource-candidates.json
├── runtime-verification.md
└── summary.md
```

Do not include credentials or secrets.

---

# Phase 20 — Blocker Report Format

If any feature fails, write:

```text
implementation-fix/mes-wo-resource-planning-audit-blocker.md
```

Required sections:

```text
# Blocker Summary

## Stage

## Expected Behaviour

## Actual Behaviour

## Root Cause

## Evidence

## Affected Backend Files

## Affected Frontend Files

## Database Evidence

## API Request and Response

## Logs

## Seed Impact

## Recommended Options

## Work Not Performed Because of Stop Policy
```

Use an evidence status:

```text
IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_BUT_BROKEN
PARTIALLY_IMPLEMENTED
STUBBED
MISSING
CONFLICTING_SOURCES
UNVERIFIED
```

Stop immediately after writing the report.

---

# Acceptance Criteria

The task is complete only when all of the following pass:

1. Compute & Check is proven to use real operation-specific input.
2. Different WO quantities produce different calculated durations.
3. Different Production Standards produce different operation results.
4. Planned-down or zero-capacity calendar data does not return false `Ready`.
5. Shift CRUD works in backend and frontend.
6. Calendar CRUD works in backend and frontend.
7. Resource Capability CRUD and precedence work.
8. Resource Assignments are effective and correctly scoped.
9. Production Standards resolve correctly.
10. Worker and skill requirements are evaluated correctly.
11. The readiness endpoint no longer returns unexplained HTTP 500.
12. Business no-candidate cases return structured non-500 results.
13. `npm run reset:seed:mes:wo` resets all required MES planning data.
14. The command seeds one complete valid hierarchy and planning dataset.
15. The seeded WO creates complete snapshots.
16. Compute & Check returns explainably different operation results.
17. Every seeded WO operation returns at least one valid resource candidate.
18. Frontend displays live backend results without stale cache reuse.
19. No fake candidate, fake allocation, or hard-coded readiness result is introduced.
20. All tests and builds pass.

---

# Required Final Report

Provide:

## Compute & Check

- endpoint;
- backend code path;
- formula;
- input source;
- snapshot usage;
- comparison across operations;
- capacity evaluation result;
- whether any hard-coded/default result was found.

## Resource Proposal Error

- exact failing request;
- dependency chain;
- root cause of HTTP 500;
- database or mapping issue;
- corrected response behaviour.

## Shift

- API status;
- frontend status;
- seeded Shift;
- readiness consumption proof.

## Calendar

- inheritance result;
- available-capacity test;
- planned-down test;
- missing-calendar fallback result.

## Resource Capability

- seeded rules;
- precedence;
- quantity-limit result;
- candidate impact.

## Resource Hierarchy

- Factory;
- Shopfloor;
- Work Centers;
- Workstations;
- Machines;
- assignments.

## Workforce

- workers;
- skills;
- availability;
- operation requirements.

## Reset and Seed

- updated `reset:seed:mes:wo` command;
- deleted row counts;
- seeded entities;
- repeatability result.

## End-to-End Evidence

For each WO operation include:

```text
operation
Work Center
Workstation
Machine
Shift
Calendar source
Capability
Production Standard
required duration
available capacity
worker readiness
candidate severity
```

Do not report completion if capacity is still always `Ready` without evidence, if the readiness endpoint still returns HTTP 500, or if the seeded WO cannot obtain valid resource candidates.