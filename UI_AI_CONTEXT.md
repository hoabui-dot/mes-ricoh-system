# UI_AI_CONTEXT.md

## Master Data - Tier 2 UI Specification

This document describes the current MES Console Tier 2 Master Data experience. It is intended as context for
AI agents modifying the UI, forms, validation messages, or related API mapping.

Scope:

- Factory
- Shopfloor
- Work Center
- Workstation
- Print Station
- Machine / Equipment
- Resource Assignment
- Resource Capability
- Resource Calendar
- Production Standard
- Operation Skill Requirement
- Reason Code
- Skill Management
- i18n Review

Tier 1 product master data, EBOM, MBOM, Routing, Production Version, Employees, Shifts, and Work Calendar have
separate UI contexts.

## 1. Shared UI behavior

### Identity display

Every entity displays its localized name as the primary identity and its business code as secondary information.
Internal UUIDs are never user-facing labels. Select options should use the same pattern:

```text
Localized name    BUSINESS-CODE    optional parent/site context
```

Status, type, lifecycle, role, and error codes must use the MES i18n map. Do not render raw enum values, error
keys, `[object Object]`, or untranslated backend payloads.

### Create and edit behavior

- Create uses the route's `new` state and starts with a clean form.
- Edit hydrates from the current backend record using a no-cache/latest-data request where the entity has
  effectivity, assignment, machine availability, capability, or dependency state.
- Entering Create after Edit must reset all previous form state.
- Save is the only point that persists the form. Repeatable sections are submitted as the complete desired
  configuration when the API contract uses replacement semantics.
- Save failures are shown as a translated toast. Structured validation details are available through the shared
  error-detail UI when the backend returns multiple failed conditions.
- Destructive actions use a shared confirmation dialog. A delete/deactivate action must not execute just because
  the user clicked the first action icon.
- A loading state is shown while the form hydrates dependent options. A partially hydrated form must not allow
  the user to submit stale or incomplete relationship values.

### Common warnings and validation presentation

The form must explain the business consequence, not only show a field-level technical error. Common warnings:

- Required relationship is missing.
- Selected record belongs to another Site, Shopfloor, Area, or Work Center.
- Selected record is inactive, obsolete, expired, or outside the effective date.
- A required machine quantity is larger than available physical capacity.
- A physical Machine Unit is already assigned or reserved in a conflicting effective period.
- A primary machine is missing from a machine requirement group.
- A required skill, capability, calendar, or standard is missing.
- A record is referenced by downstream configuration and cannot be deleted or changed in place.
- An edit changes a resource with existing assignments, Work Orders, Production Versions, or historical use.

The frontend may prevent an obvious invalid selection, but backend validation remains authoritative. The UI must
display the backend's translated error category and all useful detail returned by the API.

## 2. Factory

### Purpose

Factory is the site-level manufacturing context used by Shopfloor, Areas, Work Centers, Workstations, Equipment,
shifts, calendars, and product revision scope.

### List display

Show localized factory name, business code, timezone, active/inactive state, and lifecycle status.

### Create/Edit form

Fields:

1. **Factory name**
   - Localized text input.
   - Required.
   - The active language is edited through the common localized-name control.
2. **Factory code**
   - Backend-generated business code on Create.
   - Read-only in the form.
   - Existing code is never changed during Edit.
3. **Timezone**
   - Required factory timezone.
   - Used for date/effective and schedule interpretation.
4. **Active status**
   - Toggle for active/inactive state.
   - Deactivating a referenced factory must show dependency impact and may be blocked by backend policy.

### Form warnings

- A factory cannot be removed while child hierarchy or dependent master data references it.
- Deactivation prevents it from being selected for new dependent records.
- Changing timezone affects schedule interpretation and must show an impact confirmation where supported.

## 3. Shopfloor

### Purpose

Shopfloor groups production resources under a Site and is the parent context for Work Centers and Workstations.

### List display

Show localized name, code, parent Site, status, and child/resource context.

### Create/Edit form

Fields:

