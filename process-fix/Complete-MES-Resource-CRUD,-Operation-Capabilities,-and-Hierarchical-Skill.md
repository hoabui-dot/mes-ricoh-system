# Complete MES Resource CRUD, Operation Capabilities, and Hierarchical Skill Management

## Role

Act as a senior MES domain architect, manufacturing engineer, database engineer, backend engineer, frontend architect, UX designer, and QA engineer.

The MES currently supports:

```text
Factory
→ Shopfloor
→ Work Center
→ Workstation
→ Machine Master
→ Physical Machine Units

It also has an initial Workstation Machine Group implementation.

This task must complete and correct:

Machine list, edit, deactivate, and safe-delete behavior
Workstation edit/delete and audit behavior
Work Center creation and composition flow
Workstation-supported Operations and cycle times
Quantity-based Machine Group requirements
Centralized hierarchical Skill Management
Skill assignment to Machine, Workstation, and Work Center
Generated business-code previews
Correct translated business identities
Shared enterprise UI components
Dependency-aware confirmation and navigation
Phase 2 readiness and Phase 3 allocation regression compatibility

Do not implement these changes as frontend-only patches.

Audit and update:

Database schema
Migrations
Master-data APIs
Readiness resolution
Work Order allocation and revalidation
MES Console
Audit fields
i18n
Tests
Docker runtime
Browser verification

The running repository and applied migrations are the source of truth.

1. Correct the Machine Group Requirement Model

The existing implementation assumes that each Machine Group has exactly one selected Primary physical Machine.

That assumption is no longer valid.

A production Machine Group must support quantity-based requirements.

Target example:

Machine Group: 500-Ton Press Combination

Primary requirements:
- 500-Ton Hydraulic Press × 2

Supporting requirements:
- Loading Robot × 1
- Temperature Controller × 1

Another example:

Machine Group: 300-Ton Press Combination

Primary requirements:
- 300-Ton Hydraulic Press × 1

Supporting requirements:
- 300-Ton Hydraulic Press × 2

The configuration defines required Machine Masters and quantities.

Readiness and allocation resolve concrete physical Machine Units later.

Do not require the Workstation editor to bind one permanent physical unit for every quantity requirement unless the business explicitly pins a unit.

2. Replace Single-Member Group Semantics

Replace the current model:

Exactly one Primary member
+
Supporting members
+
Minimum machine count

with:

One or more Machine Requirement Lines

Suggested model:

interface WorkstationMachineRequirement {
  requirementId: string;

  machineGroupId: string;
  machineId: string;

  role: "Primary" | "Supporting";

  requiredQuantity: number;

  requirementType: "Required" | "Optional";

  pinnedMachineUnitIds?: string[];

  sequenceNo: number;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
  updatedByUserId: string;
  updatedAt: string;
}

Rules:

Each Machine Group must have at least one active Primary requirement line.
A Primary requirement may require one or more units.
A group may have multiple Primary requirement lines for different Machine Masters.
Supporting requirements may require one or more units.
requiredQuantity must be an integer greater than or equal to one.
Remove the standalone minimumRequiredMachines field.
Required total is calculated from the requirement lines.
The same Machine Master may not appear twice with the same role in one effective group unless the model has an explicit distinction.
A Machine Master may appear as both Primary and Supporting only when the use case is intentionally supported and clearly displayed.
Optional requirements must still have a requested quantity, but their shortage produces warnings rather than blocking errors.
Pinned Machine Units are optional.
When units are not pinned, readiness selects eligible available units deterministically.

Do not confuse:

Machine Master quantity

with:

Machine Group required quantity

Machine Master quantity is how many physical units exist.

Machine Group required quantity is how many units of that Machine Master are needed for the combination.

3. Redesign the Workstation Machine Group Editor

Remove:

Primary Machine single-select
Supporting Machine checkboxes
Minimum machine count
Maximum concurrent jobs

Replace them with a requirement-line editor.

Example:

Machine Group: 500-Ton Press Combination

PRIMARY MACHINES

Machine                         Quantity       Requirement
500-Ton Hydraulic Press         [ 2 ]          Required
Available physical units: 3

[ + Add Primary Machine ]

SUPPORTING MACHINES

Machine                         Quantity       Requirement
Loading Robot                   [ 1 ]          Required
Temperature Controller          [ 1 ]          Optional

[ + Add Supporting Machine ]

Each line must contain:

Searchable Machine selector
Role
Required quantity
Required/Optional selector
Available physical-unit count
Currently committed quantity
Remove action
Optional unit-pinning action

Use a grouped searchable Combobox.

Do not use raw checkboxes for a long Machine catalog.

When a Machine no longer has enough unconsumed physical units:

Remove it from the normal selectable result list.
Do not render it as a selectable-looking disabled option.
Optionally provide a separate collapsed section named Unavailable Machines with the blocking reason.
Re-fetch and rerender only the affected selector/list fragment after a selection changes.
Do not reload the entire Workstation form.
4. Machine Quantity Validation in Groups

For every requirement line display:

Required: 2
Physical units: 3
Already committed to active Workstations: 1
Remaining configurable quantity: 2

Validation:

requiredQuantity
<=
eligible physical unit count after effective commitments

If not:

MACHINE_REQUIREMENT_EXCEEDS_AVAILABLE_UNITS

The error must identify:

Machine name
Required quantity
Total units
Active committed units
Related Workstations
Required remediation

Example message:

500-Ton Hydraulic Press requires 2 units, but only 1 unit is currently available.
One unit is used by Workstation “Molding Station 02”.
Remove or reduce that Workstation requirement before saving.
5. Machine List Improvements

Route:

/master-data/machines

The table must display:

Translated Machine name
Machine code as secondary text
Machine type
Manufacturer
Model
Physical quantity
Available unit count
Assigned unit count
Execution status summary
Master status
Updated by
Updated at
Actions

Required identity rendering:

Máy ép 500 tấn
MC-20260725-0001

Never use code as the primary label.

The Quantity column must always be visible.

Suggested display:

3 units
2 assigned · 1 available

Use the shared DataTable.

6. Complete Machine Edit

Add a full Machine edit flow.

Editable fields:

Localized name
Localized description
Machine type
Manufacturer
Model
Quantity
Planning-resource status
Default efficiency
Active status
Physical-unit metadata where supported
Assigned Skills

Generated Machine code remains read-only.

Before saving, call a dependency-impact endpoint.

Suggested endpoint:

POST /api/mes/master-data/machines/:id/change-impact

Example request:

{
  "changes": {
    "name": {
      "vi": "Máy ép thủy lực 500 tấn"
    },
    "quantity": 2,
    "status": "Inactive"
  }
}

Example response:

{
  "allowed": false,
  "severity": "Blocked",
  "affected_resources": {
    "workstations": [
      {
        "id": "uuid",
        "code": "WS-20260725-0001",
        "name": {
          "vi": "Trạm ép lưu hóa số 01"
        },
        "required_quantity": 2
      }
    ],
    "machine_groups": [],
    "capabilities": [],
    "calendars": [],
    "production_standards": [],
    "work_order_allocations": []
  },
  "blocking_errors": [],
  "warnings": []
}
7. Machine Edit Impact Rules
Name or descriptive changes

When editing name, description, manufacturer, or model:

The edit may normally proceed.
Show a confirmation dialog listing affected Workstations and other references.
Explain that references will display the updated translated name.
Historical allocation snapshots must remain unchanged.
Require explicit confirmation.
Quantity increase

Normally allowed.

Create new Machine Units transactionally.

Quantity decrease

Calculate:

new quantity
vs
active Workstation requirement demand
vs
active assignments
vs
active/future Work Order reservations

Block the edit when the new quantity is below required committed usage.

Show:

Affected Workstations
Required quantities
Assigned physical units
Future Work Orders
Navigation buttons

Example:

Quantity cannot be reduced from 3 to 1.

Workstation “Molding Station 01” requires 2 units.
Workstation “Molding Station 02” requires 1 unit.

Adjust those Workstations before reducing Machine quantity.

Provide actions:

Open Workstation
Open Machine Group
Cancel

Do not automatically remove the Machine from another Workstation.

Status change

Changing to Inactive or all units to OutOfService must be blocked when:

Active Machine Group requirement exists
Active Resource Assignment exists
Future committed Work Order allocation exists
Required capability/planning relation still depends on it

Show dependencies and navigation actions.

8. Complete Machine Delete

Machine deletion is allowed only when the Machine has no business references.

Blocking references include:

Machine Units with history
Workstation Machine Requirements
Resource Assignments
Resource Capabilities
Resource Calendars
Production Standards
Maintenance records
OEE records
Work Order allocation snapshots
Capacity reservations
Audit history requiring retention

When only removable active configuration exists:

Do not cascade-delete silently.
Tell the user what must be removed first.
Provide navigation buttons to each related record.

Suggested endpoint:

GET /api/mes/master-data/machines/:id/dependencies

Stable delete error:

MACHINE_REFERENCED

Where historical use exists, permanent deletion must remain impossible.

Provide:

Deactivate Machine

as the appropriate action.

9. Workstation Table Corrections

Fix the corrupted translation:

Nhà máy䁲

Audit:

Locale dictionary value
UTF-8 source encoding
Translation interpolation
Build-time transformation
API text encoding

Do not patch the rendered string locally.

Workstation table columns:

Workstation name
Factory
Shopfloor
Work Center
Machine Groups
Active Machine quantity
Status
Created by
Updated by
Updated at
Actions

Identity rules:

Row 1: translated name
Row 2: business code

Example:

Trạm ép lưu hóa số 01
WS-20260725-0001

For Factory, Shopfloor, and Work Center:

Translated name first
Code second

Do not display only the code.

10. Audit Actor Information

All resource entities and relationships must store:

createdByUserId: string;
createdAt: string;
updatedByUserId: string;
updatedAt: string;

For effective-dated relationships also store:

endedByUserId?: string;
endedAt?: string;

For delete/deactivate actions:

deactivatedByUserId?: string;
deactivatedAt?: string;
deletedByUserId?: string;
deletedAt?: string;

Use the authenticated actor from the backend security context.

Never trust an actor ID supplied by the browser.

API projections must resolve user identities into:

{
  "id": "uuid",
  "display_name": "Nguyễn Văn An",
  "email": "an@example.com"
}

UI displays:

Nguyễn Văn An

Do not display raw user IDs.

When the identity service is unavailable:

Unknown user

with an observable dependency warning is preferable to a UUID.

11. Complete Workstation Edit and Delete

Workstation must support:

Edit
Deactivate
Safe delete
Dependency-impact confirmation
Audit history

Editable fields:

Localized name
Description
Work Center
Execution mode
Status
Supported Operations
Machine Groups
Assigned Skills

Before edit, evaluate:

Machine Group requirements
Resource Assignments
Capabilities
Calendars
Production Standards
Active/future Work Orders
Kiosk terminal bindings
Routing/Work Center composition references

Changing Work Center must revalidate:

Factory
→ Shopfloor
→ Work Center
→ Workstation
→ Machine Group

Do not silently move a Workstation with active allocations.

Delete is allowed only when unused and without historical references.

Otherwise provide deactivate and dependency navigation.

12. Standardize Status Switches

Do not use a custom handwritten Switch.

Use the project’s shadcn Switch backed by the selected accessible primitive library.

Create one shared component:

<ResourceStatusSwitch
  value={status}
  onValueChange={...}
  disabled={...}
  label={...}
  description={...}
/>

Requirements:

Label associated through htmlFor
Correct disabled state
Focus ring
Keyboard support
Loading state
Active and inactive text
Light/dark compatibility
No absolute-positioned thumb hacks
No hard-coded pixel offsets that break at different zoom levels

Use the same component in:

Factory
Shopfloor
Work Center
Workstation
Machine
Skill
Machine Group
Resource Assignment
13. Form Action Layout

For every create/edit form, place actions together at the bottom-right:

[ Back ] [ Save ]

or:

[ Cancel ] [ Save Changes ]

The Back/Cancel button must be immediately to the left of Submit.

Do not place Back in a detached top-right area.

Use a shared component:

<FormActions
  backLabel={t("common.back")}
  submitLabel={t("common.save")}
  isSubmitting={...}
/>

Requirements:

Sticky action bar only when needed
Responsive wrapping
Keyboard focus order
Unsaved-change confirmation
Submit disabled only for valid reasons
Loading state inside Submit
14. Generated Code Preview API

Current code fields are empty while displaying:

Generated by the backend; preview is advisory until saved.

Implement a lightweight reservation or preview endpoint.

Preferred behavior:

POST /api/mes/master-data/business-codes/reservations

Request:

{
  "entity_type": "Workstation"
}

Response:

{
  "reservation_id": "opaque-id",
  "code": "WS-20260725-0007",
  "expires_at": "2026-07-25T02:00:00Z"
}

Creation request includes the reservation ID.

The backend verifies and consumes it atomically.

Rules:

Prefix is fixed by entity type.
User cannot edit the value.
Reservation has expiry.
Expired or consumed reservations cannot be reused.
Concurrent users cannot receive the same code.
Abandoned reservations may create numbering gaps.
Business-code uniqueness is more important than gap-free numbering.

Supported prefixes:

FAC
SF
WC
WS
MC
SK
SKG
OP

If code reservation is not architecturally appropriate, provide a real preview without claiming it is reserved. The field must never appear blank without an explanation.

15. Translate Hierarchy Context Correctly

Replace the literal English string:

Hierarchy

with localized resource keys.

Example Vietnamese:

Cấu trúc phân cấp

Display translated names as the main content:

Nhà máy Bình Dương
→ Xưởng ép lưu hóa
→ Cụm ép

Do not show only:

FAC-...
→ SF-...
→ WC-...

Codes may appear as secondary muted text or in a tooltip.

16. Workstation-Supported Operations

Cycle time belongs to the Workstation-supported Operation context, not directly to Work Center creation.

Introduce:

interface WorkstationOperationCapability {
  workstationOperationCapabilityId: string;

  workstationId: string;
  operationId: string;

  cycleTimeSec: number;
  setupTimeMin?: number;

  baseQuantity: number;

  efficiencyFactor?: number;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
  updatedByUserId: string;
  updatedAt: string;
}

A Workstation create/edit form must contain:

Supported Operations

For each supported Operation:

Operation translated name
Operation code as secondary context
Required cycle time
Optional setup time
Base quantity
Effective date
Status

A Workstation must support at least one Operation before it can be used in a planning-enabled Work Center.

Do not add a free-floating Work Center cycle-time field.

17. Clarify Cycle Time Ownership

Use this ownership model:

Routing Operation
= Defines what process step must occur.

Workstation Operation Capability
= Defines whether a Workstation can execute that Operation and its workstation-level estimated time.

Production Standard
= Defines released Product Revision-specific timing and labor standards.

Work Center
= Groups Workstations and exposes eligible operation support to Routing/planning.

Resolution recommendation:

Released Equipment/Workstation-specific Production Standard
→ Released Work Center Production Standard
→ Workstation Operation Capability estimate
→ Missing timing configuration

The Workstation cycle time is an engineering estimate and must not silently override a Released Product Standard.

Document this precedence.

18. Redesign Work Center Composition

Work Center represents a logical planning resource and contains one or more Workstations.

Work Center create/edit form must include:

Generated read-only Work Center code
Localized name
Localized description
Required Shopfloor
Status switch
Capacity mode
Default shift where supported
Selected Workstations
Selected Operations from each Workstation
Assigned Work Center Skills

Remove the incorrect Work Center cycle-time field.

The user selects one or more Workstations.

For each selected Workstation, show its supported Operations.

Example:

Selected Workstation:
Trạm cắt laser số 01
WS-20260725-0004

Supported Operations:

[x] Cắt phôi
    Cycle estimate: 18 sec

[x] Cắt biên dạng
    Cycle estimate: 32 sec

[ ] Khoan lỗ
    Cycle estimate: 25 sec

The Work Center must include at least one selected Operation overall.

Recommended rule:

Every selected Workstation must contribute at least one selected Operation.
A Work Center must contain at least one Workstation.
A Work Center must expose at least one Operation.
Selected Operation must be actively supported by the selected Workstation.
Workstation must belong to the same Shopfloor hierarchy.
Removing a Workstation or Operation requires dependency checks.
19. Work Center Membership Model

Audit the current Workstation → Work Center foreign key.

If one Workstation belongs to exactly one Work Center, preserve that relationship and let Work Center creation orchestrate assignment.

Suggested association:

interface WorkCenterWorkstationOperation {
  associationId: string;

  workCenterId: string;
  workstationId: string;
  operationId: string;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
}

Do not introduce many-to-many Workstation ownership unless the business explicitly requires one Workstation to belong to several Work Centers.

The Work Center form may manage the child relationships even when the canonical FK remains on Workstation.

20. Work Center Form Corrections

Every control must have:

Visible label
Required marker where applicable
Helper text where necessary
Error message
Correct localization key

Select options must show translated names as primary content.

Example:

Xưởng ép lưu hóa
SF-20260725-0001

Do not use code as the only option label.

Use:

Shared generated-code field
Shared localized-text fields
Shared searchable selectors
Shared status switch
Shared form actions
Shared dependency confirmation
21. Centralized Skill Management Domain

Create a dedicated Skill Management workspace.

The Skill catalog must support three resource scopes:

Machine Skills
Workstation Skills
Work Center Skills

Skills are centrally managed definitions.

Resources reference the definitions.

Do not create duplicate standalone Skill records separately for every Machine, Workstation, or Work Center.

Target model:

interface SkillGroup {
  skillGroupId: string;
  skillGroupCode: string;

  scope:
    | "Machine"
    | "Workstation"
    | "WorkCenter";

  name: LocalizedText;
  description?: LocalizedText;

  sequenceNo: number;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
  updatedByUserId: string;
  updatedAt: string;
}
interface SkillDefinition {
  skillId: string;
  skillCode: string;

  skillGroupId: string;

  scope:
    | "Machine"
    | "Workstation"
    | "WorkCenter";

  name: LocalizedText;
  description?: LocalizedText;

  levelScaleId?: string;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
  updatedByUserId: string;
  updatedAt: string;
}
interface ResourceSkillAssignment {
  resourceSkillAssignmentId: string;

  resourceType:
    | "Machine"
    | "Workstation"
    | "WorkCenter";

  resourceId: string;
  skillId: string;

  requiredLevel?: string;
  proficiencyLevel?: string;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
  endedByUserId?: string;
  endedAt?: string;
}
22. Skill Management Routes

Create:

/master-data/skills
/master-data/skills/machines
/master-data/skills/workstations
/master-data/skills/work-centers

Recommended UI:

Skill Management

[ Machine Skills ]
[ Workstation Skills ]
[ Work Center Skills ]

Each tab supports full CRUD for:

Skill Groups
Skill Definitions

Example Work Center groups:

Cutting Skills
- Laser Cutting
- Plasma Cutting
- Mechanical Cutting

Welding Skills
- MIG Welding
- TIG Welding
- Spot Welding

Use translated names first and codes second.

23. Skill Codes

Generate codes server-side.

Suggested prefixes:

SKG-MC   Machine Skill Group
SKG-WS   Workstation Skill Group
SKG-WC   Work Center Skill Group

SK-MC    Machine Skill
SK-WS    Workstation Skill
SK-WC    Work Center Skill

Examples:

SKG-WC-20260725-0001
SK-WC-20260725-0001

Code fields are read-only and use the code reservation/preview mechanism.

24. Assign Skills During Resource Creation

Machine, Workstation, and Work Center forms must allow selecting one or more existing Skills matching their scope.

Machine form

Show only:

Machine Skills

A Machine must have at least one Skill when the business policy requires planning capability.

Workstation form

Show only:

Workstation Skills
Work Center form

Show only:

Work Center Skills

Display grouped options:

Cutting Skills
  [ ] Laser Cutting
  [ ] Plasma Cutting

Welding Skills
  [ ] MIG Welding
  [ ] TIG Welding

Use grouped Combobox/multi-select with chips.

Do not flatten all Skills into one unstructured list.

25. Inline “Other” Skill Creation

Normal flow:

Select from centrally managed Skills

Provide one special option:

Other — Create a new Skill

When selected:

Open a Dialog or Drawer.
Show the same fields and validation used on the Skill Management page.
Preselect the correct resource scope.
Allow Skill Group selection or creation where permitted.
Reserve/generated code automatically.
Submit to the real Skill API.
On success:
Add the new Skill to the query cache.
Select it immediately in the parent resource form.
Keep the unsaved parent form state.
On failure:
Show an error toast.
Remove the optimistic Skill from the selector.
Do not leave a ghost chip.
Allow retry.

Do not store an inline-only Skill that is missing from the central catalog.

Use a reusable component:

<SkillSelectorWithCreate />
26. Skill CRUD Dependency Rules

Before editing a Skill, show affected:

Machines
Workstations
Work Centers
Routing Operation Skill Requirements
Employee Skill records where relevant
Work Orders or released planning snapshots where relevant

Name/description changes may proceed after confirmation.

Scope changes are not allowed after use.

Skill Group movement may require confirmation.

Deleting a referenced Skill is not allowed.

Provide:

Deactivate
View related resources
Navigate to resource
End assignment

Stable errors:

SKILL_REFERENCED
SKILL_SCOPE_IMMUTABLE
SKILL_GROUP_REFERENCED
SKILL_ASSIGNMENT_CONFLICT
27. Skill and Operation Distinction

Do not confuse Skills with Operations.

Operation
= Manufacturing process step, such as Cutting or Welding.

Skill
= Capability or qualification needed to perform or support work.

Machine Skill
= Technical capability or feature of a Machine.

Workstation Skill
= Process capability of a Workstation.

Work Center Skill
= Aggregate planning capability exposed by the logical Work Center.

A Work Center Operation must be supported by at least one selected Workstation.

Work Center Skills may summarize or complement the supported Operation set but must not replace Operation validation.

28. Readiness Updates

Update Phase 2 readiness to support the corrected model.

Readiness must:

Resolve Work Center.
Resolve selected Workstations that expose the Routing Operation.
Read Workstation Operation Capability.
Resolve active Machine Groups.
Resolve Primary and Supporting quantity requirements.
Select eligible Machine Units for each requirement.
Verify required quantity.
Check every selected required Unit:
Assignment
Execution status
Calendar
Capacity reservation
Resolve Production Standard.
Read relevant Skill assignments and requirements.
Return deterministic candidates.

Candidate example:

{
  "machine_group": {
    "code": "MG-20260725-0004",
    "name": {
      "vi": "Tổ hợp ép 500 tấn"
    }
  },
  "requirements": [
    {
      "role": "Primary",
      "machine": {
        "code": "MC-20260725-0001",
        "name": {
          "vi": "Máy ép 500 tấn"
        }
      },
      "required_quantity": 2,
      "resolved_units": [
        {
          "unit_code": "MC-20260725-0001-01"
        },
        {
          "unit_code": "MC-20260725-0001-02"
        }
      ]
    }
  ]
}

New blocking codes:

WORKSTATION_OPERATION_NOT_SUPPORTED
MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE
PRIMARY_MACHINE_REQUIREMENT_MISSING
REQUIRED_MACHINE_UNIT_UNAVAILABLE
WORKCENTER_HAS_NO_OPERATION
RESOURCE_SKILL_MISSING
29. Allocation and Revalidation Updates

Phase 3 allocation must snapshot and reserve every resolved Machine Unit.

Snapshot:

{
  "machine_group": {},
  "machine_requirements": [
    {
      "machine_id": "uuid",
      "role": "Primary",
      "required_quantity": 2,
      "resolved_unit_ids": [
        "uuid",
        "uuid"
      ]
    }
  ]
}

Allocation must reserve atomically:

All required Primary Machine Units
All required Supporting Machine Units
Selected optional Supporting Units
Workstation
Work Center

Revalidation must be fully group-aware.

Do not continue using only one legacy Primary Equipment identity as the authoritative revalidation key.

Legacy compatibility columns may remain, but the new snapshot and Machine Unit reservations are authoritative for new allocations.

30. UI Technology Standard

Do not introduce a second competing visual design system.

Standardize the existing Console on:

shadcn/ui components
Radix-compatible accessible primitives
TanStack Table for management tables
React Hook Form for form state
Zod for shared form schemas
TanStack Query for remote cache/mutations when compatible with the existing stack

Use official or repository-owned components for:

Switch
Dialog
Alert Dialog
Drawer/Sheet
Combobox
Command
Popover
Tabs
Tooltip
Toast/Sonner
Pagination
Data Table
Form
Label
Input
Input Number
Collapsible
Skeleton
Empty state

Do not create custom replacements for these primitives.

Build MES-specific wrappers by composing them, not by rewriting behavior.

31. Shared UI Components

Create or standardize:

<MesDataTable />
<MesFormActions />
<GeneratedCodeField />
<ResourceStatusSwitch />
<BusinessIdentity />
<HierarchyContext />
<DependencyImpactDialog />
<EntityCombobox />
<MachineRequirementEditor />
<SkillSelectorWithCreate />
<AuditActor />
<EmptyState />
<ErrorState />

BusinessIdentity renders:

Translated name
Business code

AuditActor renders the display name, not user ID.

DependencyImpactDialog renders:

Warning or blocking severity
Related records grouped by type
Business names/codes
Navigation actions
Confirmation when allowed
32. Data Table Standard

Use server-side pagination for master-data lists when the API is paginated.

Required:

Default size: 10
Options: 10, 50, 100

Also support:

Server-side sorting
Server-side filtering
Search
Total count
Current page
Loading state
Empty state
Error state
Row actions
Row click
Column visibility where useful
Responsive overflow
Keyboard navigation

Keep pagination, sorting, and filtering consistently server-side.

Do not sort only the currently loaded page.

33. Required Use Cases
Machine
UC-M01 — Quantity visible

Machine list displays total, assigned, and available quantity.

UC-M02 — Rename used Machine

Rename a Machine used by two Workstations.

Expected:

Impact dialog lists both Workstations.
User confirms.
Current UI names update.
Historical allocation snapshots remain unchanged.
UC-M03 — Unsafe quantity reduction

Machine has quantity 3 and active requirement demand 3.

Attempt to reduce to 2.

Expected:

Blocked.
Related Workstations displayed.
Navigation actions provided.
UC-M04 — Inactivate referenced Machine

Expected:

Blocked until active dependencies are removed or ended.
UC-M05 — Safe Machine delete

Unused Machine may be deleted.

UC-M06 — Referenced Machine delete

Expected:

Blocked with explicit dependencies.
Deactivate offered when allowed.
Workstation
UC-W01 — Correct translated table identity

Name on row one, code on row two.

UC-W02 — Correct Factory translation

No corrupted characters.

UC-W03 — Generated Workstation code appears on create

Code is visible immediately and read-only.

UC-W04 — Multiple Primary quantity

Machine Group requires two 500-ton Primary Machines.

Expected:

Requirement quantity is accepted.
Two eligible physical units are resolved.
UC-W05 — No available Machine option

Exhausted Machine is removed from the normal selector result.

UC-W06 — Remove standalone minimum-machine field

Required count derives from requirement lines.

UC-W07 — Remove max concurrent jobs

Field is not displayed or used as an independent manual capacity input.

UC-W08 — Edit referenced Workstation

Impact dialog lists Work Orders, Machine Groups, and Work Center context.

UC-W09 — Delete referenced Workstation

Expected:

Blocked.
Related records and navigation shown.
Work Center and Operations
UC-C01 — Generated Work Center code

Visible on entry and read-only.

UC-C02 — Every form field has a label

No unlabeled control.

UC-C03 — Select translated names

Shopfloor and Workstation selectors use names first.

UC-C04 — Workstation supports Operations

Create Workstation with at least one Operation and cycle estimate.

UC-C05 — Work Center selects Workstations

Select multiple Workstations.

UC-C06 — Work Center selects supported Operations

Only Operations supported by selected Workstations are available.

UC-C07 — At least one Operation required

Save without Operations is rejected.

UC-C08 — No Work Center cycle-time field

Timing is resolved from Workstation capability or Production Standard.

Skills
UC-S01 — Create Machine Skill Group and Skills
UC-S02 — Create Workstation Skill Group and Skills
UC-S03 — Create Work Center Skill Group and Skills
UC-S04 — Assign multiple grouped Skills to Machine
UC-S05 — Assign multiple grouped Skills to Workstation
UC-S06 — Assign multiple grouped Skills to Work Center
UC-S07 — Inline Other creation succeeds

New Skill persists centrally and is selected immediately.

UC-S08 — Inline creation fails

Optimistic option is removed and error toast appears.

UC-S09 — Delete referenced Skill

Blocked with dependency links.

UC-S10 — Audit actor

Created by and updated by display user names, never raw IDs.

34. Testing Requirements
Database

Test:

Machine quantity minimum
Quantity versus active requirement demand
Machine Unit generation
Machine requirement quantity constraints
Effective-date history
Workstation Operation uniqueness
Work Center/Workstation/Operation hierarchy
Skill Group and Skill scope
Skill assignment uniqueness
Audit actor columns
Safe-delete constraints
Backend

Test:

Machine impact analysis
Machine edit and safe delete
Workstation edit and safe delete
Business-code reservation
Workstation Operation CRUD
Work Center composition transaction
Skill Group CRUD
Skill CRUD
Resource Skill Assignment CRUD
Inline Skill creation
Actor projection
Group quantity readiness
Multi-unit allocation
Full group-aware revalidation
Dependency navigation contracts
Idempotency
Authorization
Frontend

Test:

Quantity columns
Dependency-impact dialogs
Navigation buttons
Correct translated names
No corrupted locale strings
No raw user IDs
Shared Switch rendering
Action-button positioning
Generated code preview
Machine Requirement editor
Dynamic filtering of unavailable Machines
Workstation Operation editor
Work Center composition
Skill tabs
Grouped Skill selectors
Inline Other flow
Toast rollback
DataTable pagination/filter/sort
Keyboard access
VI/EN/JA/KO
Dark/light mode
Zoom levels 80%, 100%, 125%, and 150%
35. Mandatory Browser Verification

Browser click-through is required.

Capture evidence for:

Machine list quantity
Machine edit impact confirmation
Blocked quantity reduction
Blocked Machine delete with navigation
Workstation table translation
Workstation generated code
Workstation Machine Requirement quantities
Workstation supported Operations
Work Center selecting Workstations and Operations
Skill Management tabs
Grouped Skill selection
Inline Other success
Inline Other failure rollback
Audit actor display
Shared Switch in light/dark mode
Back button immediately left of Save

Do not mark this task complete without browser verification.

36. Runtime and Regression Verification

Run:

Forward migrations.
Master-data build and tests.
Execution build and tests.
Console build.
i18n static scan.
Docker rebuild/recreate.
Machine CRUD runtime scenario.
Workstation CRUD runtime scenario.
Work Center composition scenario.
Skill CRUD and inline-create scenario.
Quantity reduction conflict.
Dependency navigation.
Phase 2 readiness with quantity-based requirements.
Phase 3 multi-unit allocation.
Full group-aware revalidation.
Work Order release regression.
Browser verification.
Log and outbox review.
37. Required Implementation Report

Create:

implementation-fix/mes-resource-crud-operation-capabilities-and-skill-management.md

Include:

Root-cause audit
Existing and corrected Machine Group semantics
Machine edit/delete rules
Quantity impact analysis
Workstation edit/delete rules
Audit actor implementation
Code-reservation mechanism
Operation ownership decision
Workstation Operation schema
Work Center composition schema
Cycle-time precedence
Skill domain model
Skill Group behavior
Inline Other behavior
Shared UI stack and components
API contracts
Migrations and backfills
Readiness changes
Allocation/revalidation changes
Browser screenshots
Tests
Runtime verification
Data-quality gaps
Remaining limitations
38. Acceptance Criteria

The task is complete only when:

Machine list displays total, assigned, and available quantity.
Machine supports edit, deactivate, and safe delete.
All Machine mutations evaluate and display dependencies.
Unsafe quantity reductions are blocked.
Dependency dialogs provide navigation actions.
Workstation table uses translated names first and codes second.
Corrupted Factory translation is fixed at its source.
Workstation supports edit, deactivate, and safe delete.
Created/updated actors are stored and displayed by name.
Status controls use the shared library-backed Switch.
Form Back/Cancel is directly left of Submit.
Workstation and Work Center codes are visible immediately and read-only.
Hierarchy context uses translated names.
Exhausted Machines disappear from normal selectable options.
Machine Group requirements support quantities for Primary and Supporting roles.
The standalone minimum-machine field is removed.
The standalone maximum-concurrent-jobs field is removed from Workstation configuration.
Workstation manages supported Operations and cycle estimates.
Work Center selects one or more Workstations.
Work Center selects Operations supported by those Workstations.
Every Work Center exposes at least one Operation.
Work Center no longer owns an incorrect free-floating cycle-time field.
Central Skill Management supports Machine, Workstation, and Work Center scopes.
Skills are grouped into Skill Groups.
Machine, Workstation, and Work Center can select multiple grouped Skills.
Inline Other creates a real central Skill and selects it immediately.
Failed inline creation rolls back the optimistic option.
Skill edit/delete obeys dependency rules.
No normal UI shows UUIDs or raw user IDs.
Phase 2 readiness resolves required Machine quantities.
Phase 3 allocation reserves all resolved physical units.
Revalidation is fully Machine Group and Machine Unit-aware.
Shared shadcn/Radix-based controls replace fragile custom UI.
Shared TanStack-based tables use consistent server-side behavior.
Builds, migrations, tests, runtime probes, regression checks, and browser evidence pass.