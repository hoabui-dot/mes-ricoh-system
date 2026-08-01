Audit and strengthen the complete Equipment Readiness flow across the current MES database model, Master Data API, Execution resource-planning logic, and MES Console UI.

The goal is to determine whether a physical Equipment or Machine Unit is genuinely ready to execute a Work Order Operation, not merely active in master data.

Do not add speculative fields or duplicate the existing resource-planning architecture. Audit the running source first and extend existing models and readiness projections only where a proven gap exists.

# 1. Read source-of-truth first

Inspect:

- `AI_CONTEXT.md`
- current MES ERD and relationship specification
- master-data Drizzle schema and migrations
- equipment and machine-unit handlers
- resource assignment APIs
- resource capability APIs
- resource calendar APIs
- Workstation machine-group requirements
- resource-planning readiness endpoint
- Work Order resource-candidate and allocation endpoints
- execution read-model projections
- MES Console Equipment list/detail/edit screens
- MES Console Work Order resource-planning section
- existing cleanup/seed and verification scripts

Running source, current schema, migrations, and tests are authoritative.

# 2. Produce an audit report before implementation

Create a matrix:

| Readiness factor | Current table/source | Current API | Current UI | Used by WO readiness | Status | Gap |
|---|---|---|---|---|---|---|
| Lifecycle | | | | | | |
| Execution status | | | | | | |
| Machine Unit availability | | | | | | |
| Resource Assignment | | | | | | |
| Capability | | | | | | |
| Calendar | | | | | | |
| Capacity reservation | | | | | | |
| Maintenance | | | | | | |
| Calibration | | | | | | |
| Operational hold/lock | | | | | | |
| Connectivity/heartbeat | | | | | | |
| Current fault/breakdown | | | | | | |

Use evidence statuses:

- IMPLEMENTED_AND_VERIFIED
- IMPLEMENTED_BUT_NOT_TESTED
- PARTIALLY_IMPLEMENTED
- MISSING
- AMBIGUOUS
- CONFLICTING_SOURCES

Do not implement until the audit identifies the exact missing readiness factors.

# 3. Preserve the current responsibility boundaries

Keep these concepts separate:

```text
md_equipment
  = slow-changing equipment master

md_machine_unit
  = individual physical machine instance

md_resource_assignment
  = effective hierarchy and assignment

md_resource_capability
  = operation/product eligibility

md_resource_calendar
  = date/shift availability

wo_resource_allocation
  = actual runtime planning commitment

wo_capacity_reservation
  = occupied capacity window

Do not turn md_equipment into a transaction/status dumping table.

Do not modify Routing or immutable Work Order snapshots from resource planning.

4. Define the canonical Equipment Readiness result

Equipment readiness must be backend-owned.

A candidate may be Ready only when all mandatory checks pass:

Equipment lifecycle is usable
Machine Unit is operationally available
Site and hierarchy are valid
Resource Assignment is effective
Capability permits the selected Operation and product scope
Lot-size constraints pass
Calendar is available for the selected date and Shift
Required capacity is available
No overlapping committed reservation exists
No blocking maintenance condition exists
Calibration is valid when required
No active hold, lock, fault, or breakdown exists

Use:

Ready
ReadyWithWarnings
Blocked
Unknown

Unknown must be used when required readiness data is missing or stale. Do not silently treat missing data as Ready.

5. Audit missing operational-readiness data

Determine whether the current codebase already has authoritative sources for:

maintenance status
maintenance planned window
breakdown/fault state
calibration required flag
calibration due/expiry date
calibration result/status
equipment hold/lock
connectivity/heartbeat
last operational-state update
state source

Do not add all of these automatically.

For every proposed field or table, provide:

business purpose
owning bounded context
source of truth
update mechanism
lifecycle
API consumer
UI consumer
Work Order readiness rule
migration impact
test case

If maintenance or calibration belongs to a future CMMS/QMS bounded context, create only the minimal MES integration projection required for readiness. Do not make MES the authoritative maintenance system without an explicit architecture decision.

6. Preferred data design

Prefer a separate operational/readiness projection over frequently mutating md_equipment.

If the audit proves no existing equivalent exists, consider a minimal structure such as:

Equipment Operational State
- equipment_id or machine_unit_id
- operational_status
- hold_status
- connectivity_status
- fault_code
- source
- observed_at
- valid_until
- row_version

And, only when required and not already owned elsewhere:

Equipment Compliance Projection
- equipment_id or machine_unit_id
- maintenance_blocking
- calibration_required
- calibration_status
- valid_until
- source_system
- source_reference
- updated_at

These names are illustrative only.

Use current naming and schema conventions after source inspection.

Do not create duplicate data when an existing table or external projection already owns the same fact.

7. Readiness API

Extend the existing resource-planning readiness flow rather than creating a competing engine.

The backend readiness response should explain each dimension:

{
  "status": "ReadyWithWarnings",
  "evaluated_at": "...",
  "equipment": {
    "id": "...",
    "code": "...",
    "name": "..."
  },
  "machine_unit": {},
  "assignment": {
    "status": "Valid"
  },
  "capability": {
    "status": "Matched"
  },
  "calendar": {
    "status": "Available"
  },
  "capacity": {
    "status": "Available"
  },
  "maintenance": {
    "status": "Clear"
  },
  "calibration": {
    "status": "Valid"
  },
  "operational_state": {
    "status": "Available",
    "observed_at": "..."
  },
  "blocking_errors": [],
  "warnings": []
}

Reuse the current stable-error convention.

Possible error categories:

EQUIPMENT_INACTIVE
EQUIPMENT_OUT_OF_SERVICE
EQUIPMENT_ASSIGNMENT_INVALID
EQUIPMENT_CAPABILITY_MISSING
EQUIPMENT_CALENDAR_UNAVAILABLE
EQUIPMENT_CAPACITY_CONFLICT
EQUIPMENT_MACHINE_UNIT_UNAVAILABLE
EQUIPMENT_MAINTENANCE_BLOCKED
EQUIPMENT_CALIBRATION_EXPIRED
EQUIPMENT_OPERATIONAL_HOLD
EQUIPMENT_FAULT_ACTIVE
EQUIPMENT_STATE_STALE
EQUIPMENT_READINESS_UNKNOWN

Do not create duplicate codes if equivalent codes already exist.

8. MES Console Equipment list

Improve the Equipment list to expose operational usefulness, not only identity.

Show:

Equipment name and code
Site
Work Center
lifecycle
execution status
planning-resource flag
available Machine Units / total Machine Units
active assignment
maintenance state, when supported
calibration state, when supported
current reservation indicator
overall readiness badge

Readiness badge:

Ready
Warning
Blocked
Unknown

Add filters for:

Site
Work Center
readiness
execution status
planning eligibility
maintenance/calibration state where supported

Do not load readiness row-by-row with an N+1 request pattern. Provide a list projection or batched endpoint.

9. MES Console Equipment detail

Redesign the detail page into clear cards:

Identity
code
localized name
type
manufacturer/model/serial
Site and hierarchy
lifecycle
Operational status
current status
state source
last observed time
freshness/staleness
Machine Units
unit code
serial
execution status
current allocation
readiness
Assignment
Work Center
Workstation
role
effective period
Capability
Operation
product scope
eligibility
priority
speed factor
lot-size range
Calendar and capacity
selected date/Shift
availability
minutes
capacity factor
active reservations
Maintenance and calibration

Show only when authoritative data exists.

Current WO usage
active Work Order
Operation
planned window
allocation status
Readiness diagnostics

Display each passed, warning, and blocking check.

Audit/history
state changes
allocation changes
assignment history
source and actor where available

Reuse current MES UI primitives, translation conventions, and business-code-first display.

10. Work Order resource-planning UI

Improve Equipment candidate cards.

Every candidate must show why it is available or blocked:

Ready
- Capability matched
- Calendar available
- Machine Unit available
- No capacity conflict
- Calibration valid

Blocked
- Active maintenance window
- Machine Unit OutOfService
- Calibration expired

The planner must not need to open multiple master-data pages to understand a blocked candidate.

Provide an icon link to Equipment detail.

Do not expose raw UUIDs.

11. Work Order guards

Before committing resource allocation:

rerun Equipment readiness
lock the relevant resource scope
detect capacity conflicts
reject stale state
snapshot readiness facts and IDs
record warnings and blocking errors
write allocation, reservation, audit, and outbox atomically

Before Work Order approval/release:

revalidate all committed allocations
block when any mandatory Equipment is no longer ready
distinguish retryable dependency failure from deterministic business rejection

Before starting an Operation:

verify the allocated Equipment/Machine Unit is still usable
apply the confirmed runtime policy for maintenance, calibration, fault, hold, and connectivity
do not silently substitute another Equipment without an explicit reallocation transaction
12. Event and projection flow

Audit whether Equipment and Machine Unit state changes are event-driven.

If new readiness facts are added:

publish versioned events from the owning service
persist source change and outbox atomically
update Execution rm_* projections idempotently
preserve event IDs
handle duplicate and out-of-order events
expose projection lag or stale state as Unknown, not Ready

Do not create cross-database foreign keys or direct cross-service database reads.

13. Migration strategy

Use additive forward-only migrations.

Required process:

Audit current data.
Add only proven missing structures.
Backfill only deterministic values.
Do not invent calibration or maintenance states for legacy Equipment.
Mark unresolved state as Unknown.
Update backend with compatibility support.
Populate projections.
Verify runtime.
Enforce constraints only after clean validation.

Do not overwrite historical Work Order allocation snapshots.

14. Seed and verification

Extend the existing guarded MES seed/reset workflow where appropriate.

Do not create a competing reset script.

Seed at least:

one Ready Equipment candidate
one candidate blocked by calendar/capacity
one candidate blocked by operational status
one Machine Unit unavailable case
maintenance/calibration cases only if those capabilities are implemented

Add or extend an API verification script covering:

Create or identify Equipment and Machine Units.
Create effective Resource Assignment.
Create matching Resource Capability.
Create Resource Calendar availability.
Request readiness.
Verify Ready result.
Create a blocking state.
Verify stable blocking code.
Restore state in finally.
Create a Work Order.
Load resource candidates.
Commit the Ready candidate.
Verify allocation and capacity reservation.
Revalidate.
Verify blocked Equipment cannot be committed.
Verify detail/list readiness projections.
15. Required tests
inactive Equipment is blocked
OutOfService Machine Unit is blocked
missing assignment is blocked
capability denial is blocked
lot-size mismatch is blocked
missing calendar follows the confirmed warning/blocking policy
PlannedDown/Holiday is blocked
overlapping committed reservation is blocked
stale operational state returns Unknown or Blocked according to policy
maintenance-blocked Equipment is rejected, if implemented
expired calibration is rejected, if implemented
Ready candidate can be allocated
allocation revalidation detects later state changes
historical Work Orders remain unchanged
frontend renders each readiness state
list endpoint avoids N+1 requests
all VI/EN/JA/KO translations pass the static scan
16. Constraints

Do not:

add unrelated Equipment fields
duplicate CMMS/QMS ownership
store high-frequency runtime state directly in slow-changing master records without justification
treat missing readiness data as Ready
bypass capability, calendar, or capacity checks
mutate Routing during Work Order planning
rewrite immutable Work Order snapshots
trust frontend readiness decisions
create a second resource-planning engine
create a second seed/reset workflow
claim success from compilation alone
17. Deliverables
current Equipment Readiness audit report
proposed target architecture with ownership decisions
approved schema/API delta
updated readiness service
updated events and Execution projections
improved MES Console Equipment list/detail
improved Work Order candidate diagnostics
migration and compatibility plan
updated guarded seed data
API verification script
full runtime verification report
updated ERD and AI_CONTEXT.md containing only implemented and verified facts
18. Acceptance criteria

The work is complete only when:

planners can see whether Equipment is Ready, Warning, Blocked, or Unknown
every status includes human-readable reasons
Equipment detail exposes assignment, capability, calendar, Machine Units, current allocation, and supported compliance state
Work Order candidate selection uses backend-owned readiness
allocation and approval revalidate current Equipment readiness
runtime state changes can invalidate stale allocations
missing data never silently passes
historical Work Orders remain immutable
no unrelated fields or duplicate ownership are introduced
builds, migrations, API checks, UI verification, and full WO resource-allocation tests pass