1. **Shopfloor name**: localized and required.
2. **Shopfloor code**: backend-generated on Create, read-only in the form.
3. **Factory/Site**: required selector; display Site name with code.
4. **Active status**: active/inactive control where supported by the resource lifecycle.

### Form behavior and warnings

- Site is the parent scope. Changing Site must clear child-dependent selections and must not leave a Work Center
  or Workstation pointing to the old Site.
- A Shopfloor with Work Centers or Workstations cannot be deleted.
- An inactive Shopfloor must not be offered when creating new Work Centers or Workstations.

## 4. Work Center

### Purpose

Work Center is the logical routing and resource-planning location. It groups Workstations and related capacity,
labor, calendar, capability, and production-standard data, but Routing does not select a Workstation directly.

### List display

Show business code, localized name, Work Center type, active/lifecycle status, and current/on-shift headcount.
Clicking a row opens Work Center detail; Edit opens the Work Center form.

### Create/Edit form layout

#### Basic information

1. **Work Center code**
   - Backend-generated reservation/code.
   - Read-only in the form.
2. **Work Center name**
   - Localized name input.
   - Required.
3. **Site**
   - Required selector.
   - Options show localized Site name and code.
4. **Shopfloor**
   - Required selector filtered to the selected Site.
5. **Production Area**
   - Required/validated hierarchy selector.
   - The selected Area must belong to the selected Site and applicable Shopfloor hierarchy.
6. **Work Center type**
   - Current options include Production and Inspection.
   - Display translated names.
7. **Active status**
   - Active/inactive toggle.

#### Scope boundary

The primary Work Center create/edit form contains only canonical Work Center fields: generated code, localized
name, Site, Shopfloor, Production Area, type, and active status. It does not create Resource Capabilities,
Production Standards, Workstation Supported Operations, or legacy Work Center Composition rows. Those are separate
planning/resource records and must be managed in their owning screens or retained only through compatibility APIs.

#### Save warnings

- A Work Center with routing, resource capability, employee, or Work Order references may not be
  deleted.
- Changing Site, Shopfloor, or Area can affect Routing and planning readiness. Show dependency impact and require
  confirmation when the current API reports impact.

### Work Center detail

Detail shows identity, Site/hierarchy, status, headcount, Workstations, and separately managed capability summary.
Employees currently on shift are informational and do not modify labor assignments.

## 5. Workstation

### Purpose

Workstation is a candidate execution location under a logical Work Center. Resource Planning evaluates and selects
it for a Routing Operation after the Work Order is created. It defines machine requirements plus effective actual
resource assignments.

### List and detail display

Show localized name, code, Site, Work Center, lifecycle/execution status, and machine/resource context.

Detail may include:

- hierarchy path;
- execution status and execution mode;
- Machine Requirement Groups;
- primary and supporting machines;
- effective Resource Assignments;
- assignment history/effectivity;
- resource skills;
- Print Station integration when configured.

The detail page also shows a **Machine Readiness** summary. It is a current master-data view, not a Work Order
capacity decision. It reports Ready, Warning, or Blocked; required quantity; effective assigned quantity; available
quantity; and translated blocking/warning reasons. Shift calendars, reservations, and Work Order capacity remain
authoritative in Resource Planning.

### Create/Edit form layout

Create and Edit have different resource lifecycles:

- **Create** shows Basic Information, Machine Requirements, and an **Initial assignments (after save)** notice.
  It must not render Current Assigned Machines, assignment history, or a readiness result because the Workstation has
  no persisted effective Resource Assignment yet. The backend creates initial assignments only after the Workstation
  save succeeds.
- **Edit** shows Basic Information, Machine Requirements, and the current effective Assigned Machines. The assignment
  list is read from `md_resource_assignment`, not inferred from requirement rows.
- **Detail** shows Machine Requirements, effective Assigned Machines, Machine Readiness, and Assignment History.
  Ended assignments remain historical and are not treated as current.

#### Basic data

1. **Workstation name**
   - Localized and required.
