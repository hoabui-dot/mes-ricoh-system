# Fix Workstation Machine Group Availability and Assignment Validation

## Objective

Review and correct the complete Machine Group flow in:

```text
/master-data/workstations/new
/master-data/workstations/:id/edit

The current form has two critical problems:

It previously allowed users to request more Machines than the available physical Machine Units.
It now rejects valid Machine Groups with the unclear error:
Insufficient available machine quantity or a physical machine
has already been assigned to another Primary requirement.

Valid example currently rejected:

Machine A
Total physical units: 1
Available units: 1

Machine B
Total physical units: 1
Available units: 1

Machine Group:
Primary requirement: Machine A × 1
Supporting requirement: Machine B × 1

This is a valid configuration and must save successfully.

Audit and fix the database queries, availability calculation, physical-unit resolution, Resource Assignment compatibility writes, backend validation, frontend filtering, and error messages together.

1. Domain Model

Use these concepts consistently:

Machine Master
= A machine definition with a configured physical quantity.

Machine Unit
= One independently addressable physical unit.

Machine Group
= A combination of Machine requirements used by a Workstation.

Machine Requirement
= A Machine Master, role, quantity, and Required/Optional rule.

Example:

Machine A
├── Unit A-01

Machine B
├── Unit B-01

Machine Group 01
├── Primary: Machine A × 1
└── Supporting: Machine B × 1

The group requires two different physical units:

A-01
B-01

This is not a conflict.

2. Correct Requirement Rules

A Machine Group must support:

One or more Primary requirement lines
Zero or more Supporting requirement lines

Each requirement contains:

interface WorkstationMachineRequirement {
  machineId: string;
  role: "Primary" | "Supporting";
  requiredQuantity: number;
  requirementType: "Required" | "Optional";
  pinnedMachineUnitIds?: string[];
}

Validation:

Every group must have at least one Primary requirement.
requiredQuantity must be an integer greater than or equal to 1.
Primary quantity may be greater than 1.
Supporting quantity may be greater than 1.
Different Machine Masters may be used in Primary and Supporting requirements.
A Machine Master may not have duplicate lines with the same role in the same group.
A physical Machine Unit cannot satisfy two required slots in the same group.
A physical Machine Unit cannot be selected twice through different requirement lines.
Required shortages block saving.
Optional shortages produce a warning or allow a reduced optional selection according to the current policy.

Do not restore the deprecated standalone minimum-machine field.

3. Correct Availability Calculation

Availability must be calculated at physical Machine Unit level.

For each Machine Master:

Available configurable units
=
Active units
− units used by conflicting active requirements
− units used by conflicting active assignments
− units pinned elsewhere

Do not calculate availability by counting Machine Master rows.

Do not subtract the same active assignment twice when both the new requirement row and a compatibility Resource Assignment represent the same membership.

Audit for double counting between:

md_workstation_machine_requirement
md_resource_assignment
md_machine_unit

The newer Machine Requirement row should be the configuration authority.

Compatibility Resource Assignments must not make the same Machine Unit appear consumed twice.

4. Correct Primary Conflict Logic

The rule is:

The same physical Machine Unit
cannot be Primary in two active Workstations
during overlapping effective periods.

The rule is not:

Any Machine used as Supporting
conflicts with every Primary Machine.

The following must be valid:

Primary:
Machine A Unit A-01

Supporting:
Machine B Unit B-01

The following must be rejected:

Primary requirement 1:
Machine A Unit A-01

Primary requirement 2:
Machine A Unit A-01

The following must also be rejected when the same effective period overlaps:

Workstation 01:
Primary = Unit A-01

Workstation 02:
Primary = Unit A-01

Supporting-unit reuse must follow the current explicit policy. Do not accidentally apply the Primary uniqueness rule to all Supporting members.

5. Deterministic Unit Resolution

When the user selects a Machine Master and quantity without pinning units, the backend must resolve eligible units deterministically.

Recommended ordering:

Active
→ Available execution status
→ No conflicting effective assignment
→ No conflicting requirement
→ Unit sequence
→ Unit code

Example:

Machine A quantity = 3

Available:
A-01
A-02
A-03

Requirement:
Machine A × 2

Resolved:
A-01
A-02

Do not resolve the same unit for two separate requirement slots.

Resolve all requirements as one allocation problem, not one independent query per row that may repeatedly return the same first unit.

Suggested approach:

1. Load all requirement lines.
2. Load all eligible units for every selected Machine Master.
3. Remove units occupied by external conflicting records.
4. Track units selected within the current unsaved group.
5. Assign distinct units to every required slot.
6. Validate the complete group.
7. Persist the group and compatibility assignments transactionally.
6. Unsaved Form Availability

The frontend must account for selections already made in the current unsaved form.

Example:

Machine A has 2 available units.

Primary requirement:
Machine A × 1

A second requirement for Machine A must show:

Remaining in this form: 1

It must not still show 2.

When requirements are added, removed, or their quantities change:

Recalculate the local remaining quantity immediately.
Refetch backend availability only for affected Machine Masters when necessary.
Do not reload the entire Workstation form.
Remove exhausted Machines from normal selectable options.
If a selected row becomes invalid, keep the row visible with a clear validation message so the user can correct it.

Do not show an exhausted Machine as a normal selectable-looking option.

7. Workstation Create Transaction

Creating a Workstation with Machine Groups must be atomic:

Create Workstation
→ Create Machine Groups
→ Create Machine Requirements
→ Resolve distinct Machine Units
→ Create compatibility Resource Assignments
→ Commit

If any required Machine cannot be resolved:

Rollback the complete Workstation creation

Do not leave:

Empty Workstation records
Partial Machine Groups
Orphan requirements
Duplicate Resource Assignments
8. Workstation Edit Behaviour

When editing an existing Workstation:

Exclude the Workstation’s own current active requirements from external-conflict counting.
Existing units already assigned to the same unchanged requirement remain valid.
Do not report its own assignment as a conflict with itself.
Only newly requested quantity beyond the current assignment consumes additional availability.
Removed quantity must end effective-dated requirement/assignment rows.
Changed roles must preserve history.
Replacing a Primary must end the previous Primary membership and create the new one transactionally.

Example:

Existing:
Machine A Primary × 1 using A-01

Edit:
Keep Machine A Primary × 1
Add Machine B Supporting × 1

Expected:

A-01 remains valid.
B-01 is added.
No Primary conflict is raised.
9. Required Happy Cases
HC-01 — One Primary only
Machine A:
quantity 1
available 1

Group:
Primary A × 1

Expected:

Save succeeds.
One distinct Unit A is assigned.
HC-02 — Different Primary and Supporting Machines
Machine A:
quantity 1
available 1

Machine B:
quantity 1
available 1

Group:
Primary A × 1
Supporting B × 1

Expected:

Save succeeds.
A Unit is assigned as Primary.
B Unit is assigned as Supporting.
No Primary conflict.
HC-03 — Multiple Primary units of one Machine
Machine A:
quantity 3
available 3

Group:
Primary A × 2

Expected:

Save succeeds.
Two different A units are resolved.
HC-04 — Primary and Supporting quantities
Machine A:
available 2

Machine B:
available 3

Group:
Primary A × 2
Supporting B × 2

Expected:

Four distinct units are resolved.
HC-05 — Multiple groups in one Workstation
Group 1:
Primary A × 1
Supporting B × 1

Group 2:
Primary C × 1

Expected:

Save succeeds when all units are distinct and available.
Local form availability updates across groups.
HC-06 — Existing assignment retained during edit

Keep an unchanged current Primary requirement and add a new Supporting Machine.

Expected:

Existing unit does not conflict with itself.
Only the new Supporting unit requires new availability.
HC-07 — Optional Supporting shortage
Primary A × 1 Required
Supporting B × 1 Optional

B has no available unit.

Expected:

Apply the documented optional-member policy.
Normally allow saving with a warning.
Do not report a generic Primary conflict.
10. Required Edge Cases
EC-01 — Requested quantity exceeds available units
Machine A available: 1
Primary A × 2

Expected:

Block save.
Identify Machine A.
Show requested, available, and conflicting usage.
EC-02 — Duplicate Machine and role line
Primary A × 1
Primary A × 1

Expected:

Merge explicitly or reject as duplicate.
Do not let both lines independently resolve the same unit.
EC-03 — Same unit pinned twice
Primary A pinned A-01
Supporting A pinned A-01

Expected:

Reject with a specific duplicate-unit error.
EC-04 — Unit Primary elsewhere
A-01 is Primary in another active Workstation.

Expected:

A-01 is unavailable.
If no alternative unit exists, block save.
Show the related Workstation name and navigation action.
EC-05 — Inactive unit

Expected:

Exclude from availability.
EC-06 — Maintenance or OutOfService unit

Expected:

Exclude from new Required requirements.
Optional requirements may warn according to policy.
EC-07 — Machine Master inactive

Expected:

Do not show it as a selectable Machine.
Reject stale frontend submissions.
EC-08 — Quantity changed after form load

Another user consumes the last unit after this form loads.

Expected:

Backend revalidates during save.
Return a stale-availability error.
Frontend refreshes the affected Machine availability.
Preserve the rest of the Workstation form.
EC-09 — Effective-date overlap

A unit is free today but assigned during the requested effective period.

Expected:

Treat it as unavailable for that overlapping period.
EC-10 — Same Machine used in two groups

When a Machine Master has enough different units:

Group 1 uses A-01
Group 2 uses A-02

Expected:

Valid.

When only one unit exists:

Group 1 and Group 2 both require Machine A × 1

Expected:

Second requirement is blocked unless reuse is explicitly allowed by policy.
EC-11 — Partial persistence failure

If the compatibility Resource Assignment insert fails:

Expected:

Roll back Machine Group, requirements, units, and Workstation creation.
EC-12 — Legacy compatibility records

Legacy Resource Assignments may represent a requirement already migrated into the new model.

Expected:

Do not count both records as two separate consumptions.
Do not generate duplicate assignments.
11. Replace the Generic Error Message

Remove this ambiguous message:

Insufficient available machine quantity or a physical machine
has already been assigned to another Primary requirement.

Do not combine unrelated causes into one message.

Return stable, cause-specific error codes.

Quantity shortage
MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE

Friendly message:

Not enough physical machines are available.

Machine: 500-Ton Press
Required: 2
Available: 1

One unit is currently used by Workstation “Molding Station 02”.
Reduce the requested quantity or update the related Workstation.
Primary conflict
MACHINE_UNIT_PRIMARY_CONFLICT

Friendly message:

This physical machine is already assigned as a Primary Machine.

Machine unit: MC-500-01
Workstation: Molding Station 02

Choose another available unit or end the existing Primary assignment.
Duplicate unit in current group
MACHINE_UNIT_DUPLICATE_IN_GROUP

Friendly message:

The same physical machine cannot be used twice in one Machine Group.

Machine unit: MC-500-01
Stale availability
MACHINE_AVAILABILITY_CHANGED

Friendly message:

Machine availability changed while this form was open.

The affected Machine list has been refreshed.
Please review the highlighted requirements and save again.
Invalid status
MACHINE_UNIT_NOT_AVAILABLE

Friendly message:

The selected physical machine is no longer available.

Current status: Maintenance
Select another machine before saving.

Do not expose SQL errors, UUIDs, or internal table names.

12. Error Response Contract

Return structured diagnostics:

{
  "code": "MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE",
  "message": "Not enough physical machines are available.",
  "details": {
    "machine": {
      "id": "internal-id",
      "code": "MC-500",
      "name": {
        "vi": "Máy ép 500 tấn",
        "en": "500-Ton Press"
      }
    },
    "role": "Primary",
    "requested_quantity": 2,
    "available_quantity": 1,
    "conflicts": [
      {
        "workstation": {
          "id": "internal-id",
          "code": "WS-MOLD-02",
          "name": {
            "vi": "Trạm ép số 02",
            "en": "Molding Station 02"
          }
        },
        "quantity": 1
      }
    ]
  }
}

The UI must show translated names as primary identity and codes as secondary information.

13. Availability API

Audit or add a focused endpoint for the editor.

Suggested endpoint:

GET /api/mes/master-data/workstations/machine-availability

Parameters:

workstation_id
effective_from
effective_to
exclude_machine_group_id

Response per Machine:

{
  "machine_id": "internal-id",
  "code": "MC-500",
  "name": {
    "vi": "Máy ép 500 tấn",
    "en": "500-Ton Press"
  },
  "total_units": 3,
  "externally_committed_units": 1,
  "available_units": 2,
  "units": [
    {
      "unit_id": "internal-id",
      "unit_code": "MC-500-01",
      "available": true
    }
  ]
}

For edit mode, exclude the current Workstation/group’s unchanged active memberships so they do not conflict with themselves.

The final save endpoint must still revalidate transactionally.

14. Frontend Behaviour

The Machine Requirement editor must display:

Machine name
Code
Role
Required quantity
Required/Optional
Total units
Used elsewhere
Remaining available

Example:

500-Ton Press
MC-500

Total: 3
Used elsewhere: 1
Available: 2
Requested here: 2

When quantity changes:

Recalculate remaining availability immediately.
Highlight only the invalid requirement row.
Keep all other form inputs.
Show field-level errors.
Use a toast only for request-level failures.
Provide navigation to the conflicting Workstation where applicable.

Do not use one generic toast for all validation failures.

15. Persistence Authority

Clarify which records are authoritative:

md_workstation_machine_requirement
= Machine Group configuration authority

md_machine_unit
= Physical inventory authority

md_resource_assignment
= Effective resource-placement compatibility/history

Do not let compatibility assignments incorrectly replace or duplicate requirement demand.

Document how requirement rows map to Resource Assignments and which record is used for availability calculations.

16. Review Existing Consumers

After correcting the form, review:

Workstation detail
Machine detail
Resource Assignment
Phase 2 readiness
Phase 3 Work Order allocation
Machine quantity reduction validation
Machine change-impact API

They must all use the same requirement and unit-availability semantics.

Readiness must resolve distinct physical units for every required requirement quantity.

Allocation must reserve every resolved required unit.

17. Flow Script

Create one focused script:

scripts/test-workstation-machine-group-flow.mjs

Cover at least:

A ×1 Primary + B ×1 Supporting succeeds
A ×2 Primary succeeds when two units exist
A ×2 Primary fails when only one unit exists
Same unit cannot be reused twice
Current Workstation edit does not conflict with itself
External Primary assignment produces a specific conflict
Optional Supporting shortage follows policy
Concurrent availability change returns stale-availability error

Print:

case
request
resolved unit codes
result
error code
business message

End with:

PASS
FAIL

Review service logs and fix any unexplained validation or transaction errors before marking the task complete.

18. Acceptance Criteria

The task is complete when:

Machine A ×1 Primary + Machine B ×1 Supporting saves successfully when both have one available unit.
The form never allows required quantity above the actual remaining configurable units.
Availability is calculated from distinct physical Machine Units.
Current unsaved selections reduce local availability immediately.
A Workstation edit does not conflict with its own unchanged assignments.
Primary conflict validation applies only to genuine overlapping Primary unit assignments.
Supporting requirements are not incorrectly treated as Primary conflicts.
The same unit cannot satisfy multiple requirement slots.
Compatibility Resource Assignments are not double-counted with requirement rows.
All group persistence is transactional.
Generic combined errors are replaced by cause-specific business errors.
Errors show Machine, quantity, related Workstation, and remediation.
Exhausted Machines are removed from normal selector options.
Backend always revalidates availability during save.
Readiness and allocation continue to resolve and reserve every required physical unit.
The focused Machine Group flow script passes.