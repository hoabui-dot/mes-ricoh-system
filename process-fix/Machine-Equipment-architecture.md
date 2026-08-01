Audit and redesign the current Machine/Equipment architecture so that every physical machine has its own identity and can be traced to its current Workstation and Work Order usage.

The current design allows one Machine/Equipment aggregate to have `quantity = 100` and one optional serial number. This is not sufficient for physical resource ownership because the system cannot determine which individual machine is assigned, available, maintained, reserved, or used for execution.

Do not drop existing tables or rewrite historical Work Orders without a verified migration plan.

## Target domain model

Separate these concepts explicitly:

```text
Machine Definition
  = shared machine type/model/capacity definition

Physical Machine Unit
  = one individually identifiable physical machine

Resource Assignment
  = the effective relationship between one physical Machine Unit and a Workstation

WO Resource Allocation
  = the physical Machine Unit committed to one WO Operation and time window

A Machine Definition such as Hydraulic Press 500T may own 100 physical Machine Units, but every physical unit must have its own:

unit ID;
business/asset code;
unique serial number;
Site;
lifecycle status;
execution status;
planning eligibility;
effective Resource Assignment history.

The effective physical quantity of a Machine Definition must be derived from its active Machine Units, not trusted from an independently editable aggregate quantity.

Schema and ownership audit

Audit the actual schema and all consumers of:

md_equipment;
md_machine_unit;
md_resource_assignment;
md_workstation_machine_group;
md_workstation_machine_requirement;
wo_resource_allocation;
wo_capacity_reservation;
Machine/Equipment APIs;
Workstation APIs;
readiness and candidate-selection APIs;
MES Console Machine, Workstation, and Resource Assignment screens.

Determine whether md_machine_unit already contains all required physical identity fields. Extend the existing table instead of creating a duplicate physical-machine table when possible.

The canonical hierarchy must become:

Machine Definition
  -> many Physical Machine Units

Physical Machine Unit
  -> effective Resource Assignment
  -> one current Workstation at a time

WO Operation
  -> committed Physical Machine Unit allocation
Required validation

Enforce backend-authoritative rules:

Physical Machine Unit asset code is unique within its defined scope.
Serial number is unique according to the business policy.
A Machine Unit belongs to exactly one Machine Definition.
Machine Unit Site must match its Machine Definition and assignment hierarchy.
A Machine Unit cannot have conflicting active Workstation assignments.
A Machine Unit cannot be assigned, reserved, or used for execution when inactive, unidentified, under maintenance, or out of service.
A Workstation requirement may reference a Machine Definition and required quantity.
An actual assignment must resolve to a physical Machine Unit.
Work Order allocation must resolve to physical Machine Units before commitment or execution.
Ending or moving an assignment preserves effective-dated history.
Aggregate quantity must never be used as proof that physical units exist.
Quantity and serial-number correction

Move physical serial-number ownership from the Machine Definition level to the Physical Machine Unit level.

Do not treat one aggregate serial number as the identity of multiple machines.

Either remove the editable aggregate quantity field from the canonical UI or redefine it as non-authoritative expected capacity. Display derived values instead:

total physical units;
active units;
assigned units;
available units;
reserved units;
maintenance units;
out-of-service units;
unidentified units.
Migration strategy

Classify every existing Machine/Equipment record:

Quantity = 1 with a usable unique serial number

Create or map one Physical Machine Unit and move the serial identity to that unit.

Quantity > 1 with one serial number

Treat the record as ambiguous. Do not duplicate the serial number across generated units. Require an explicit physical-unit import or reconciliation workflow.

Quantity > 1 without physical serial numbers

Do not silently create production-ready machines.

Either:

require users to import/register the physical-unit list; or
create Draft/PendingIdentification unit placeholders only when explicitly approved.

Placeholder units must not be planning eligible, assignable, reservable, or executable until a valid physical identity is supplied.

Produce a migration reconciliation report containing:

source Machine;
declared quantity;
existing physical-unit count;
missing-unit count;
duplicated or ambiguous serial data;
active assignments;
affected readiness/allocation records;
required manual action.

All migrations must be additive, repeatable, transaction-safe, and reversible where possible.

API changes

Provide canonical APIs for:

listing Physical Machine Units under a Machine Definition;
creating one unit;
bulk importing units;
updating unit identity and operational status;
activating/deactivating a unit;
viewing current assignment and assignment history;
assigning, moving, and ending a unit assignment;
retrieving physical Machine Readiness;
resolving assignable/available units for a Workstation requirement.

Do not expose generic in-place edits that overwrite effective assignment history.

MES Console changes
Machine Definition form

Keep shared definition fields only:

name;
code;
type;
manufacturer;
model;
default efficiency;
skills;
active status.

Remove or deprecate aggregate physical serial-number input.

Do not present an editable quantity as authoritative physical inventory.

Machine detail

Add:

Overview;
Physical Machine Units;
Requirements;
Assignments;
Capabilities;
Calendars;
Reservations;
Machine Readiness;
Dependency Impact.

The Physical Machine Units table must show:

unit/asset code;
serial number;
lifecycle status;
execution status;
planning eligibility;
current Work Center;
current Workstation;
current WO reservation/allocation;
readiness;
actions.

Support Add Unit, Bulk Import, Move, End Assignment, Activate, Deactivate, and History.

Workstation assignment UI

Machine Requirements continue to select a Machine Definition and required quantity.

Assigned Machines must select concrete available Physical Machine Units.

Never display an aggregate Machine quantity as if those units were already identified and assignable.

Compatibility

Preserve existing Machine/Equipment IDs, historical assignments, released configuration, and immutable Work Order snapshots.

Keep legacy fields and API inputs temporarily when necessary, but:

mark them deprecated;
stop using them in new MES Console authoring;
do not return them as canonical physical identity;
measure remaining usage;
provide a controlled removal plan.
Documentation and verification

Update:

ERD documentation;
AI_CONTEXT.md;
UI_AI_CONTEXT.md;
API contracts;
seed and cleanup scripts.

Verify in the running system:

Create one Machine Definition for a 500-ton press.
Register at least three physical units with distinct serial numbers.
Assign different units to different Workstations.
Confirm one unit cannot have conflicting effective assignments.
Confirm Workstation readiness resolves physical units.
Confirm WO planning selects and commits a concrete Machine Unit.
Confirm execution and audit history identify the exact physical serial number.
Confirm moving or ending the assignment preserves history.
Confirm an aggregate with declared quantity but missing physical units is not considered physically ready.

Provide a final schema/API/UI ownership matrix, migration report, runtime verification evidence, and remaining compatibility limitations.