2. **Work Center**
   - Required selector.
   - Options show Work Center name/code.
   - Changing Work Center clears incompatible machine/assignment context and reloads availability.
3. **Hierarchy preview**
   - Shows Site -> Shopfloor/Area -> Work Center.
   - This is a read-only consistency preview, not an alternate input.
4. **Execution mode**
   - Kiosk, Manual, or Automatic.
5. **Active status**
   - Active/inactive state.

#### Machine Requirement Groups

This section answers “what machines does this Workstation require?” It does not by itself prove that a physical
machine is assigned or available.

Each group contains:

- localized Machine Group name;
- one or more required Equipment/Machine types;
- assignment role: Primary or Supporting;
- required quantity;
- requirement type: Required or Optional;
- optional pinned physical Machine Unit where configured;
- add/remove group and add/remove requirement actions.

The form must show available quantity for the selected machine and prevent selecting more quantity than the
currently available capacity when that availability is known. Availability is refreshed when the form opens and
when the Workstation changes.

Required validation:

- At least one Machine Requirement Group is required.
- Every group requires a Primary machine requirement.
- Required quantity is a positive integer.
- A machine cannot be counted beyond its available physical capacity.
- The same physical unit cannot be used in conflicting active assignments.
- Supporting Optional machines may be absent only when the policy allows it.

#### Assigned Machines

This section answers “which actual resources are assigned now?” It is separate from Machine Requirements.

Show the current effective assignments with:

- Equipment/Machine name and code;
- Machine Unit when available;
- assignment role;
- effective from/to;
- planning eligibility and operational status.

Historical assignments remain visible as history where supported. Ending or replacing an assignment preserves
the old effective row instead of overwriting it.

Do not label Machine Requirements as assigned machines. Requirements answer what the Workstation needs; assignments
answer which actual Equipment/Machine Unit is currently effective.

#### Skills

When the current Workstation form exposes resource skills, select reusable Skill Definitions and save the
assignment through the resource-skill API. Skills are not Workstation Supported Operations. Routing Operation owns
the Work Center; Resource Planning owns the runtime Workstation and machine selection.

#### Workstation warnings

- `WORKSTATION_MACHINE_REQUIREMENT_UNSATISFIED`: requirement cannot be fulfilled by effective assignments.
- `WORKSTATION_PRIMARY_MACHINE_MISSING`: a group has no Primary machine.
- `WORKSTATION_MACHINE_QUANTITY_INSUFFICIENT`: required quantity exceeds available units.
- `RESOURCE_ASSIGNMENT_NOT_EFFECTIVE`: assignment is outside the requested date/effective period.
- `MACHINE_UNIT_UNAVAILABLE`: physical unit is not operationally available.
- `MACHINE_UNIT_ALREADY_RESERVED`: physical unit has a conflicting reservation.
- Site or Work Center mismatch: selected Workstation, Equipment, Machine Unit, and assignment are not in the
  same valid hierarchy.

Do not add a duplicate Supported Operations editor to this form. A legacy capability route/table may still exist
for compatibility, but the Routing Operation authoring surface contains only Operation and logical Work Center;
runtime Workstation selection belongs to Resource Planning.

## 6. Print Station

### Purpose

Print Station represents the MES-side station definition and its Workstation binding/capacity. The real Printer
Adapter may run remotely; runtime state is supplied through Kafka/Projection Service.

### List display

Show station code, localized name, active binding count, effective allocation capacity, allocated quantity,
remaining quantity, and runtime status.

### Create form

1. **Print Station code**: required business code input in the current UI; backend validates uniqueness.
2. **Name**: required display name.
3. **Site**: required Site selector showing name and code.
4. **Description**: optional text.
5. **Gateway/base URL**: connection/management endpoint field when required by the station API. Do not confuse
   this with the remote Printer Adapter's production Kafka path.
6. **Deployment mode**: Physical, Simulation, or Hybrid, translated in the UI.

After successful creation, the station is selected and its current bindings/capacity are loaded.

### Station detail and binding form

