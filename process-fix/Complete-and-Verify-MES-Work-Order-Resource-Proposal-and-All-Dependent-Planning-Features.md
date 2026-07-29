# Complete and Verify MES Work Order Resource Proposal and All Dependent Planning Features

## Background

A previous audit stopped with the following findings:

```text
Compute & Check:
IMPLEMENTED_BUT_BROKEN

Resource readiness HTTP 500:
UNRESOLVED

Shift:
NOT_AUDITED_DUE_TO_BLOCKER

Resource Calendar:
NOT_AUDITED_DUE_TO_BLOCKER

Resource Capability:
SEED_MISSING, RUNTIME_UNVERIFIED

Frontend:
PARTIALLY_AUDITED

reset:seed:mes:wo:
NOT_UPDATED_DUE_TO_STOP_POLICY

The previous blocker report identified that Work Order Compute & Check:

ignores rows.Scan errors;
hides missing snapshot values behind hard-coded defaults;
can return successful calculations using fabricated planning values;
does not properly evaluate calendar availability, available minutes, planned-down state, holiday state, or capacity factor.

The Resource Proposal flow also currently fails with:

mes-master-data-service retryable dependency failure:
readiness failed: 500 Internal Server Error

The exact root cause of this HTTP 500 has not yet been reproduced or identified.

The current development seed is incomplete. It does not prove a valid operation-by-operation planning matrix containing:

Resource Assignment
Resource Capability
Shift
Resource Calendar
Production Standard
Worker availability
Worker skills
Workstation
Machine / Equipment

This task must repair and complete the entire Resource Proposal capability, including every backend, frontend, seed, and runtime dependency required for valid Work Order resource candidates.

Primary Objective

Complete the MES Work Order Resource Proposal feature so that every Work Order operation can be evaluated against real, deterministic planning data.

The final flow must be:

Released Production Version
→ Work Order creation
→ immutable operation and planning snapshots
→ Compute & Check
→ Resource Proposal
→ candidate evaluation
→ candidate selection
→ allocation commit
→ allocation revalidation
→ Work Order approval
→ execution

The system must never return a false Ready result by using fabricated defaults.

The system must never return HTTP 500 for a normal no-candidate business case.

Mandatory Working Policy

This task is no longer a stop-at-first-known-blocker audit.

Implement the required repairs in a controlled sequence.

However, stop and write a blocker report if:

a required business rule is genuinely ambiguous;
the database schema cannot support the intended behaviour safely;
a cross-service contract is missing and cannot be inferred from running code;
implementation would require fabricating business policy;
destructive changes cannot be proven safe.

Do not bypass Resource Proposal.

Do not hard-code candidates.

Do not create fake allocation rows.

Do not mark missing planning data as valid.

Phase 1 — Reproduce and Capture the Current Failures

Use a real Draft Work Order from the current database or a controlled fixture.

Reproduce:

Compute & Check
Resource Proposal

Capture:

Work Order ID;
operation IDs;
Production Version ID;
Routing ID;
Site ID;
quantity;
target date;
planned date;
Shift ID;
exact frontend request;
exact backend request;
response status;
response body;
correlation ID;
frontend console output;
MES Execution logs;
MES Master Data logs;
SQL error;
stack trace.

Create:

artifacts/mes-resource-proposal-repair/<timestamp>/baseline/

Include:

compute-check-request.json
compute-check-response.json
resource-candidates-request.json
resource-candidates-response.json
master-data-readiness-request.json
master-data-readiness-response.json
execution-service.log
master-data-service.log
database-evidence.json

Do not begin by changing seed data before capturing the current failure.

Phase 2 — Repair Compute & Check

Audit:

services/mes-execution-service/internal/application/usecase/compute_and_check.go

and every repository or handler involved.

Remove fabricated defaults

Remove production-path defaults such as:

setup_time = 15
cycle_time = 45
efficiency = 1
base_quantity = 1
yield = 1

Missing mandatory planning values must not silently produce a valid result.

Check every database error

Every call must handle errors:

rows.Scan(...)
rows.Err()
Query(...)
QueryRow(...)

Distinguish:

SQL_SCAN_FAILED
WO_OPERATION_SNAPSHOT_MISSING
WO_PLANNING_SNAPSHOT_INCOMPLETE
WO_CALENDAR_QUERY_FAILED
WO_WORKER_READINESS_QUERY_FAILED

Do not return HTTP 200 when mandatory snapshot scanning fails.

Define required and optional fields

Document which planning fields are mandatory for:

production operations;
inspection operations;
handling operations;
printing operations;
automatic operations.

Optional fields may use an explicit domain-defined default only if the policy already exists in the codebase or documentation.

Every default must be visible in the response as a warning.

Use the authoritative inputs

Compute & Check must use:

WO operation snapshot
WO quantity
planning snapshot
queue time
move time
required workers
required skills
current availability data
selected or default Shift according to policy

It must not recreate missing Routing Operations.

It must not reload mutable Production Standard values to overwrite the snapshot.

Duration calculation

Report the exact implemented formula and field sources.

For every operation return diagnostics:

{
  "setupTimeMinutes": 10,
  "cycleTimeSeconds": 30,
  "baseQuantity": 1,
  "workOrderQuantity": 100,
  "standardYield": 0.98,
  "efficiencyFactor": 0.9,
  "queueTimeMinutes": 5,
  "moveTimeMinutes": 2,
  "calculatedRunMinutes": 56.69,
  "calculatedTotalMinutes": 73.69
}

Values are examples only. Use actual seeded data.

Phase 3 — Make Capacity Check Real

Compute & Check must evaluate actual capacity data.

For the resolved resource level, evaluate:

calendar date
Shift
availability status
available minutes
capacity factor
already reserved minutes where applicable
required duration
remaining capacity

Required behaviour:

Available
status = Available
remaining capacity >= required duration

Result:

Ready
Insufficient capacity
remaining capacity < required duration

Result:

Blocked
or ReadyWithWarnings only if the documented policy explicitly permits over-capacity planning
Planned down

Result:

Blocked
Holiday

Result:

Blocked
Capacity factor zero

Result:

Blocked
Missing calendar

If the existing 480-minute fallback is retained:

classify it as an explicit fallback;
return ReadyWithWarnings, never unqualified Ready;
include CALENDAR_FALLBACK_USED;
include the fallback source in diagnostics;
do not call it verified capacity.

Prefer strict blocking if that is the intended production policy.

Document the final decision.

Phase 4 — Prove Compute & Check Is Dynamic

Add automated and runtime tests.

Quantity test

Use the same Production Version:

WO quantity = 10
WO quantity = 100

Cycle-based run duration must change.

Standard test

Use operations with intentionally different:

setup time
cycle time
base quantity
yield
efficiency
queue time
move time

Results must differ.

Calendar test

Evaluate the same operation under:

Available
Insufficient capacity
PlannedDown
Holiday
Missing calendar

Results must change predictably.

NULL and scan test

Insert or fixture a nullable or invalid planning row.

Expected:

structured error
not fabricated success
Phase 5 — Identify the Exact Root Cause of Readiness HTTP 500

Trace:

MES Console
→ MES Execution resource-candidates API
→ ResourcePlanningClient
→ MES Master Data readiness API
→ repositories
→ database

Do not stop at the retryable dependency wrapper.

The final report must state the exact original exception.

Investigate:

NULL scanned into non-null field;
empty UUID;
malformed date;
invalid enum;
SQL schema mismatch;
missing column;
wrong join;
duplicate rows;
invalid JSON;
undefined Shift;
unresolved Calendar;
missing Work Center;
frontend payload mismatch;
camelCase/snake_case mismatch;
optional field incorrectly treated as required.

Capture the exact failing SQL query or repository function.

Phase 6 — Correct Readiness Error Semantics

Normal business unavailability must not return HTTP 500.

Examples:

NO_EFFECTIVE_ASSIGNMENT
NO_ELIGIBLE_CAPABILITY
NO_AVAILABLE_WORKSTATION
NO_AVAILABLE_MACHINE
SHIFT_NOT_CONFIGURED
CALENDAR_NOT_CONFIGURED
RESOURCE_PLANNED_DOWN
RESOURCE_ON_HOLIDAY
INSUFFICIENT_CAPACITY
PRODUCTION_STANDARD_NOT_FOUND
INSUFFICIENT_QUALIFIED_WORKERS
LOT_SIZE_NOT_SUPPORTED

Return a structured readiness result such as:

{
  "severity": "Blocked",
  "candidates": [],
  "errors": [
    {
      "code": "NO_ELIGIBLE_CAPABILITY",
      "scope": "RoutingOperation",
      "entityId": "...",
      "message": "No effective eligible capability matches the operation and Work Center."
    }
  ],
  "warnings": []
}

Use HTTP 500 only for technical failures.

Technical failures must include a correlation ID and safe error code.

Phase 7 — Complete Shift Backend and Frontend

Audit and repair Shift management.

Backend requirements

Verify and test:

list;
detail;
create;
update;
active/inactive lifecycle;
Site ownership;
unique Shift code per Site;
start time;
end time;
cross-midnight calculation;
break minutes;
net available minutes;
validation;
deletion guard;
effective use in readiness.

Use the canonical formula:

net available minutes =
shift duration
- break minutes
Frontend requirements

Verify:

Shift route loads;
list is paginated;
create form works;
edit form works;
time inputs are correct;
cross-midnight is represented correctly;
Site is selected by business identity;
lifecycle status is visible;
validation errors are shown;
VI/EN/JA/KO translations exist.
Runtime proof

Seed and verify:

E2E-SHIFT-A
08:00–16:00
break = 60
net available = 420

Prove the readiness response references this exact Shift.

If Shift exists only as CRUD data but is not consumed by readiness, implement the missing integration.

Phase 8 — Complete Resource Calendar Backend and Frontend

Audit and repair Resource Calendar.

Support:

Site
resource type
resource ID
calendar date
Shift
availability status
available minutes
capacity factor
reason

Supported resource levels:

Work Center
Workstation
Machine / Equipment
Inheritance

Verify the actual precedence.

Expected:

Machine
→ Workstation
→ Work Center

Return the selected source in every candidate:

{
  "calendarSourceType": "Machine",
  "calendarSourceId": "...",
  "calendarId": "..."
}
Frontend

Verify:

list;
filters by Site/date/Shift/resource;
create;
update;
bulk or monthly editing where implemented;
PlannedDown and Holiday states;
reason display;
business names instead of UUIDs;
correct error handling.
Runtime scenarios

Test:

Available with sufficient capacity
Available with insufficient capacity
PlannedDown
Holiday
Missing calendar
capacity factor = 0
Phase 9 — Complete Resource Capability

Audit and repair backend and frontend.

Capability must evaluate:

Site
Product Revision or Item Group
Operation
Work Center
optional Machine / Equipment
eligibility
priority
speed factor
minimum lot size
maximum lot size
setup family
effective dates
status
Required precedence
Equipment-specific rule
overrides
Work Center rule
Explicit denial

An effective Equipment-level or Work-Center-level denial must block the resource according to precedence.

Lot-size validation

The test WO quantity must be inside the capability range.

Candidate diagnostics must identify the selected capability record.

Frontend

Verify:

create;
edit;
selectors;
Product Revision versus Item Group rule;
Operation selector;
Work Center selector;
optional Machine selector;
validity;
priority;
lot-size validation;
lifecycle status;
error rendering.
Phase 10 — Complete Resource Assignment and Hierarchy

Reset and seed the complete hierarchy:

Factory / Site
→ Shopfloor
→ Work Center
→ Workstation
→ Machine

For every operation, verify an effective assignment exists.

Assignment requirements:

same Site
active Work Center
active Workstation
active Machine when required
effective date range
scheduling enabled
planning resource enabled
valid assignment role
no conflicting primary assignment

Candidate evaluation must not select a Machine that is no longer assigned to the Workstation.

Return assignment evidence in the candidate response.

Phase 11 — Complete Production Standard Resolution

Every Routing Operation must resolve a Production Standard.

Required fields:

Product Revision
Routing Operation
Work Center
optional Machine
base quantity
setup time
cycle time
labour count
standard yield
efficiency factor
source method
validity
release status

Precedence:

Machine-specific standard
overrides
Work Center standard

Candidate response must include:

selected Production Standard ID
selection level
setup time
cycle time
base quantity
yield
efficiency
labour count

Missing required standards must block readiness.

Do not use fabricated standard values.

Phase 12 — Complete Worker and Skill Readiness

Audit and repair:

Employee
Employee Site/resource scope
Skill
Employee Skill
Operation Skill Requirement
worker availability
worker Shift assignment

For every operation:

determine required persons;
determine mandatory skills;
count qualified active workers;
verify planned-date availability;
verify Shift availability;
verify Site and resource scope.

Candidate response must include:

{
  "requiredWorkers": 2,
  "qualifiedAvailableWorkers": 2,
  "requiredSkills": [
    {
      "skillId": "...",
      "minimumLevel": "L2",
      "requiredPersons": 2,
      "availablePersons": 2
    }
  ]
}

Negative test:

required = 2
available qualified workers = 1

Expected:

Blocked
Phase 13 — Define a Complete Candidate Contract

Every candidate returned by Resource Proposal must include enough evidence for backend verification and frontend display.

Required candidate fields:

candidate ID or deterministic key
Work Center
Workstation
Machine / Equipment
Shift
planned start
planned end
required duration
calendar source
available minutes
remaining capacity
capacity factor
Resource Assignment
Resource Capability
Production Standard
required workers
available qualified workers
warnings
blocking errors
severity

Example structure:

{
  "candidateKey": "...",
  "severity": "Ready",
  "workCenter": {},
  "workstation": {},
  "equipment": {},
  "shift": {},
  "duration": {},
  "calendar": {},
  "assignment": {},
  "capability": {},
  "productionStandard": {},
  "workforce": {},
  "warnings": [],
  "errors": []
}

Candidate ordering must be deterministic.

Suggested ordering:

severity
capability priority
equipment-specific preference
speed factor
available capacity
business code

Document the actual ordering.

Phase 14 — Complete Allocation Commit and Revalidation

Verify:

POST resource-allocation
POST reallocate
DELETE resource-allocation
POST resource-allocations/revalidate

A selected candidate must be revalidated before commit.

Commit must persist:

WO operation
Work Center
Workstation
Machine
Shift
planned start/end
calendar evidence
assignment evidence
capability evidence
Production Standard evidence
duration
warnings
validation status
allocation status
row version
actor
change reason

Capacity reservation must be transactional.

Test:

idempotent replay;
stale candidate;
overlapping reservation;
reallocation;
cancellation;
revalidation after master-data change.
Phase 15 — Repair the Frontend Resource Proposal Flow

Audit:

services/mes-console/src/routes/work-orders/WODetailScreen.tsx

and all related hooks, API clients, components, and cache keys.

Error handling

Do not convert HTTP 500 into:

No suitable candidate

Render technical dependency failure separately:

Resource readiness service failed.
Reference: <correlation ID>
Business blocked result

Display operation-specific blockers such as:

No eligible capability
Shift missing
Machine planned down
Calendar insufficient
Qualified workers unavailable
Candidate display

Show:

Workstation
Machine
Shift
duration
available capacity
Capability
Production Standard
worker readiness
warnings
Cache correctness

Ensure query keys include:

WO ID
WO operation ID
quantity
planned date
Shift
row version or relevant snapshot version

Changing WO, operation, planned date, or Shift must invalidate candidates.

Allocation workflow

Support:

load candidates
select candidate
commit allocation
display committed allocation
revalidate
reallocate
remove allocation
Phase 16 — Expand npm run reset:seed:mes:wo

Update the existing command only:

npm run reset:seed:mes:wo

The command must reset and seed all development-owned planning data required by this feature.

Reset scope

Include:

WO transactional rows
WO snapshots
allocations
reservations
execution sessions
approval logs
print jobs owned by test WOs
test outbox/inbox rows
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
Machines
Resource Assignments
Resource Capabilities
Shifts
Resource Calendars
Employees
Skills
Employee Skills
Operation Skill Requirements
worker schedules
Print Station bindings
WMS test inventory and reservations

Use strict environment guards.

Seed scope

Seed one deterministic complete positive scenario.

Recommended structure:

1 Factory
1 Shopfloor
3 Work Centers
3 Workstations
3 Machines where required
1 Shift
resource calendars at all relevant levels
sufficient workers and skills
3 Routing Operations
3 distinct Production Standards
3 eligible Resource Capabilities
effective Resource Assignments
Released MBOM
Released Routing
Released Production Version
sufficient WMS inventory
valid Print Station binding

Use different planning values for each operation.

Example:

Operation 10
setup = 10 minutes
cycle = 30 seconds
workers = 1

Operation 20
setup = 20 minutes
cycle = 60 seconds
workers = 2

Operation 30
setup = 5 minutes
cycle = 10 seconds
workers = 1

The final positive dataset must contain no active negative fixture.

Phase 17 — Seed Verification Matrix

After seeding, generate a matrix:

Operation	Assignment	Capability	Shift	Calendar	Standard	Workers	Skills	Candidate
OP-10	PASS	PASS	PASS	PASS	PASS	PASS	PASS	Ready
OP-20	PASS	PASS	PASS	PASS	PASS	PASS	PASS	Ready
OP-30	PASS	PASS	PASS	PASS	PASS	PASS	PASS	Ready

Do not consider the seed complete unless every cell passes.

Phase 18 — Negative Test Fixtures

Create isolated, temporary fixtures and remove them after testing.

Test:

capability missing
capability denied
quantity outside lot range
assignment expired
Machine inactive
Machine not planning-enabled
Shift missing
calendar missing
calendar insufficient
PlannedDown
Holiday
capacity factor zero
Production Standard missing
worker shortage
skill shortage
snapshot NULL
SQL scan failure

Each case must produce the expected stable error code.

No business case should produce HTTP 500.

Phase 19 — End-to-End Verification

After reset and seed:

Verify all master data APIs.
Verify Shift frontend.
Verify Calendar frontend.
Verify Capability frontend.
Create a fresh Work Order.
Verify snapshots immediately after creation.
Run Compute & Check.
Confirm every operation has distinct explainable results.
Confirm capacity uses the seeded Shift and Calendar.
Open Resource Proposal.
Confirm no HTTP 500 occurs.
Confirm every operation returns at least one candidate.
Select one candidate per operation.
Commit allocations.
Revalidate allocations.
Approve the WO in strict allocation mode.
Start execution.
Confirm downstream Kiosk and Print Station compatibility.
Phase 20 — Required Reports and Artifacts

Generate:

artifacts/mes-resource-proposal-repair/<timestamp>/
├── baseline/
├── compute-check/
│   ├── code-path.md
│   ├── formula.md
│   ├── input-source-matrix.md
│   ├── quantity-comparison.json
│   ├── operation-comparison.json
│   └── calendar-scenarios.json
├── readiness/
│   ├── original-500-root-cause.md
│   ├── request.json
│   ├── response.json
│   ├── sql-evidence.md
│   ├── error-contracts.md
│   └── candidate-ordering.md
├── shift/
│   ├── backend-audit.md
│   ├── frontend-audit.md
│   └── runtime-evidence.json
├── calendar/
│   ├── backend-audit.md
│   ├── frontend-audit.md
│   ├── inheritance-evidence.json
│   └── scenario-results.json
├── capability/
│   ├── backend-audit.md
│   ├── frontend-audit.md
│   └── precedence-tests.json
├── assignments/
│   └── assignment-matrix.json
├── standards/
│   └── resolution-matrix.json
├── workforce/
│   └── skill-readiness-matrix.json
├── frontend/
│   ├── api-contract-audit.md
│   ├── cache-key-audit.md
│   └── browser-verification.md
├── seed/
│   ├── deleted-row-counts.json
│   ├── seed-manifest.json
│   ├── entity-ids.json
│   ├── verification-matrix.md
│   └── repeatability.json
├── allocations/
│   ├── commit-evidence.json
│   ├── revalidation-evidence.json
│   └── reservation-evidence.json
├── end-to-end/
│   ├── wo-timeline.md
│   ├── requests-and-responses.json
│   └── final-state.json
└── summary.md

Do not include secrets.

Required Final Report

Create:

implementation-fix/mes-work-order-resource-proposal-completion.md

The report must contain the following specific sections.

1. Executive Status

For each item use one status:

IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_BUT_NOT_TESTED
PARTIALLY_IMPLEMENTED
BROKEN
MISSING
BLOCKED

Report:

Compute & Check
Capacity validation
Readiness API
Shift backend
Shift frontend
Calendar backend
Calendar frontend
Capability backend
Capability frontend
Resource Assignment
Production Standard resolution
Worker readiness
Candidate API
Allocation commit
Allocation revalidation
Reset and seed
Frontend Resource Proposal
Strict WO approval
2. Original Root Causes

State the exact root causes of:

Compute & Check identical-looking results
capacity always Ready
readiness HTTP 500
no suitable candidates
incomplete seed

Do not use generic phrases.

Include exact files, functions, SQL queries, and error messages.

3. Compute & Check Evidence

For each seeded operation report:

operation code
WO quantity
setup time
cycle time
base quantity
yield
efficiency
queue time
move time
required duration
calendar source
available minutes
capacity factor
remaining capacity
final severity

Include comparison for quantity 10 and quantity 100.

4. Readiness HTTP 500 Evidence

Include:

exact failing request
exact original response
correlation ID
original exception
failing SQL/repository function
root cause
implemented fix
post-fix response
5. Shift Evidence

Include:

Shift ID/code
Site
start
end
cross-midnight
break
net available minutes
backend API verification
frontend verification
readiness consumption proof
6. Calendar Evidence

For every tested resource level include:

resource type
resource ID
date
Shift
status
available minutes
capacity factor
inheritance rank
selected source
readiness outcome

Include Available, insufficient, PlannedDown, Holiday, and missing-calendar cases.

7. Capability Evidence

For every operation include:

Product Revision or Item Group
Operation
Work Center
Machine
eligibility
priority
speed factor
lot-size range
effective dates
selected rule
precedence result
8. Resource Hierarchy and Assignment Evidence

Include:

Factory
Shopfloor
Work Center
Workstation
Machine
Assignment
Site consistency
effective range
scheduling flag
planning flag
9. Production Standard Evidence

For every operation include:

selected Standard ID
selection level
setup
cycle
base quantity
yield
efficiency
labour count
validity
10. Workforce Evidence

For every operation include:

required persons
required skills
qualified employees
available employees
Shift
resource scope
final readiness
11. Candidate Evidence

For every WO operation include all returned candidate records or a concise candidate summary:

candidate key
Work Center
Workstation
Machine
Shift
duration
calendar
capability
standard
workers
warnings
errors
severity
12. Frontend Evidence

Report:

routes tested
forms tested
browser requests
error display
candidate display
cache keys
allocation commit
revalidation
screenshots or browser evidence

Explicitly prove HTTP 500 is no longer rendered as “No suitable candidate”.

13. Reset and Seed Evidence

Include:

package.json command
environment guard
deleted row counts
seeded entity counts
seed manifest
operation verification matrix
repeatability result
14. Allocation Evidence

For every operation include:

allocation ID
candidate key
status
validation status
Workstation
Machine
Shift
planned start
planned end
reservation ID
revalidation result
15. Negative Test Results

Provide a table:

Test	Expected	Actual	Error code	HTTP status

Include every negative fixture listed in this prompt.

16. End-to-End Result

Include:

WO ID/code
Production Version
snapshot operation count
Compute & Check result
candidate count per operation
allocation count
revalidation result
approval result
execution start result
final status
17. Remaining Gaps

List only genuinely remaining gaps.

Do not report completion while:

Compute & Check still uses fabricated values;
capacity remains unverified;
readiness can still return unexplained HTTP 500;
Shift or Calendar is not consumed by readiness;
any seeded operation has no valid candidate;
frontend hides technical failures as no-candidate results;
strict allocation approval cannot pass with the seeded dataset.
Acceptance Criteria

The feature is complete only when:

Compute & Check uses real WO snapshot inputs.
Every SQL scan error is handled.
Missing mandatory snapshots return structured blockers.
Quantity changes alter cycle-based duration.
Different operation standards produce different results.
Available minutes and capacity factor affect readiness.
PlannedDown and Holiday block readiness.
Missing calendar is explicit, never silently verified.
The original readiness HTTP 500 root cause is identified and fixed.
Normal no-candidate cases return structured business results.
Shift backend and frontend work.
Readiness consumes the selected Shift.
Calendar backend and frontend work.
Calendar inheritance is proven.
Capability backend and frontend work.
Capability precedence and lot-size rules are proven.
Effective Resource Assignments exist.
Production Standards resolve deterministically.
Worker and skill readiness is evaluated.
Every seeded operation returns at least one valid candidate.
Candidate responses contain complete diagnostic evidence.
Allocation commit and revalidation work.
Frontend displays technical and business errors correctly.
npm run reset:seed:mes:wo creates a complete repeatable dataset.
A fresh WO passes strict Resource Proposal and allocation validation.
The final WO can be approved and started.
All tests and builds pass.
The required final report contains all requested evidence.