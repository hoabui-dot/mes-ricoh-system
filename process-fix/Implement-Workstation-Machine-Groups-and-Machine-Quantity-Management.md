# Implement Workstation Machine Groups and Machine Quantity Management

## Role

Act as a senior MES domain architect, database engineer, backend engineer, frontend engineer, and QA engineer.

The current Workstation form allows selecting only one Machine. This is insufficient for real manufacturing execution because one Workstation may contain multiple machine combinations.

Implement support for:

- One Workstation containing one or more Machine Groups
- Each Machine Group containing one or more Machines
- Exactly one Primary Machine in each group
- Zero or more Supporting Machines in each group
- Required Machine quantity in Machine CRUD
- Effective-dated assignment history
- Planning-readiness and Work Order allocation compatibility

Do not solve this only by changing the frontend selector to multi-select. The database model, validation, assignment rules, readiness engine, and Work Order allocation flow must be audited and updated consistently.

---

# 1. Target Domain Model

Use this hierarchy:

```text
Factory
└── Shopfloor
    └── Work Center
        └── Workstation
            └── Machine Group
                ├── Primary Machine
                └── Supporting Machine(s)

Example:

Workstation: Hydraulic Press Station 01

Machine Group: 500-Ton Press Combination
├── 500-Ton Press #01 — Primary
└── 500-Ton Press #02 — Supporting

Machine Group: 300-Ton Press Combination
├── 300-Ton Press #01 — Primary
├── 300-Ton Press #02 — Supporting
└── 300-Ton Press #03 — Supporting

A Workstation must contain at least one active Machine Group.

A Machine Group must contain:

Exactly one Primary Machine
Zero or more Supporting Machines

A group containing only one Primary Machine is valid.

2. Clarify Machine Quantity Semantics

The Machine create/edit form must require:

Quantity >= 1

However, do not represent multiple independently operated physical machines as only one database row with a quantity number when those machines require separate:

Serial numbers
Execution status
Maintenance status
Resource Calendar
Resource Capability
Production Standard
OEE
Work Order allocation
Assignment history

Audit the existing Equipment/Machine model and choose the correct implementation.

Preferred model

Use:

Machine Master / Machine Type
→ Physical Machine Units

Example:

Machine Master:
500-Ton Hydraulic Press
Quantity: 2

Generated or created physical units:
MC-20260725-0001-01
MC-20260725-0001-02

Suggested structure:

interface MachineMaster {
  machineId: string;
  machineCode: string;
  machineName: LocalizedText;

  machineType: string;
  manufacturer?: string;
  model?: string;

  quantity: number;

  planningResourceFlag: boolean;
  defaultEfficiency: number;
  status: "Active" | "Inactive";
}
interface MachineUnit {
  machineUnitId: string;
  machineId: string;

  unitCode: string;
  unitSequence: number;

  serialNumber?: string;

  executionStatus:
    | "Available"
    | "Maintenance"
    | "OutOfService";

  status: "Active" | "Inactive";
}

If the existing Equipment table already represents a physical machine unit, preserve it as the physical-unit table and introduce a lightweight Machine Master or Machine Type parent.

Do not destroy existing Equipment IDs or historical references.

Compatibility fallback

If the repository architecture cannot introduce physical units in this phase, implement quantity as an explicit capacity count only after documenting that:

Individual units do not have independent serial numbers
Individual units cannot be allocated separately
Maintenance affects the entire quantity
Calendar and OEE apply to the whole record

This fallback must be documented as a limitation. Do not silently treat one row with quantity three as three independently schedulable machines.

3. Introduce Workstation Machine Group

Create a first-class Workstation Machine Group entity.

Suggested model:

interface WorkstationMachineGroup {
  machineGroupId: string;

  siteId: string;
  shopfloorId: string;
  workCenterId: string;
  workstationId: string;

  groupCode: string;
  groupName: LocalizedText;
  description?: LocalizedText;

  groupType?: string;

  minimumRequiredMachines: number;
  maximumConcurrentJobs: number;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

Example generated codes:

MG-20260725-0001
MG-20260725-0002

Generate codes on the backend using the existing atomic numbering service.

The code must be read-only in the UI.

4. Machine Group Membership

Create a membership entity.

Suggested model:

interface WorkstationMachineGroupMember {
  memberId: string;

  machineGroupId: string;
  machineId: string;
  machineUnitId?: string;

  role: "Primary" | "Supporting";

  sequenceNo: number;

  schedulingFlag: boolean;
  oeeAggregationFlag: boolean;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

If the existing Resource Assignment table can safely represent this membership, extend it rather than creating duplicate assignment semantics.

Possible extension:

Resource Assignment
+ machine_group_id
+ machine_unit_id
+ role

Preserve effective-date history.

5. Mandatory Business Rules

Enforce these rules in the backend and database where practical.

Group rules
A Workstation must have at least one active Machine Group.
A Machine Group belongs to exactly one Workstation.
A Machine Group must contain at least one Machine.
A Machine Group must contain exactly one active Primary Machine.
A Machine Group may contain zero or more Supporting Machines.
The same physical Machine Unit cannot appear twice in the same active group.
minimumRequiredMachines >= 1.
minimumRequiredMachines <= active member count.
Effective end must be later than effective start.
Inactive groups cannot be used for new Work Order allocations.
Machine rules
Machine quantity is required.
Machine quantity must be an integer.
Machine quantity must be at least 1.
Reducing quantity must not remove units with:
Active assignment
Allocation history
Resource Calendar
Production Standard
Capability
Maintenance history
OEE history
A Machine or Machine Unit must be active before it can become a group member.
OutOfService units cannot be added to a new active group.
A Machine Unit cannot have overlapping Primary membership in multiple Workstations.
Supporting membership overlap must follow an explicit policy and must not be silently allowed.
Hierarchy rules

All members must belong to the same hierarchy:

Factory
→ Shopfloor
→ Work Center
→ Workstation
→ Machine Group

Do not ask the frontend to independently submit Factory, Shopfloor, and Work Center when those values can be derived from the Workstation.

6. Primary and Supporting Semantics

Define roles explicitly.

Primary Machine

The Primary Machine:

Is the principal machine representing the group
Is the default machine used for planning and allocation
Determines the group’s main execution identity
Is mandatory
Must be unique within the active effective period
Supporting Machine

A Supporting Machine:

Assists the Primary Machine
May be mandatory or optional depending on group configuration
Must not automatically become an independent Work Order candidate
May contribute to OEE aggregation when oeeAggregationFlag = true
May require availability validation before group allocation

Do not treat Supporting Machines as equivalent alternative candidates unless an explicit replacement policy is defined.

7. Add Required-Member Behavior

Support both required and optional supporting members.

Extend the member model if necessary:

interface WorkstationMachineGroupMember {
  role: "Primary" | "Supporting";
  requirement: "Required" | "Optional";
}

Example:

500-Ton Press Combination

Primary:
- Press #01 — Required

Supporting:
- Press #02 — Required

Another example:

Packaging Cell

Primary:
- Packing Machine #01 — Required

Supporting:
- Label Printer #01 — Required
- Backup Label Printer #02 — Optional

Planning must distinguish:

Required supporting machine unavailable
→ Group blocked

Optional supporting machine unavailable
→ Warning only
8. Update Machine CRUD

Update the Machine create form to include:

Read-only generated code
Localized name
Localized description
Machine type
Manufacturer
Model
Required quantity
Optional serial-number strategy
Planning resource switch
Default efficiency
Active switch

Validation:

Quantity is required.
Quantity must be a whole number.
Quantity must be at least 1.

Use a shadcn numeric input component.

Example:

Quantity *
[ 3 ]

Three physical machine units will be available for assignment.

When quantity is greater than one, provide a unit-management section.

Example:

Physical Units

#1  MC-20260725-0001-01  Serial Number [________]  Available
#2  MC-20260725-0001-02  Serial Number [________]  Available
#3  MC-20260725-0001-03  Serial Number [________]  Available

Do not require a single shared serial number for several physical machines.

9. Machine Quantity Update Behavior

When quantity increases:

Current quantity: 2
New quantity: 4

Create two additional physical units safely.

When quantity decreases:

Current quantity: 4
New quantity: 2

Show which units will be retired.

The backend must reject reduction when selected units are referenced.

Stable error examples:

MACHINE_QUANTITY_BELOW_ONE
MACHINE_UNIT_REFERENCED
MACHINE_UNIT_ACTIVE_ASSIGNMENT
MACHINE_UNIT_ACTIVE_ALLOCATION
MACHINE_UNIT_CANNOT_BE_REMOVED

Prefer deactivation/retirement over physical deletion when history exists.

10. Redesign the Workstation Form

Replace the current single-Machine selector.

Current incorrect flow:

Machine
[ Single select ]

Required flow:

Machine Groups *

The user must be able to:

Add one or more groups
Name each group
Select one Primary Machine
Select zero or more Supporting Machines
Configure required/optional supporting members
Reorder groups
Remove an unsaved group
Edit existing group membership
View derived hierarchy
Set active status

Example UI:

Machine Groups *

┌──────────────────────────────────────────────────────┐
│ 500-Ton Press Combination                           │
│                                                      │
│ Primary Machine *                                    │
│ [ 500-Ton Press #01                              ▼ ] │
│                                                      │
│ Supporting Machines                                  │
│ [✓] 500-Ton Press #02      Required [on]             │
│                                                      │
│ Minimum available machines                           │
│ [ 2 ]                                                │
│                                                      │
│                                      [Remove Group]  │
└──────────────────────────────────────────────────────┘

[ + Add Machine Group ]

Second group:

┌──────────────────────────────────────────────────────┐
│ 300-Ton Press Combination                           │
│                                                      │
│ Primary Machine *                                    │
│ [ 300-Ton Press #01                              ▼ ] │
│                                                      │
│ Supporting Machines                                  │
│ [✓] 300-Ton Press #02      Required [on]             │
│ [✓] 300-Ton Press #03      Required [on]             │
└──────────────────────────────────────────────────────┘

Use shadcn components:

Card
Form
Select or searchable Combobox
Command
Popover
Switch
Button
Badge
AlertDialog
Collapsible
Tooltip

Do not use a basic native multi-select.

11. Machine Selection Filtering

Machine selection must only show eligible machines.

Filter by:

Active status
Execution status
Current effective assignments
Same Factory hierarchy
Machine type, where configured
Available physical quantity/units
Existing Primary membership conflicts

Each option should show:

500-Ton Press #01
MC-20260725-0001-01 · Available

Unavailable items may be shown as disabled with a reason:

500-Ton Press #02
Already Primary in Workstation WS-004

Do not show UUIDs.

12. Workstation Detail Page

Display Machine Groups clearly.

Example:

Machine Groups

500-Ton Press Combination
Primary
- 500-Ton Press #01

Supporting
- 500-Ton Press #02

Status: Active
Effective from: 25 Jul 2026
300-Ton Press Combination
Primary
- 300-Ton Press #01

Supporting
- 300-Ton Press #02
- 300-Ton Press #03

Provide actions:

View group
Edit membership
Replace Primary Machine
Add Supporting Machine
Remove Supporting Machine
End group assignment
View assignment history

Changes to effective assignments must preserve history.

13. Workstation Create Transaction

Creating a Workstation with groups must be atomic.

Required workflow:

Create Workstation
→ Create Machine Groups
→ Create Group Memberships / Resource Assignments
→ Validate exactly one Primary per group
→ Commit

If any group or member fails:

Rollback the whole create operation

Do not create an empty Workstation when its required machine-group transaction fails.

14. Workstation Edit Behavior

When editing:

Existing active group membership must not be overwritten destructively.
Removed members must be ended using effectiveTo.
Replaced Primary Machines must preserve the previous assignment history.
New members must receive new effective-dated records.
Group deletion must be blocked when referenced by active Work Order allocations.
A Workstation must not end with zero active Machine Groups.

Use optimistic concurrency/version validation.

15. Resource Assignment Integration

Update Resource Assignment to support Machine Groups.

Recommended flow:

Select Workstation
→ Select Machine Group
→ Select Machine or Machine Unit
→ Select role
→ Select requirement type
→ Effective period

Derived read-only context:

Factory
Shopfloor
Work Center
Workstation

Do not independently select Site or Work Center after Workstation is selected.

For existing assignments without a Machine Group:

Preserve them as legacy assignments.
Create a safe migration plan.
Where deterministic, migrate one existing Workstation/Machine relationship into a default Machine Group.
Do not guess complex group combinations.

Suggested default group for deterministic single-machine legacy data:

Default Machine Group
Primary: existing assigned Machine
16. Planning Readiness Changes

Update Phase 2 readiness.

Current model resolves individual Equipment candidates.

New model must support group candidates.

Candidate result should include:

{
  "machine_group": {
    "id": "uuid",
    "code": "MG-20260725-0001",
    "name": {
      "en": "500-Ton Press Combination"
    }
  },
  "primary_machine": {
    "id": "uuid",
    "code": "MC-20260725-0001-01"
  },
  "supporting_machines": [
    {
      "id": "uuid",
      "code": "MC-20260725-0001-02",
      "required": true,
      "readiness": "Available"
    }
  ]
}

Readiness sequence:

1. Resolve Workstation.
2. Resolve active Machine Groups.
3. Verify exactly one Primary member.
4. Verify Primary Machine assignment and status.
5. Verify required Supporting Machines.
6. Resolve Capability for the group or Primary Machine.
7. Resolve Calendar for all required members.
8. Resolve Production Standard.
9. Return eligible group candidates.

Blocking conditions:

NO_ACTIVE_MACHINE_GROUP
MACHINE_GROUP_NO_PRIMARY
MACHINE_GROUP_MULTIPLE_PRIMARY
PRIMARY_MACHINE_UNAVAILABLE
REQUIRED_SUPPORTING_MACHINE_UNAVAILABLE
MACHINE_GROUP_MEMBER_ASSIGNMENT_EXPIRED
MACHINE_GROUP_INSUFFICIENT_ACTIVE_MEMBERS

Optional supporting-machine failure should normally create a warning.

17. Work Order Allocation Changes

Update Phase 3 allocation snapshots and reservations.

The allocation must capture:

Machine Group
Primary Machine
Required Supporting Machines
Optional Supporting Machines selected

Suggested snapshot:

{
  "machine_group": {
    "id": "uuid",
    "code": "MG-20260725-0001"
  },
  "primary_machine": {
    "id": "uuid",
    "code": "MC-20260725-0001-01"
  },
  "supporting_machines": [
    {
      "id": "uuid",
      "code": "MC-20260725-0001-02",
      "required": true
    }
  ]
}

Capacity reservations must be created for:

Primary Machine
Every required Supporting Machine
Optional Supporting Machine when selected and used
Workstation
Work Center where applicable

Commit all reservations atomically.

If any required Machine has a capacity conflict, the group allocation must fail.

Do not reserve only the Primary Machine when required Supporting Machines are part of the combination.

18. Capability and Production Standard Scope

Audit whether Capability and Production Standard should apply to:

Machine Group
Primary Machine
Work Center

Recommended precedence:

Machine Group-specific
→ Primary Machine-specific
→ Work Center-level

Only introduce Machine Group-specific scope if required by the production process and supported by existing schemas.

Example:

The 500-ton combination may have a cycle time different from either machine alone.

Do not duplicate standards unnecessarily.

Document the selected resolution policy.

19. Machine Group API

Add APIs such as:

GET /api/mes/master-data/workstations/:id/machine-groups
POST /api/mes/master-data/workstations/:id/machine-groups
GET /api/mes/master-data/workstations/:id/machine-groups/:groupId
PATCH /api/mes/master-data/workstations/:id/machine-groups/:groupId
POST /api/mes/master-data/workstations/:id/machine-groups/:groupId/members
POST /api/mes/master-data/workstations/:id/machine-groups/:groupId/members/:memberId/end
POST /api/mes/master-data/workstations/:id/machine-groups/:groupId/replace-primary

A composite Workstation create/update endpoint may be used where it supports atomic persistence.

Return localized names and business codes.

Do not expose UUIDs as display labels.

20. Machine API Changes

Machine create request:

{
  "name": {
    "vi": "Máy ép 500 tấn",
    "en": "500-Ton Press"
  },
  "machine_type": "HydraulicPress",
  "manufacturer": "Toyo",
  "model": "HP-500",
  "quantity": 2,
  "planning_resource_flag": true,
  "default_efficiency": 0.95,
  "status": "Active"
}

Machine response should include:

{
  "code": "MC-20260725-0001",
  "quantity": 2,
  "available_unit_count": 2,
  "assigned_unit_count": 0,
  "units": []
}

Avoid large unit arrays in normal list APIs. Use a detail or units endpoint.

21. UI Validation

Required form messages:

At least one Machine Group is required.

Each Machine Group must have one Primary Machine.

A Machine cannot be both Primary and Supporting in the same group.

The selected Primary Machine is already assigned to another active Workstation.

Quantity is required.

Quantity must be at least 1.

The selected Machine does not have enough available physical units.

At least one machine must remain in the group.

All messages must exist in:

Vietnamese
English
Japanese
Korean
22. Migration Strategy

Create forward-only migrations.

Do not rewrite already applied migrations.

Required process:

Audit existing Workstation-to-Machine assignments.
Add Machine Group tables or extend Resource Assignment safely.
Add Machine quantity with a safe default of 1 only for existing records.
Add physical-unit records for existing single-machine records where the selected model requires them.
Create one default Machine Group for deterministic legacy Workstation assignments.
Mark existing assigned Machine as Primary.
Preserve IDs and assignment effective periods.
Do not fabricate Supporting Machine relationships.
Report ambiguous or overlapping legacy assignments.
Preserve Phase 2 readiness and Phase 3 allocation history.
Add constraints only after backfill validation.

Existing records may safely receive:

quantity = 1

because they already represent at least one existing machine.

Do not infer quantity greater than one from names or descriptions.

23. Required Use Cases
UC-01 — Single-machine group

Create one Workstation with one group and one Primary Machine.

Expected:

Valid.
UC-02 — Two-machine 500-ton combination

Create:

Primary: 500-Ton Press #01
Supporting: 500-Ton Press #02

Expected:

Valid.
Both machines appear in Workstation detail.
UC-03 — Three-machine 300-ton combination

Create:

Primary: 300-Ton Press #01
Supporting: 300-Ton Press #02
Supporting: 300-Ton Press #03

Expected:

Valid.
UC-04 — Multiple groups in one Workstation

Create both the 500-ton and 300-ton groups under one Workstation.

Expected:

Both groups persist atomically.
UC-05 — Missing Primary

Create group with only Supporting Machines.

Expected:

Backend rejects it.
UC-06 — Multiple Primary Machines

Create group with two Primary members.

Expected:

Backend rejects it.
UC-07 — Duplicate member

Add the same physical Machine twice.

Expected:

Backend rejects it.
UC-08 — Quantity minimum

Create Machine with quantity 0.

Expected:

Backend rejects it.
UC-09 — Increase quantity

Increase Machine quantity from 2 to 3.

Expected:

New physical unit becomes available.
UC-10 — Unsafe quantity reduction

Reduce quantity while a unit has an active assignment.

Expected:

Backend rejects it.
UC-11 — Required supporting machine unavailable

Set a required Supporting Machine to Maintenance.

Expected:

Machine Group is blocked in readiness.
UC-12 — Optional supporting machine unavailable

Set an optional Supporting Machine to Maintenance.

Expected:

Candidate returns warning, according to policy.
UC-13 — Work Order reservation

Allocate a Machine Group.

Expected:

Primary and required Supporting Machines receive reservations.
UC-14 — Supporting-machine capacity conflict

A required Supporting Machine is already reserved.

Expected:

Group allocation fails atomically.
UC-15 — Replace Primary Machine

Replace Primary member.

Expected:

Old membership is ended.
New membership begins.
History is preserved.
24. Testing Requirements
Database tests
Exactly one Primary per active group
No duplicate active member
Effective-date validation
Quantity minimum
Safe quantity reduction
Primary overlap prevention
Same-hierarchy validation
Legacy backfill
Backend tests
Composite Workstation create
Multiple Machine Groups
Group membership CRUD
Primary replacement
Required/optional Supporting behavior
Machine quantity changes
Readiness group resolution
Work Order group allocation
Atomic multi-machine reservation
Capacity conflicts
Idempotency
Audit history
Frontend tests
Add/remove Machine Group
Select one Primary
Select multiple Supporting Machines
Required/optional switches
Quantity validation
Machine unit display
Edit group
Replace Primary
Validation messages
No UUID display
VI/EN/JA/KO
Keyboard accessibility
Light/dark mode
25. Browser Verification

Browser click-through is mandatory.

Verify:

Create Machine with quantity 2
→ Confirm two units

Create Machine with quantity 3
→ Confirm three units

Create Workstation
→ Add 500-ton group
→ Select one Primary and one Supporting

Add 300-ton group
→ Select one Primary and two Supporting

Save
→ Open Workstation detail
→ Verify both groups and all five machine units

Edit Workstation
→ Replace a Primary
→ Verify history

Capture screenshots for:

Machine quantity form
Physical-unit section
Multiple Machine Groups
Primary/Supporting selection
Workstation detail
Validation errors
Dark and light mode
26. Regression Verification

Verify that these existing flows still work:

Factory hierarchy
Shopfloor hierarchy
Work Center creation
Resource Assignment
Resource Capability
Resource Calendar
Production Standard
Phase 2 readiness
Phase 3 Work Order allocation
Release revalidation
Machine detail
Pagination and status display

Do not mark complete based only on compilation.

27. Implementation Report

Create:

implementation-fix/mes-workstation-machine-groups-and-machine-quantity.md

Include:

Root cause
Chosen Machine quantity model
Physical-unit decision
Machine Group schema
Membership schema
Primary/Supporting rules
Required/optional rules
Migration and backfill
APIs
Workstation UX
Machine CRUD changes
Readiness changes
Work Order allocation changes
Capacity-reservation behavior
Test results
Browser screenshots
Data-quality gaps
Remaining limitations
28. Acceptance Criteria

The task is complete only when:

Machine CRUD requires quantity of at least one.
Multiple physical machines are not incorrectly represented as one schedulable unit.
One Workstation can contain one or more Machine Groups.
Each Machine Group contains exactly one Primary Machine.
Each Machine Group may contain zero or more Supporting Machines.
One Workstation can contain both the two-machine 500-ton group and three-machine 300-ton group.
Machine Groups and memberships preserve effective-dated history.
Workstation creation persists all groups atomically.
Resource Assignment supports the Machine Group relationship.
Phase 2 readiness validates the complete required machine combination.
Phase 3 allocation reserves the Primary and every required Supporting Machine.
A conflict on any required Machine blocks group allocation atomically.
Machine quantity increase and decrease follow safe business rules.
UI supports adding, editing, and removing multiple groups.
Machine selectors show business names, codes, unit identity, and availability.
No UUIDs appear in normal UI.
VI/EN/JA/KO localization is complete.
Database, backend, frontend, Docker, API, readiness, allocation, and browser tests pass.