Show capacity, allocated quantity, remaining quantity, ready printer count, runtime status, Kafka status, and
current Workstation bindings.

The Bind Workstation form contains:

- released/eligible Workstation candidate selector;
- binding role: Primary or Backup;
- allocated printer quantity, positive integer and no greater than remaining capacity.

Binding must be confirmed by the backend. Show translated errors for overlap, duplicate binding, unavailable
runtime, not-ready runtime, and capacity exceeded. Removing a binding requires confirmation and preserves any
historical record required by the API.

The Test Connection action is diagnostic. It may report a warning when the remote runtime is unavailable; it
must not silently convert an offline station into an online station.

## 7. Machine / Equipment

### Purpose

Equipment is the shared Machine Definition: type, model, efficiency, skills, and planning policy. A Physical Machine
Unit is one identifiable machine under that definition. The actual relationship between Workstation and equipment is
persisted through Resource Assignment, not a duplicate machine-ID list on Workstation.

### List display

Show localized machine/equipment name, code, Site, Work Center, lifecycle status, derived total/active/assigned/
available unit counts, and actions for detail, edit, delete, or deactivate according to dependencies. Aggregate
`quantity` is expected capacity only; it is not proof that physical units exist.

### Create/Edit form

1. **Machine name**: localized and required.
2. **Machine code**: backend-generated on Create and read-only; existing code is not changed on Edit.
3. **Site**: required selector; must be set even when Work Center is optional.
4. **Work Center**: optional or required according to current Equipment API; options are hierarchy-filtered.
5. **Description**: localized/long text where supported.
6. **Equipment type**: machine category/type.
7. **Manufacturer**: optional manufacturer text.
8. **Model**: optional model text.
9. **Expected Unit Count**: positive informational/catalog quantity only. It is not a physical identity, readiness,
   assignment, reservation, or Work Order capacity fact.
10. **Default efficiency**: positive efficiency factor.
11. **Catalog lifecycle**: Draft, Released, Inactive, or Obsolete. This is separate from a Physical Unit's execution
   state.
12. **Planning policy**: whether the definition is eligible for planning; actual eligibility still requires valid
   Physical Units and downstream readiness.
13. **Resource skills**: Skill Definitions required by the current form and validation rules.

The Machine Definition form does not edit aggregate serial number or physical execution status. Physical identity,
serial, lifecycle, execution state, planning flag, and unit-level actions belong to the Physical Machine Units panel.

### Machine actions and warnings

Before Edit/Delete/Deactivate, the UI loads dependency impact. Impact can include Machine Units, Workstation
Requirements, Machine Groups, Resource Assignments, Capabilities, Calendars, Production Standards, compositions,
and Skills.

- Delete is blocked when dependent or historical references make physical deletion unsafe.
- Deactivate/Obsolete is the alternative when a referenced definition must remain in history.
- Editing a machine with active assignments requires confirmation and backend validation.
- `site_id` is mandatory in the payload; never send a null Site because the form label was visually present but
  not mapped.
- Quantity cannot be lower than active assignment/use counts.

### Physical Machine Units

Machine detail includes Physical Machine Units. Each row shows asset/unit code, unique serial number, identity
status, lifecycle status, execution status, planning eligibility, current Work Center/Workstation, and assignment
context. Use **Add physical unit** to register one identified unit. Units without a serial are Pending Identification
and are not assignable, reservable, or executable. Activation/deactivation preserves assignment checks; movement and
history remain owned by Resource Assignment. The card uses the shared `BaseCardGrid` with TanStack-backed
pagination: 10 cards by default, with 10/50/100 page sizes. Delete is available only when the unit has no
assignment history and is not pinned by any Workstation Machine Requirement. The API rechecks these conditions
transactionally and returns `MACHINE_UNIT_DELETE_DEPENDENCY_EXISTS` for historical or active references; use
deactivation when the unit must remain auditable.

Machine Unit APIs:

- `GET /machines/:machineId/units`
- `POST /machines/:machineId/units`
- `GET /machine-units/:unitId`
- `PUT /machine-units/:unitId`

