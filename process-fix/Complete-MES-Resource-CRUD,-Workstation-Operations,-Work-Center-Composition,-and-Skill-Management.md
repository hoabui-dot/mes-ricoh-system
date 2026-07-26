# Complete MES Resource CRUD, Workstation Operations, Work Center Composition, and Skill Management

## Objective

Complete the remaining MES resource-management requirements across database, backend APIs, business validation, and MES Console.

Current hierarchy:

```text
Factory
→ Shopfloor
→ Work Center
→ Workstation
→ Machine Group
→ Machine Requirements
→ Machine Units

Preserve existing IDs, compatibility routes, historical assignments, planning readiness, and Work Order allocation data.

Do not treat this as a frontend-only task.

1. Implementation Principles

Before implementation, inspect the existing schemas, APIs, UI components, and applied migrations.

Reuse existing entities and components whenever possible.

Do not rewrite applied migrations.

Use forward-only migrations.

Use translated business names as the primary UI identity and business codes as secondary information.

Never display UUIDs or raw user IDs in normal UI.

Use the existing MES terminology:

Site = Factory
Shopfloor = Shopfloor
Work Center = Logical planning resource
Workstation = Execution station
Machine = Machine master
Machine Unit = Independently schedulable physical unit
2. UI Technology Standard

Do not hand-code controls that already exist in an established UI library.

Standardise the current MES Console on:

shadcn/ui
Radix UI primitives
TanStack Table
React Hook Form
Zod
TanStack Query, where compatible with the existing architecture

Use library-backed components for:

Switch
Dialog
Alert Dialog
Sheet or Drawer
Combobox
Command
Popover
Tabs
Tooltip
Toast
Pagination
Form
Label
Number input
Collapsible
Skeleton
Empty state

Create reusable MES wrappers where needed:

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

Do not create custom Switch, Dialog, Combobox, or pagination behaviour from scratch.

3. Machine List

Route:

/master-data/machines

The Machine table must show:

Translated Machine name
Machine code below the name
Machine type
Manufacturer
Model
Total physical quantity
Assigned quantity
Available quantity
Execution-status summary
Active status
Created by
Updated by
Updated at
Row actions

Identity display:

Máy ép 500 tấn
MC-20260725-0001

Quantity display:

3 machines
2 assigned · 1 available

Use the shared paginated table.

Default page size:

10

Options:

10
50
100
4. Machine Edit

Add a complete Machine edit flow.

Editable fields:

Localised name
Localised description
Machine type
Manufacturer
Model
Quantity
Planning-resource status
Default efficiency
Active status
Machine Skills
Physical-unit metadata where supported

Machine code remains read-only.

Before saving any update, calculate its dependency impact.

Suggested API:

POST /api/mes/master-data/machines/:id/change-impact

Return affected:

Workstations
Machine Groups
Machine Requirements
Resource Assignments
Capabilities
Calendars
Production Standards
Work Order allocations
Capacity reservations
Name and descriptive changes

Name, description, manufacturer, and model changes may be allowed.

When the Machine is already used, display a confirmation dialog containing all related Workstations and resources.

The user must explicitly confirm before saving.

Historical Work Order snapshots must not be rewritten.

Quantity increase

Allow quantity increase and create additional Machine Units transactionally.

Quantity decrease

Block quantity reduction when the new quantity is lower than:

Active Workstation Machine Requirement demand
Active Machine Unit assignments
Future or active Work Order reservations
Other active dependencies requiring those units

Example:

Quantity cannot be reduced from 3 to 1.

Workstation “Molding Station 01” requires 2 machines.
Workstation “Molding Station 02” requires 1 machine.

Adjust those Workstations before reducing the quantity.

The dialog must provide navigation actions:

Open Workstation
Open Machine Group
Open Allocation

Do not automatically remove the Machine from related Workstations.

Status changes

Changing a Machine to Inactive, or making insufficient units available, must be blocked when active configuration or future allocations still depend on it.

Display the blocking dependencies and navigation actions.

5. Machine Delete and Deactivate

Add Delete and Deactivate actions.

Permanent deletion is allowed only when the Machine has no references or retained history.

Blocking dependencies include:

Machine Units with history
Workstation Machine Requirements
Machine Groups
Resource Assignments
Capabilities
Calendars
Production Standards
Maintenance or OEE records
Work Order allocation snapshots
Capacity reservations

Suggested API:

GET /api/mes/master-data/machines/:id/dependencies

Stable error:

MACHINE_REFERENCED

When deletion is blocked:

Explain exactly why
Group related records by type
Show translated names and codes
Provide navigation buttons
Offer Deactivate when allowed

Do not cascade-delete related manufacturing configuration.

6. Workstation Table Corrections

Route:

/master-data/workstations

Fix the corrupted Vietnamese translation:

Nhà máy䁲

Fix it at the translation source, not with a UI string replacement.

The Workstation table must show:

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

For every resource identity:

Row 1: translated name
Row 2: business code

Factory, Shopfloor, Work Center, and Workstation columns must use translated names as the primary value.

7. Workstation Generated Code

The Workstation create page must immediately display a valid, read-only generated code.

Do not leave the field empty with only the message:

Generated by the backend; preview is advisory until saved.

Implement a lightweight business-code reservation API.

Suggested endpoint:

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

The create request consumes the reservation atomically.

Use fixed prefixes:

FAC
SF
WC
WS
MC
SKG
SK

The user must never edit generated codes.

8. Workstation Form UI Corrections

Use translated labels everywhere.

Translate the literal Hierarchy label.

Display hierarchy names, not only codes:

Nhà máy Bình Dương
→ Xưởng ép lưu hóa
→ Cụm ép

Codes may appear as secondary muted information.

Use the shared library-backed Status Switch.

Do not use the current custom Switch implementation.

Place form actions together:

[ Back ] [ Save ]

The Back button must always be immediately to the left of Save.

Use one shared form-action component.

9. Correct Machine Requirement Model

Remove these Workstation fields:

Minimum required machines
Maximum concurrent jobs

Machine Group capacity must be derived from Machine Requirement lines.

Replace the old Primary single-select and Supporting checkbox model with quantity-based requirement lines.

Suggested entity:

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

Every Machine Group requires at least one Primary requirement.
Primary required quantity may be greater than one.
A group may contain multiple Primary Machine types.
Supporting required quantity may be greater than one.
Required quantity must be an integer of at least one.
Required requirements block readiness when insufficient.
Optional requirements create warnings when insufficient.
Total required Machine count is calculated from requirement lines.
Physical Machine Units are selected during readiness or allocation unless explicitly pinned.

Example:

Machine Group: 500-Ton Press Combination

Primary:
500-Ton Press × 2

Supporting:
Loading Robot × 1
Temperature Controller × 1
10. Machine Requirement Editor

Use a dynamic line editor.

Example:

PRIMARY MACHINES

Machine                         Quantity
500-Ton Hydraulic Press         [ 2 ]

[ Add Primary Machine ]

SUPPORTING MACHINES

Machine                         Quantity       Requirement
Loading Robot                   [ 1 ]          Required
Temperature Controller          [ 1 ]          Optional

[ Add Supporting Machine ]

Each row must show:

Searchable translated Machine name
Code as secondary information
Role
Required quantity
Required or Optional state
Total physical units
Units committed elsewhere
Remaining configurable units
Remove action

Validation example:

Required: 2
Physical units: 3
Used by other Workstations: 1
Available for configuration: 2

When a Machine has no remaining configurable quantity:

Remove it from the normal selectable options
Re-fetch only the affected selector data
Do not reload the whole form
Do not show an option that looks selectable but is disabled

A separate collapsed unavailable section may be shown with blocking reasons.

11. Workstation Edit, Deactivate, and Delete

Add complete Workstation actions:

Edit
Deactivate
Delete
Dependency impact confirmation

Editable content:

Localised name
Description
Work Center
Execution mode
Active status
Supported Operations
Machine Groups and requirements
Workstation Skills

Before saving changes, evaluate:

Machine Groups
Machine Requirements
Resource Assignments
Resource Calendars
Capabilities
Production Standards
Work Center composition
Active and future Work Orders
Kiosk terminal bindings

Changing Work Center must validate the complete hierarchy.

Do not move a Workstation with active allocations silently.

Delete is allowed only for an unused Workstation with no retained history.

Otherwise display dependencies and offer Deactivate.

12. Audit Actors

Store audit actor fields for all relevant master data and relationship records:

createdByUserId: string;
createdAt: string;
updatedByUserId: string;
updatedAt: string;

Where applicable:

endedByUserId?: string;
endedAt?: string;

deactivatedByUserId?: string;
deactivatedAt?: string;

deletedByUserId?: string;
deletedAt?: string;

The backend must get the actor from the authenticated security context.

Do not accept actor IDs from request payloads.

API projections must return:

{
  "id": "uuid",
  "display_name": "Nguyễn Văn An",
  "email": "an@example.com"
}

The UI displays only the actor’s name.

Do not show raw user IDs.

13. Workstation Supported Operations

Cycle time must be configured at Workstation Operation level, not as a free Work Center field.

Use or complete:

interface WorkstationOperationCapability {
  capabilityId: string;

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

The Workstation form must have:

Supported Operations

For each Operation:

Translated Operation name
Operation code as secondary information
Cycle time in seconds
Optional setup time
Base quantity
Effective date
Active status

At least one supported Operation is required for a planning-enabled Workstation.

Clarify ownership:

Routing Operation
= Required manufacturing step

Workstation Operation Capability
= Workstation support and estimated execution time

Production Standard
= Released Product-specific timing standard

Timing precedence:

Released Machine/Workstation Production Standard
→ Released Work Center Production Standard
→ Workstation Operation estimate
→ Missing timing configuration
14. Work Center Generated Code and Form

The Work Center create page must use the same code-reservation rule as Workstation.

Example:

WC-20260725-0004

The field is visible immediately and read-only.

Every Work Center form control must have:

Visible label
Required marker
Helper text when necessary
Validation error

Selectors must display translated names first.

Use the shared Status Switch and Form Actions.

15. Correct Work Center Composition

Remove the incorrect free-standing Work Center cycle-time field.

A Work Center must be composed from one or more Workstations.

The Work Center create/edit form must allow:

Select Shopfloor.
Select one or more Workstations belonging to that Shopfloor.
For every selected Workstation, display its supported Operations.
Select one or more Operations from those Workstations.
Require at least one selected Operation for the Work Center.

Example:

Workstation:
Trạm cắt laser số 01
WS-20260725-0004

Supported Operations:

[x] Cắt phôi
    Workstation estimate: 18 sec

[x] Cắt biên dạng
    Workstation estimate: 32 sec

[ ] Khoan lỗ
    Workstation estimate: 25 sec

Rules:

A Work Center contains at least one Workstation.
Every selected Workstation contributes at least one selected Operation.
A Work Center exposes at least one Operation overall.
Only Operations actively supported by a selected Workstation may be selected.
Workstations must belong to the same Shopfloor hierarchy.
Removing a Workstation or Operation requires dependency validation.
Routing continues to reference Work Center.

Do not change Routing to reference Workstation directly.

16. Central Skill Management

Create a dedicated Skill Management workspace.

Routes:

/master-data/skills
/master-data/skills/machines
/master-data/skills/workstations
/master-data/skills/work-centers

Use three tabs:

Machine Skills
Workstation Skills
Work Center Skills

Skills are centrally managed and reusable.

Do not create a separate isolated Skill record automatically for every resource.

Use:

interface SkillGroup {
  skillGroupId: string;
  skillGroupCode: string;

  scope: "Machine" | "Workstation" | "WorkCenter";

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
  scope: "Machine" | "Workstation" | "WorkCenter";

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
  assignmentId: string;

  resourceType: "Machine" | "Workstation" | "WorkCenter";
  resourceId: string;
  skillId: string;

  effectiveFrom: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";

  createdByUserId: string;
  createdAt: string;
  endedByUserId?: string;
  endedAt?: string;
}
17. Skill Management CRUD

Each Skill tab must provide CRUD for:

Skill Groups
Skills inside each group

Example:

Cutting Skills
- Laser Cutting
- Plasma Cutting
- Mechanical Cutting

Welding Skills
- MIG Welding
- TIG Welding
- Spot Welding

Generated prefixes:

SKG-MC
SKG-WS
SKG-WC

SK-MC
SK-WS
SK-WC

Codes are backend-generated and read-only.

Before editing or deleting a Skill, show dependencies:

Machines
Workstations
Work Centers
Operation Skill Requirements
Other active assignments

Rules:

Name and description may be changed after confirmation.
Scope cannot change after use.
Referenced Skills cannot be permanently deleted.
Deactivation is allowed only when business dependencies permit it.
Provide navigation to related resources.

Stable errors:

SKILL_REFERENCED
SKILL_SCOPE_IMMUTABLE
SKILL_GROUP_REFERENCED
SKILL_ASSIGNMENT_CONFLICT
18. Assign Skills to Resources

Machine, Workstation, and Work Center forms must allow one or more Skills from the corresponding scope.

Machine form

Show grouped Machine Skills.

A Machine must have at least one Skill when required by resource policy.

Workstation form

Show grouped Workstation Skills.

Work Center form

Show grouped Work Center Skills.

Example:

Cutting Skills
[ ] Laser Cutting
[ ] Plasma Cutting

Welding Skills
[ ] MIG Welding
[ ] TIG Welding

Use a grouped multi-select Combobox with chips.

Do not flatten all Skills into one list.

Resource creation and Skill assignment must be persisted transactionally where practical.

19. Inline “Other” Skill Creation

Add an option:

Other — Create a new Skill

When selected:

Open a Dialog or Drawer.
Use the same fields and validation as the Skill Management page.
Preselect the current resource scope.
Allow Skill Group selection.
Generate the Skill code.
Submit through the real central Skill API.
On success:
Add it to the client cache.
Display it immediately.
Select it automatically.
Preserve the unsaved parent form.
On failure:
Show an error toast.
Remove the optimistic Skill option or chip.
Allow the user to create it again.

Do not keep a temporary Skill in the resource form when central creation fails.

Use one reusable component:

<SkillSelectorWithCreate />
20. Readiness and Allocation Compatibility

Update planning readiness to consume the quantity-based Machine Requirement model.

Readiness must:

Resolve the Work Center.
Resolve Workstations supporting the Routing Operation.
Resolve Workstation Operation Capability.
Resolve active Machine Groups.
Resolve Primary and Supporting Machine requirements.
Resolve the required number of eligible Machine Units.
Validate status, calendar, assignment, and capability for required units.
Resolve Production Standard.
Return deterministic candidates.

Blocking examples:

WORKSTATION_OPERATION_NOT_SUPPORTED
MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE
PRIMARY_MACHINE_REQUIREMENT_MISSING
REQUIRED_MACHINE_UNIT_UNAVAILABLE
WORKCENTER_HAS_NO_OPERATION
RESOURCE_SKILL_MISSING

Work Order allocation must snapshot and reserve all resolved required Machine Units.

Do not treat one legacy Primary Equipment ID as the authoritative resource for new allocations.

Legacy compatibility fields may remain, but the Machine Group requirement snapshot and Machine Unit reservations are authoritative.

21. Shared Dependency Dialog

Create one reusable dependency-impact component for Machine, Workstation, Work Center, Skill, and related master data.

The dialog must show:

Allowed, warning, or blocked severity
Clear explanation
Related records grouped by entity type
Translated name as primary identity
Code as secondary identity
Navigation action for every relevant dependency
Confirm button only when the change is allowed
Deactivate alternative where appropriate

Do not show UUIDs.

22. Localisation

Add or correct all keys in:

Vietnamese
English
Japanese
Korean

Requirements:

No corrupted characters
No literal untranslated Hierarchy
No raw internal enum values
No code-only selector labels
No empty Status labels
No raw user IDs

Unknown values must use a translated fallback.

23. Required Acceptance Criteria

The work is complete only when:

Machine table shows total, assigned, and available quantities.
Machine supports edit, deactivate, and safe delete.
Machine mutations show dependency impact and navigation.
Unsafe quantity reduction is blocked.
Unsafe status changes are blocked.
Workstation table translations and business identities are correct.
Workstation supports edit, deactivate, and safe delete.
Created and updated actors are stored and displayed by name.
Status controls use the shared library-backed Switch.
Back is immediately to the left of Save.
Workstation and Work Center generated codes are immediately visible and read-only.
Hierarchy context displays translated names.
Exhausted Machines disappear from normal selectors.
Primary and Supporting requirements support quantities.
Minimum-machine and maximum-concurrent-job fields are removed.
Workstation manages supported Operations and cycle estimates.
Work Center selects one or more Workstations.
Work Center selects Operations supported by those Workstations.
Every Work Center exposes at least one Operation.
Work Center no longer owns the incorrect cycle-time field.
Skill Management provides Machine, Workstation, and Work Center tabs.
Skill Groups and Skills support complete CRUD and dependency rules.
Machine, Workstation, and Work Center forms support grouped Skill selection.
Inline Other creates a real central Skill and selects it immediately.
Failed inline Skill creation removes the temporary option and shows an error.
No normal UI displays UUIDs or raw user IDs.
Planning readiness resolves required Machine quantities.
Work Order allocation reserves every required physical Machine Unit.
New allocation revalidation uses Machine Group and Machine Unit data.
Existing Routing, Production Standard, readiness, and allocation compatibility is preserved.