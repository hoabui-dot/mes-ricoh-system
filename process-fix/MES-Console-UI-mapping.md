Audit and update `UI_AI_CONTEXT.md` and the current MES Console UI mapping so that it matches the authoritative resource-planning architecture.

Do not implement UI changes from the document blindly. First compare the document with the current schema, APIs, routing model, resource-planning logic, Work Order allocation model, and active MES Console source.

The required architecture is:

```text
Routing Operation
  -> Work Center only

Work Center
  -> many candidate Workstations

Workstation
  -> Machine Requirement Groups
  -> effective Resource Assignments
  -> Machines and physical Machine Units

Work Order Resource Planning
  -> evaluate readiness
  -> score candidate Workstations
  -> select the Workstation and Machines
  -> commit allocation and capacity reservations
Required document corrections

Update every outdated statement that says:

Routing Operation selects an authoritative Workstation;
Workstation is directly owned or selected by Routing;
Work Center Composition defines Workstation-supported Operations;
Workstation Supported Operations are used for new planning.

Replace them with the current ownership rules:

Routing defines the logical Work Center.

Resource Planning resolves and scores physical Workstation candidates.

wo_resource_allocation is the authoritative current runtime resource commitment.

Routing and released Work Order definition snapshots must not be modified by allocation.

Do not preserve historical update notes or migration narratives in the UI context. Merge valid rules into permanent topic sections.

Work Center UI

Audit the current Work Center create/edit and detail screens.

The main Work Center form should manage only canonical Work Center-owned data.

Do not duplicate:

Resource Capability configuration;
Production Standard cycle/setup values;
Workstation Supported Operations;
legacy composition operation checkboxes.

If md_work_center_composition is only a compatibility hierarchy surface, remove it from the primary create/edit flow and expose it only where current users still require it.

Work Center detail should map related data through separate sections or tabs:

Workstations
Resource Capabilities
Resource Calendars
Production Standards
Current capacity/load
Workstation UI

Keep Machine Requirements and Assigned Machines clearly separate.

Machine Requirements

Show:

Machine Group
required Machine type
Primary or Supporting role
Required or Optional
required quantity
optional pinned Machine Unit
assigned quantity
available quantity
shortage/readiness status

Explain that a requirement does not prove that a physical Machine is assigned or ready.

Assigned Machines

Show effective md_resource_assignment records:

Machine
Machine Unit
Machine Group
role
effective from/to
operational status
planning eligibility
reservation state
readiness

Use command actions:

Assign
Move
End Assignment
Replace
View History

Do not expose a generic in-place Edit action that overwrites effective-dated history.

The Workstation detail page must include a required Machine Readiness section, not an optional diagnostic.

Show:

Ready
Ready with warnings
Blocked
Unknown

For every requirement group show:

required units
assigned units
available units
reserved units
missing quantity
blocking reasons
warnings
Resource Assignment UI

Keep the dedicated Resource Assignment screen as an advanced administration and audit workspace.

The primary user flows should also be embedded in:

Workstation detail;
Machine detail.

The dedicated screen is for:

cross-Workstation search;
unassigned Machines;
conflicting assignments;
bulk move/end;
effectivity history;
administrative correction.

Do not remove md_resource_assignment. It remains the authoritative effective physical relationship.

Machine terminology and UI

The business UI should consistently use:

Machine
Machine Unit
Machine Readiness

Internal database and API compatibility names such as md_equipment may remain.

Machine list should expose:

Machine identity
Site and Work Center
total Units
assigned Units
available Units
reserved Units
blocked Units
readiness summary
execution status
planning eligibility

Machine detail should include:

Overview
Machine Units
Assignments
Capabilities
Calendars
Reservations
Machine Readiness
Dependency Impact
Resource Capability UI

Map current fields to planning behavior:

Eligible
  = hard eligibility rule

Priority
  = scoring input

Speed Factor
  = duration and scoring input

Lot Size bounds
  = hard eligibility rule

Setup Family
  = setup/changeover scoring input

Add translated helper text and a planning-impact summary.

Do not recreate Workstation Supported Operations.

Resource Calendar UI

Audit and improve calendar UX for planning:

month/bulk view where supported;
copy/overwrite actions;
hierarchy inheritance indicator;
resolved calendar source;
available minutes;
reserved minutes;
remaining capacity;
PlannedDown/Holiday reason.

Frontend must consume backend-resolved calendar facts and must not independently reproduce calendar inheritance logic.

Work Order Resource Planning UI

Audit the Work Order Operation resource-planning section.

For each Routing Operation show:

Routing Work Center
candidate Workstations
Machine Readiness
score and rank
score breakdown
expected duration
available capacity
warnings and blockers
selected Workstation
selected Machine Units
allocation status

Support:

Recalculate
Auto Select
explicit planner override
Commit Allocation
Reallocate

Manual selection is a planner override at Work Order level. It must not write a Workstation back into Routing.

API and frontend mapping audit

Create a matrix:

UI screen/section	Current API	Current table/model	Correct owner	Current issue	Required change

Audit at least:

Work Center operation capabilities
Work Center composition
Workstation machine requirements
Assigned Machines
Resource Assignment CRUD
Machine list/detail
Resource Capability
Resource Calendar
Work Order resource candidates
allocation and reallocation

Do not invent UI fields that the backend does not return.

Where UI needs missing data, define the minimal backend projection or command API first.

Avoid frontend N+1 requests. List and detail APIs should return the required summary projections.

Required code review targets

Inspect at least:

services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx
services/mes-console/src/routes/master-data/WorkCentersScreen.tsx
services/mes-console/src/routes/master-data/PlanningConstraintsScreen.tsx
Work Order detail/resource-planning components
shared modal, form, table, selector, status, error-detail, and i18n components
Master Data resource handlers
resource-planning readiness API
Execution candidate/allocation APIs
current schemas and migrations
Deliverables
UI-document conflict report.
Updated authoritative UI_AI_CONTEXT.md.
UI-to-API ownership matrix.
Corrected Work Center UI.
Corrected Workstation requirements, assignments, and readiness UI.
Improved Machine list/detail UI.
Improved Resource Assignment administration UI.
Improved Work Order candidate scoring/allocation UI.
Required backend projection and command changes.
VI/EN/JA/KO translation updates.
Build, typecheck, API, and browser verification report.

Do not claim completion from compilation alone. Verify the actual create, edit, assign, move, end, readiness, candidate-selection, allocation, and reallocation flows in the running MES Console.