The UI must not render aggregate quantity as identified unit count. Machine Requirements select a Machine Definition
and required quantity; Assigned Machines resolve concrete Physical Machine Units.

### Won Seal Tech demo fixture

When the Won Seal Tech fixture is loaded, the Machine list contains Equipment definitions under the `WST-EQ-*`
namespace. The list projection shows localized name as the primary identity, code as the secondary identity, Site,
catalog lifecycle, expected count, total/identified/pending/available/assigned/maintenance/out-of-service/planning
unit counts. A fully assigned definition may correctly show zero currently available units; that is not an empty
definition. Open its detail to inspect Physical Machine Units, requirements, assignments, readiness, capabilities,
and calendars.

The fixture maps active machine families to existing released Workstations such as Mixing, Cutting, Mold, and QC.
Machine Groups describe interchangeable requirements, while the detail assignment view shows concrete Physical
Machine Units. The UI must not infer that a Machine Group or Expected Unit Count is a physical assignment. Obsolete
and inactive examples remain visible for lifecycle filtering and are not planning candidates. Printer devices remain
owned by Print Station and must not be expected in the MES Machine list.

The fixture is reset with `ALLOW_DESTRUCTIVE_SEED=true npm run machines:reset` and checked without mutation using
`npm run machines:verify`; these commands are development/demo operations, not normal UI actions.

## 8. Resource Assignment

### Purpose

Resource Assignment is the authoritative effective relationship among Work Center, Workstation, Equipment,
Machine Group, and Machine Unit.

### Create/Edit form

Fields:

1. **Assignment code**: backend-generated or API-owned code where exposed.
2. **Site**: required and used for hierarchy validation.
3. **Work Center**: required.
4. **Workstation**: required; filtered by Work Center and Site.
5. **Equipment/Machine**: required where the assignment targets an Equipment aggregate.
6. **Machine Group/Machine Unit**: selected when the assignment is physical/group-specific.
7. **Assignment role**: Primary/Supporting or current API-supported roles.
8. **Effective from**: required date-time.
9. **Effective to**: optional end date-time; must be after Effective From.
10. **Planning eligibility and active state**: shown when supplied by the API.

### Validation and warnings

- Workstation must belong to the selected Work Center.
- Equipment and Machine Unit must belong to the same Site.
- Machine Unit must belong to the selected Equipment aggregate.
- Effective interval must be valid.
- A physical Machine Unit cannot have conflicting active assignments.
- Ending or moving an assignment creates an ended historical row and a replacement row; it must not overwrite
  history in place.
- Workstation deletion/deactivation is blocked or warned when active assignments or Work Order history exists.

## 9. Resource Capability

### Purpose

Resource Capability states that a resource can perform an Operation, optionally for a Product Revision/Item
Group, with priority and speed/lot constraints.

### Create/Edit form

1. **Name** and **code**, according to the current API identity fields.
2. **Site**: required.
3. **Product Revision**: optional filtered released revision when the capability is product-specific.
4. **Item Group**: optional grouping constraint.
5. **Operation**: required reusable Operation.
6. **Work Center**: required.
7. **Equipment**: optional specific equipment restriction.
8. **Priority**: positive ordering number.
9. **Speed Factor**: positive factor.
10. **Minimum Lot Size / Maximum Lot Size**: optional numeric bounds.
11. **Setup Family**: optional setup grouping.
12. **Eligible**: capability eligibility toggle.

Warnings:

- Operation, Work Center, Equipment, Site, and Product Revision must be mutually compatible.
- Inactive resources or operations must not be selected for a new active capability.
- Invalid lot bounds or non-positive speed/priority values block save.
- A capability referenced by planning or released configuration must not be destructively changed without the
  dependency policy.

## 10. Resource Calendar

### Purpose

Resource Calendar defines availability for a Work Center, Workstation, or Equipment on a date and Shift.

### Create/Edit form

