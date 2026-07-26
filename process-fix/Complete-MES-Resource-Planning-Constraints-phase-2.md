# Phase 2 — Complete MES Resource Planning Constraints

## Role

Act as a senior MES domain architect, production-planning engineer, database engineer, backend engineer, frontend engineer, and QA engineer.

Phase 1 completed the resource master-data hierarchy:

```text
Site
→ Production Area
→ Work Center
→ Workstation
→ Equipment
→ Effective-dated Resource Assignment

Phase 2 must complete the planning constraints that determine whether a resource is eligible and available to execute a Routing Operation.

This phase must implement:

Resource Capability
Resource Calendar
Equipment-specific and Work Center-level Production Standards
Operation Skill Requirements
Planning-readiness validation and candidate-resource evaluation

Do not implement automatic finite-capacity scheduling or final Work Order machine allocation yet. Phase 2 prepares and validates the data required by those later workflows.

Read and follow:

product-doc/IV-RESOURCES & CAPABILITIES CATALOG.md
Routing and Production Standard catalogs
Current AI_CONTEXT.md
Phase 1 implementation report
Running source code, migrations, APIs, tests, service manifests, and Docker runtime

The running implementation is the source of truth. Do not assume that a documented schema is already complete.

1. Phase Goal

After Phase 2, the MES must be able to answer:

Can this Work Center or Equipment execute this Product Revision and Operation?

Is the requested lot size valid for this resource?

What priority and speed adjustment should be applied?

Is the resource available on the planned date and shift?

Which Production Standard applies?

How many qualified workers are required?

Target planning model:

Routing Operation
        │
        ▼
Default Work Center
        │
        ▼
Effective Resource Assignments
        │
        ▼
Resource Capability
        │
        ▼
Resource Calendar
        │
        ▼
Production Standard
        │
        ▼
Operation Skill Requirements
        │
        ▼
Eligible Resource Candidates
2. Audit the Existing Implementation

Inspect:

MD_RESOURCE_CAPABILITY
MD_RESOURCE_CALENDAR
MD_PRODUCTION_STANDARD
MD_SKILL
MD_OPERATION_SKILL_REQUIREMENT
Work Center, Workstation, Equipment, and Resource Assignment schemas
Routing Operation schema
Shift and Employee Schedule schemas
Existing master-data CRUD registry
Validation engine
Production Version validation
Work Order Compute & Check
MES Console resource-related routes
Seed data
Outbox events
Existing implementation reports

Classify every target area as:

IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_BUT_NOT_TESTED
PARTIALLY_IMPLEMENTED
MISSING
AMBIGUOUS

Do not create duplicate tables or endpoints when partial implementations already exist.

3. Implement Resource Capability

Resource Capability defines which Work Center or Equipment may execute a Product Revision or Item Group for a specific Operation.

Required target model:

interface ResourceCapability {
  capabilityId: string;

  siteId: string;

  productRevisionId?: string;
  itemGroup?: string;

  operationId: string;
  workCenterId: string;
  equipmentId?: string;

  eligibility: boolean;
  priorityNo: number;
  speedFactor: number;

  minLotSize?: number;
  maxLotSize?: number;

  setupFamily?: string;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

Required validation:

At least one of productRevisionId or itemGroup is required.
operationId is required.
Work Center must be active and belong to the selected Site.
Equipment, when provided, must belong to the Work Center through an effective Resource Assignment.
Equipment and Work Center must belong to the same Site.
Equipment must have planningResourceFlag = true for planning eligibility.
priorityNo > 0.
speedFactor > 0.
minLotSize > 0 when provided.
maxLotSize >= minLotSize.
effectiveTo > effectiveFrom.
Inactive capability records are not eligible for new plans.
Capability effective ranges must be evaluated against the requested production date.
Duplicate or conflicting active capability ranges must be detected.

Do not use frontend-only validation for relationship or effective-date rules.

4. Capability Resolution Rules

Implement and document deterministic resolution.

Recommended precedence:

1. Product Revision + Operation + Equipment
2. Product Revision + Operation + Work Center
3. Item Group + Operation + Equipment
4. Item Group + Operation + Work Center

More specific rules override broader rules.

An explicit capability with:

eligibility = false

must be able to deny a resource even when a broader capability allows it.

Candidate ordering:

Eligibility
→ Specificity
→ PriorityNo
→ Equipment planning status
→ SpeedFactor
→ Stable business-code tie-breaker

Do not return nondeterministic candidate ordering.

5. Resource Capability UX

Required routes:

/master-data/resource-capabilities
/master-data/resource-capabilities/new
/master-data/resource-capabilities/:id
/master-data/resource-capabilities/:id/edit

Required list columns:

Product Revision or Item Group
Operation
Work Center
Equipment, when specific
Eligibility
Priority
Speed factor
Lot-size range
Setup family
Effective period
Status

Use localized name as primary and business code as secondary.

Examples:

Automotive Engine Mount R1
FG-WS-CM01-R1
Molding and Vulcanization
OP-MOLD
Molding Press 01
EQ-MOLD-01 · Toyo TM-500

Do not expose UUIDs.

Add a matrix or grouped view where practical:

Product / Operation
×
Work Center / Equipment

A normal table must remain available for editing and auditing.

6. Implement Resource Calendar

Resource Calendar defines availability for:

Work Center
Workstation
Equipment

Required target model:

interface ResourceCalendar {
  resourceCalendarId: string;

  siteId: string;
  resourceType: "WorkCenter" | "Workstation" | "Equipment";
  resourceId: string;

  calendarDate: string;
  shiftId: string;

  availabilityStatus:
    | "Available"
    | "PlannedDown"
    | "Holiday";

  availableMinutes: number;
  capacityFactor: number;

  reasonId?: string;
  note?: LocalizedText;

  createdAt: string;
  updatedAt: string;
}

Required validation:

Unique [resourceType + resourceId + calendarDate + shiftId].
Resource must exist and belong to the selected Site.
Shift must belong to the same Site.
availableMinutes >= 0.
capacityFactor >= 0.
PlannedDown or Holiday normally produces zero availability unless a documented partial-availability rule exists.
Reason Code must have an appropriate category when used.
Inactive resources cannot receive new future availability records without explicit administrative override.
Long-term performance changes belong in Production Standard, not Calendar.
7. Calendar Inheritance and Resolution

Define a clear resolution policy.

Recommended hierarchy:

Equipment calendar
    overrides
Workstation calendar
    overrides
Work Center calendar
    falls back to
Site/default shift availability

Do not add available minutes from multiple hierarchy levels.

A more specific calendar record overrides the broader level for the same date and shift.

Example:

Work Center: Available 450 min
Equipment: PlannedDown 0 min

Result for that Equipment:

Unavailable

Document behavior when no calendar exists:

Blocking missing configuration, or
Advisory fallback to default Shift

The severity must be backend-owned and configurable where possible.

8. Resource Calendar UX

Required routes:

/master-data/resource-calendars
/master-data/resource-calendars/new
/master-data/resource-calendars/:id
/master-data/resource-calendars/:id/edit

Required views:

Calendar month view
Table view
Resource filter
Resource-type filter
Shift filter
Availability-status filter
Site filter

Calendar cells should show:

Available
Planned down
Holiday
Available minutes
Capacity factor
Reason

Support bulk creation for:

Date ranges
Repeated shifts
Planned maintenance windows
Holidays

Require confirmation before overwriting existing calendar records.

Do not mix Resource Calendar with Employee Schedule.

Clearly explain:

Shift
= Standard working-time definition

Resource Calendar
= Resource availability for a date and shift

Employee Schedule
= Employee attendance or assignment to a shift
9. Complete Production Standard Resource Support

Audit the existing Production Standard implementation.

Required target model:

interface ProductionStandard {
  standardId: string;

  siteId: string;
  productRevisionId: string;
  routingOperationId: string;

  workCenterId: string;
  equipmentId?: string;

  baseQuantity: number;
  setupTimeMin: number;
  cycleTimeSec: number;
  laborCount: number;

  standardYield: number;
  efficiencyFactor: number;

  sourceMethod:
    | "Engineering"
    | "TimeStudy"
    | "HistoricalApproved";

  sampleSize?: number;

  validFrom: string;
  validTo?: string;
  reviewDueDate?: string;

  status:
    | "Draft"
    | "InReview"
    | "Released"
    | "Obsolete";
}

Required validation:

Product Revision must match the Routing Operation context.
Work Center must match or be compatible with the Routing Operation.
Equipment, when provided, must be effectively assigned to the Work Center.
Equipment must have a valid capability for the Product/Operation.
baseQuantity > 0.
setupTimeMin >= 0.
cycleTimeSec > 0.
laborCount > 0.
standardYield > 0.
efficiencyFactor > 0.
Only Released/effective standards are used in planning.
Released standard core fields are immutable.
Only one effective standard is allowed per:
Product Revision
Routing Operation
Work Center
Optional Equipment
Effective period

Resolution precedence:

Equipment-specific standard
→ Work Center standard

Never silently average multiple standards.

10. Production Standard UX Improvements

Update the existing Production Standard screen to show:

Product Revision
Routing and Operation
Work Center
Equipment, when specific
Base quantity
Setup time
Cycle time
Labor count
Yield
Efficiency
Source method
Effective period
Review due date
Lifecycle status

Create a clear comparison view:

Work Center Standard
vs
Equipment-specific Standard

Show an explicit badge:

Applied by planning

only when the backend confirms the current effective standard.

11. Implement Operation Skill Requirements

Required target model:

interface OperationSkillRequirement {
  requirementId: string;

  siteId: string;
  routingOperationId: string;
  skillId: string;

  minimumLevel: string;
  requiredPersons: number;
  mandatoryFlag: boolean;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

Required validation:

Routing Operation exists.
Skill is active.
Skill belongs to the correct Site scope where applicable.
requiredPersons > 0.
Minimum level must exist in the Skill level scale.
Effective dates must be valid.
Duplicate active requirements for the same operation and skill must be prevented.
Inactive requirements are ignored for new planning checks.
12. Skill Requirement UX

Required routes:

/master-data/operation-skill-requirements
/master-data/operation-skill-requirements/new
/master-data/operation-skill-requirements/:id
/master-data/operation-skill-requirements/:id/edit

Also expose requirements inside Routing Operation detail.

Display:

Routing
Operation sequence
Operation name/code
Skill name/code
Minimum level
Required persons
Mandatory/advisory state
Effective period
Status

Use a compact requirement summary:

2 × Molding Machine Operation · Level L2 or higher
Mandatory
13. Planning Readiness Validation API

Create or extend a backend-owned validation endpoint that evaluates planning configuration without allocating a machine.

Suggested endpoint:

POST /api/mes/master-data/resource-planning/readiness

Example request:

{
  "site_id": "uuid",
  "product_revision_id": "uuid",
  "routing_operation_id": "uuid",
  "work_center_id": "uuid",
  "quantity": 500,
  "planned_date": "2026-08-05",
  "shift_id": "uuid"
}

Example response:

{
  "status": "Ready",
  "work_center": {
    "id": "uuid",
    "code": "WC-MOLD",
    "name": {
      "vi": "Cụm ép lưu hóa",
      "en": "Molding Work Center"
    }
  },
  "candidates": [
    {
      "workstation": {
        "id": "uuid",
        "code": "WS-MOLD-01",
        "name": {
          "vi": "Trạm ép số 01",
          "en": "Molding Station 01"
        }
      },
      "equipment": {
        "id": "uuid",
        "code": "EQ-MOLD-01",
        "name": {
          "vi": "Máy ép Toyo số 01",
          "en": "Toyo Molding Press 01"
        }
      },
      "assignment": {
        "id": "uuid",
        "role": "Primary"
      },
      "capability": {
        "id": "uuid",
        "priority_no": 1,
        "speed_factor": 0.95
      },
      "calendar": {
        "availability_status": "Available",
        "available_minutes": 450,
        "capacity_factor": 0.9
      },
      "production_standard": {
        "id": "uuid",
        "level": "Equipment",
        "setup_time_min": 20,
        "cycle_time_sec": 12,
        "labor_count": 2
      },
      "skill_requirements": [],
      "estimated_duration_min": 132,
      "readiness": "Eligible",
      "warnings": []
    }
  ],
  "blocking_errors": [],
  "warnings": []
}

The endpoint must not persist a WO allocation.

It is a validation and candidate-projection API only.

14. Candidate Evaluation Flow

Implement this sequence:

1. Read Routing Operation and default Work Center.
2. Verify Work Center is active and in the correct Site.
3. Read effective Resource Assignments.
4. Resolve Workstations and Equipment.
5. Exclude inactive or expired assignments.
6. Exclude assignments with schedulingFlag = false.
7. Exclude inactive Equipment.
8. Exclude Equipment with PlanningResourceFlag = false.
9. Exclude Maintenance or OutOfService Equipment.
10. Resolve Resource Capability.
11. Apply eligibility and lot-size rules.
12. Resolve Resource Calendar.
13. Resolve Equipment-specific Production Standard.
14. Fall back to Work Center Production Standard.
15. Read Operation Skill Requirements.
16. Calculate estimated duration.
17. Return deterministic candidate ranking.

Do not persist the selected candidate in this phase.

15. Estimated Duration Calculation

Define and test one explicit formula.

Conceptual example:

Adjusted cycle time
=
cycleTimeSec
÷ capabilitySpeedFactor
÷ productionStandardEfficiency
÷ equipmentDefaultEfficiency
÷ calendarCapacityFactor

Then:

Run duration
=
(quantity ÷ baseQuantity)
× adjusted cycle time

Total duration:

setup time
+ run duration
+ routing queue time
+ routing move time

Do not apply the same efficiency factor twice.

Document all units and rounding behavior.

Use decimal-safe arithmetic.

Return calculation details for diagnostics.

16. Readiness Severity

Use backend-owned status levels:

Ready
ReadyWithWarnings
Blocked

Possible blocking errors:

No effective assignment
No eligible capability
Lot size outside allowed range
Equipment inactive
Equipment OutOfService
Calendar unavailable
No effective Production Standard
Invalid resource relationship
Mandatory Skill Requirement invalid

Possible warnings:

Work Center-level standard used because no equipment standard exists
Calendar fallback used
Resource is Alternate rather than Primary
Capacity is insufficient for the requested period
Skill availability cannot yet be proven from employee schedules

Do not let the frontend decide severity.

17. Database Migration and Existing Data

Create forward-only migrations.

Required behavior:

Inspect current tables and columns.
Add only missing fields.
Preserve existing IDs and references.
Backfill effective dates where safe.
Preserve Released Production Standards.
Add indexes for capability and calendar resolution.
Add effective-range and uniqueness constraints.
Detect conflicting legacy records.
Record unresolved data-quality gaps.
Do not fabricate capabilities, calendars, or standards.

For missing configuration, report it as missing rather than generating fake production readiness.

18. Events and Outbox

Inspect current events for Production Standards and resources.

Potential events:

MES.MasterData.ResourceCapabilityActivated.v1
MES.MasterData.ResourceCalendarChanged.v1
MES.MasterData.OperationSkillRequirementChanged.v1

Add events only when there is a clear consumer or architectural need.

Released Production Standard lifecycle changes must continue using the transactional outbox.

Do not add event noise for every simple draft edit unless required.

Preserve schema compatibility.

19. MES Console Navigation

Recommended grouping:

RESOURCES & CAPABILITIES

Factory Structure
- Production Areas
- Work Centers
- Workstations

Physical Resources
- Equipment
- Resource Assignments

Planning Configuration
- Resource Capabilities
- Production Standards
- Resource Calendars

Labor Qualification
- Skills
- Operation Skill Requirements

Use existing routes and redirect compatibility where necessary.

20. Required Use Cases
UC-01 — Work Center capability

Create a capability at Work Center level.

Expected:

All effective eligible Equipment in the Work Center may inherit it.
UC-02 — Equipment-specific capability

Create a more specific Equipment capability.

Expected:

It overrides the Work Center-level capability for that Equipment.
UC-03 — Explicit denial

Create an equipment-specific capability with eligibility = false.

Expected:

That Equipment is excluded despite a broader Work Center allowance.
UC-04 — Priority ordering

Create two eligible Equipment candidates with different priorities.

Expected:

Lower priorityNo appears first.
UC-05 — Lot-size rejection

Request a quantity outside capability limits.

Expected:

Candidate is blocked with a stable error.
UC-06 — Assignment expired

Capability exists, but assignment is no longer effective.

Expected:

Equipment is excluded.
UC-07 — Equipment under maintenance

Equipment is assigned and capable but has ExecutionStatus = Maintenance.

Expected:

Equipment is excluded.
UC-08 — Equipment calendar override

Work Center is available but Equipment is PlannedDown.

Expected:

Equipment is unavailable.
UC-09 — Work Center calendar fallback

No Equipment calendar exists.

Expected:

Work Center calendar is used according to the documented policy.
UC-10 — Equipment Production Standard

Equipment-specific standard exists.

Expected:

Equipment standard is selected.
UC-11 — Work Center Production Standard fallback

No equipment-specific standard exists.

Expected:

Work Center standard is selected and a fallback warning is returned.
UC-12 — Missing Production Standard

No effective standard exists.

Expected:

Candidate is blocked.
UC-13 — Mandatory skill requirement

Operation requires two operators with Skill L2.

Expected:

Requirement is returned in readiness details.
Do not claim employee availability unless employee scheduling is actually evaluated.
UC-14 — Calendar uniqueness

Attempt duplicate resource/date/shift calendar entry.

Expected:

Backend rejects it.
UC-15 — Cross-site capability

Attempt to connect Equipment and Work Center from different Sites.

Expected:

Backend rejects it.
UC-16 — Deterministic candidate order

Run the same request repeatedly.

Expected:

Candidate ordering remains stable.
21. Testing Requirements
Migration tests
Existing records preserved
New fields added safely
Effective-date constraints work
Calendar uniqueness works
Capability conflict validation works
No foreign keys are broken
Released standards remain valid
Backend tests
Capability CRUD
Capability resolution precedence
Explicit deny behavior
Lot-size rules
Assignment effective-date checks
Equipment planning/status checks
Calendar inheritance
Production Standard precedence
Skill Requirement validation
Readiness response
Stable error codes
Deterministic candidate ranking
Duration calculation
Decimal precision
Frontend tests
Capability routes and forms
Calendar views and bulk actions
Production Standard enriched fields
Skill Requirement routes
Name-primary/code-secondary display
No UUID display
Localized validation messages
Empty and error states
Light/dark themes
Keyboard access
Page guide content
Integration tests

Run:

Create Capability
→ Create Calendar
→ Create Equipment Standard
→ Create Skill Requirement
→ Call Planning Readiness
→ Verify eligible candidate
→ Change Equipment to Maintenance
→ Verify candidate exclusion
→ Restore Equipment
→ Mark Calendar PlannedDown
→ Verify unavailability
22. Mandatory Console Test Script

Create:

scripts/test-mes-resource-planning-constraints.sh

or a TypeScript equivalent.

The script must:

Check service health.
Create isolated test data with a unique test-run ID.
Create Work Center, Workstation, Equipment, and Assignment when required.
Create capabilities.
Create calendars.
Create Production Standards.
Create Skill Requirements.
Call the readiness endpoint.
Execute all supported use cases.
Print PASS, FAIL, or SKIPPED_WITH_DOCUMENTED_GAP.
Exit non-zero on failure.
Clean up test-created mutable data safely.
Preserve immutable lifecycle/audit data according to domain rules.
Refuse destructive cleanup outside development/test environments.

Do not silently omit unsupported cases.

23. Runtime Verification

After implementation:

Apply migrations.
Build MES master-data service.
Build MES Console.
Run backend and frontend tests.
Rebuild and recreate affected containers.
Verify health endpoints.
Probe capability APIs.
Probe calendar APIs.
Probe Production Standard APIs.
Probe Skill Requirement APIs.
Run readiness checks.
Run the console test script.
Review VI and EN UI.
Verify no UUIDs are displayed.
Inspect logs and outbox behavior.
Record browser-review status explicitly.
24. Required Implementation Report

Create:

implementation-fix/mes-resource-planning-constraints-phase-2.md

Include:

Phase goal
Existing implementation audit
Previous and new schemas
Migration details
Capability precedence
Calendar inheritance
Production Standard precedence
Skill Requirement behavior
Readiness endpoint
Duration formula
Error and warning taxonomy
API contracts
UI routes
Tests
Console script
Cleanup results
Docker/runtime verification
Browser verification
Remaining Phase 3 dependencies

Clearly state that Phase 2 does not implement:

Persistent WO resource allocation
Automatic finite-capacity scheduling
Machine reservation
Operator assignment
Kiosk enforcement
Actual Equipment confirmation
OEE calculation
25. Acceptance Criteria

Phase 2 is complete only when:

Resource Capability is a first-class managed entity.
Capability supports Product Revision or Item Group scope.
Equipment-specific capability overrides Work Center capability.
Explicit deny rules are respected.
Effective assignments are required for Equipment eligibility.
Equipment planning and execution states are checked.
Lot-size restrictions are enforced.
Resource Calendar supports Work Center, Workstation, and Equipment.
Calendar inheritance is deterministic.
Production Standards support Equipment-specific and Work Center levels.
Equipment-specific standards take precedence.
Operation Skill Requirements are manageable.
Planning readiness returns deterministic eligible candidates.
Readiness returns backend-owned blocking errors and warnings.
No resource allocation is persisted in this phase.
Existing IDs and relationships remain intact.
All business identities use localized names and codes, never UUIDs.
Migrations, tests, builds, Docker runtime checks, API probes, and the console script pass.
Unsupported behavior is reported, not simulated.
The implementation report records all verification gaps and remaining Phase 3 work.