1. **Site**: required.
2. **Resource type**: Work Center, Workstation, or Equipment.
3. **Resource**: filtered by Resource Type and Site.
4. **Shift**: required site-compatible Shift.
5. **Calendar date**: required date.
6. **Availability status**: Available or current supported status.
7. **Available minutes**: non-negative capacity in minutes.
8. **Capacity factor**: positive multiplier.
9. **Reason**: optional Reason Code.

The UI converts the selected calendar date to the API's effective timestamp format. It must not change the
selected resource when the resource type changes without clearing/reloading the old resource.

Warnings:

- A resource calendar is not valid if Resource Type, Resource, Site, and Shift do not match.
- Negative minutes, zero/invalid capacity factor, or an incompatible Shift blocks save.
- Duplicate effective calendar entries are rejected or replaced according to the API contract; do not create
  duplicate rows by repeated Save.

## 11. Production Standard

### Purpose

Production Standard defines the time, quantity, yield, labor, and efficiency values used by planning and label
quantity calculation.

### Create/Edit form

1. **Name** and **code**.
2. **Site**: required.
3. **Item Revision/Product Revision**: required released compatible revision.
4. **Routing Operation**: required operation snapshot context.
5. **Work Center**: required and compatible with the Routing Operation.
6. **Equipment**: optional specific resource.
7. **Base Quantity**: required positive quantity; respects the selected UOM precision/fraction policy.
8. **Setup Time**: non-negative minutes.
9. **Cycle Time**: positive seconds.
10. **Required Persons/Labor Count**: positive integer.
11. **Standard Yield**: positive factor/percentage according to API contract.
12. **Efficiency Factor**: positive factor.
13. **Source Method**: optional origin/method text.
14. **Review Due Date**: optional date.

Field help must explain that Base Quantity is the reference quantity for cycle calculation. A missing, zero, or
invalid Base Quantity can block Work Order approval or print-label quantity calculation. Do not let number inputs
submit formatted strings with meaningless trailing decimal precision.

## 12. Operation Skill Requirement

### Purpose

Operation Skill Requirement defines the worker qualification needed for a Routing Operation. It is not a machine
or Workstation capability.

### Create/Edit form

1. **Routing Operation**: required and selected from current valid operation context.
2. **Skill**: required Skill Definition.
3. **Minimum Level**: required skill level.
4. **Required Persons**: positive integer.
5. **Mandatory**: required/optional toggle.

Warnings:

- Skill must be active and compatible with the worker scope.
- Required persons must be positive.
- Duplicate requirement for the same operation and skill should be rejected or replaced by the backend.
- Ending a requirement affects future planning but must not rewrite historical WO snapshots.

## 13. Reason Code

### Purpose

Reason Codes classify scrap, rejection, interruption, or other business decisions used by execution and quality
flows.

### Create/Edit form

The current Tier 2 route uses the shared Tier2 administrative screen. Its intended data is:

1. **Reason code**: unique business code.
2. **Localized name/description**: display text.
3. **Reason type/category**: scrap, defect, interruption, or supported backend type.
4. **Comment required**: whether users must explain the decision.
5. **Active/lifecycle status** where supported.

Do not treat the simple Tier2 list renderer as proof that all reason-code fields are available in the current
screen. If a form/API is added, preserve backend dependency and lifecycle validation instead of copying the
generic equipment screen.

## 14. Skill Management

### Purpose

Skill Management centralizes reusable Skill Definitions and their assignments to workers and resources.

### Tabs and scopes

- Machine Skills
- Workstation Skills
- Work Center Skills
- Worker Skills

Skill Groups are not the authority for a Skill Definition. The current flow keeps reusable Skill Definitions and
resource/worker assignments separate.

### Add/Edit Skill form

The Skill Definition form contains:

1. **Skill name**: localized and required.
2. **Skill code**: business identity according to API generation/entry behavior.
3. **Description**: localized optional description.
4. **Scope**: Machine, Workstation, Work Center, or Employee/Worker where supported.
5. **Status**: active/inactive lifecycle.

When a skill is created from a selected tab, its scope must match that tab. After Save, the list is refreshed from
the API so the skill remains visible after browser refresh.

### Worker Skill assignment form

Worker assignment contains:

- Worker selector;
- Worker Skill Definition selector;
- Qualification/skill level;
- effective/expiry date where supported;
- required/optional or qualification state where supported.

Assignments can be ended to preserve history. A skill referenced by an Operation Skill Requirement, resource, or
worker assignment cannot be physically deleted; use deactivation when lifecycle policy requires it.

### Skill warnings

- Scope mismatch between active tab and selected skill.
- Inactive skill or invalid group/scope.
- Duplicate active assignment.
- Expired worker qualification cannot satisfy a required operation skill.

## 15. i18n Review

The i18n Review route is an administrative quality screen for missing, fallback, or suspicious translations. It
does not change business master data. New Tier 2 labels, form help, warnings, status values, operation types,
roles, and backend error keys must be registered for VI, EN, JA, and KO using the existing i18n structure.

The default language is Vietnamese. A raw key is a UI defect. Form descriptions and warnings must explain the
business rule in the selected language, especially for hierarchy mismatch, resource availability, dependency
impact, effectivity, and lifecycle restrictions.

## 16. Cross-feature dependency rules

The following rules apply to every Tier 2 form:

```text
Site
  -> Shopfloor / Area
    -> Work Center
      -> Workstation
        -> Machine Requirements
        -> Resource Assignments
          -> Equipment / Machine Unit
```

Routing Operation selects the logical Work Center. Resource Planning evaluates candidate Workstations and their
machine requirements, assignments, capability, calendar, and capacity before committing a runtime allocation.
Workstation requirements must not be mistaken for the Work Order's actual runtime allocation. Production Version
readiness and Work Order Compute & Check consume these relationships through backend validation.

Before implementing a new field or action, inspect the current API response and schema. Only render a detail
field when the backend actually returns it; if a known field exists but is null, show the translated default or
Not Available value. Never invent a field solely because another Tier 2 screen displays a similar concept.

## 17. Reference source files

- `services/mes-console/src/components/Sidebar.tsx`
- `services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx`
- `services/mes-console/src/routes/master-data/WorkCentersScreen.tsx`
- `services/mes-console/src/routes/master-data/PlanningConstraintsScreen.tsx`
- `services/mes-console/src/routes/master-data/OperationCatalogScreen.tsx`
- `services/mes-console/src/routes/master-data/PrintStationsScreen.tsx`
- `services/mes-console/src/routes/master-data/SkillManagementScreen.tsx`
- `services/mes-console/src/i18n.ts`
- `product-doc/MES-DATABASE-ERD-AND-RELATIONSHIPS.md`

## 18. Work Order Resource Planning UI

Resource Planning is part of the Work Order detail route. The backend is authoritative; the Console renders server
state and sends explicit actions.

### Work Order creation

`/work-orders/new` must show only released/effective Production Versions, localized product/revision names first,
and Site-valid Shifts. Quantity is a positive UOM-aware value; zero, empty, negative, and malformed values must not
submit. The form uses an idempotency key and waits for the asynchronous creation workflow to report success before
opening the Work Order. The browser must never construct Routing, MBOM, resource, or Workstation IDs from labels.

Stable selectors:

```text
work-order-create-screen
work-order-production-version-field
work-order-create-submit
```

### Compute & Check and candidates

Compute & Check is a backend action. After completion the UI refetches the Work Order and renders returned planning,
labor, operation, and readiness values; React must not recalculate duration or readiness as a replacement decision.
Each operation displays localized operation name/code, sequence, Work Center, allocation status, duration,
capacity, labor assignments, machine requirement details, candidate blockers, and committed snapshot details.

Candidate cards show localized Workstation identity, Work Center, Equipment, machine group, readiness, capacity,
required/assigned/available quantities, and translated blockers. Only backend Ready candidates can enable Select and
Commit. Blocked/no-candidate states remain understandable and must never be converted to Ready in the frontend.

Stable selectors:

```text
work-order-resource-planning-tab
work-order-operation-row-{id}
candidate-workstation-list
candidate-workstation-card-{id}
candidate-workstation-status
candidate-machine-requirement
candidate-select-button
allocation-status-{index}
```

### Allocation actions

Select and Commit calls:

```text
POST /api/mes/execution/work-orders/{id}/operations/{opId}/resource-allocation
```

The request carries Workstation/Equipment/Machine Group, shift, planned start, candidate reference, row version,
trace ID, and idempotency key. The UI disables duplicate submission, shows translated feedback, closes the candidate
panel after success, refetches the Work Order, and shows `Committed` only from backend state.

`RESOURCE_CAPACITY_CONFLICT` is a translated HTTP 409 conflict. `RESOURCE_ALLOCATION_FORBIDDEN` is a translated
HTTP 403 permission error. Allowed mutation roles are `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`.
Raw keys, UUIDs, SQLSTATE text, `[object Object]`, and untranslated enum values are UI defects.

Allocation cancellation is confirmation-protected and uses the backend DELETE action. It cancels current editable
allocation/reservations while preserving audit history. Reallocation requires the backend change-reason policy and
must not silently overwrite previous snapshots.

### Approval and execution

Approval refetches/revalidates current committed allocations; a stale `Committed` label is not sufficient. Strict
policy requires a valid current committed allocation for every required operation. Material readiness is operation-
specific: a material-free operation must not wait for another operation's WMS material. Execution start is backend
authoritative and is blocked for missing, cancelled, or stale allocations. The temporary demo print-on-approval flag
must not be used to weaken normal strict resource planning UI validation.

### Refresh and persistence

After Compute & Check, commit, cancel, approval, or realtime reconnect, refetch the affected Work Order. Browser
refresh and logout/login must hydrate the persisted allocation snapshot rather than relying on local selection state.
Realtime invalidation may accelerate refetch but is not a substitute for backend state.

## 19. Machine Flow UI and E2E Context

Machine ownership is:

```text
Machine Definition -> Physical Machine Unit -> Machine Requirement -> Resource Assignment -> Readiness
```

Workstation Create shows Basic Information, Machine Requirements, and an initial-assignment explanation. It must not
show Current Assigned Machines before the Workstation exists. Edit/Detail shows requirements, actual effective
assignments from `md_resource_assignment`, Machine Readiness, and Assignment History.

The maintained Machine browser flow covers definition/unit creation, duplicate serial rejection, Workstation
requirement creation, Ready to Blocked transition after ending assignment, history, and dependency-protected unit
deletion. A second validation test verifies an empty Machine form remains open with required controls. Edit/delete/
deactivate, duplicate definition, search/filter/sort, overlap/effectivity, and all unit lifecycle variants remain
additional coverage.

## 20. Browser E2E Status and Commands

```text
npm run test:e2e:machine:smoke
npm run test:e2e:machine:all
npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:all
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:numbering
npm run test:e2e:all
npm run test:e2e:regression
npm run test:e2e:report
```

Latest verified result: `7 declared, 6 executed, 6 passed, 0 failed, 1 skipped`. The skipped case is Viewer
authorization because dedicated Keycloak Viewer credentials are unavailable; it is not counted as covered.
Resource Planning remains partially browser verified until stale-state, cancellation/replan, execution, capacity
boundary, logout/login, and full role/scope cases have dedicated fixtures.

Mutation E2E requires runtime credentials and local cleanup database URLs. Cleanup is exact-ID only and must report
zero remaining target rows. UI tests must never store credentials, delete by business code, or claim skipped tests
as successful coverage.

Canonical context/report files:

- `implementation-fix/resource-planning-design-verification-20260731.md`
- `implementation-fix/resource-planning-full-e2e-improvement-20260731.md`
- `implementation-fix/e2e-audit-20260731.md`
- `docs/testing/browser-e2e-usecase-inventory.md`
- `docs/testing/browser-e2e-coverage-matrix.md`
