# Work Center -> Workstation -> Machine Ownership Audit

Date: 2026-07-31

## Scope and conclusion

The running MES schema does not contain a machine-ID list on `md_workstation`.
The persisted relationship is already split across three concepts, but the
legacy Workstation form and some APIs make the distinction difficult to see.

`md_resource_assignment` is the authoritative source for an effective physical
assignment. `md_workstation_machine_group` and
`md_workstation_machine_requirement` describe the configuration required by a
Workstation. `wo_resource_allocation` remains the Work Order/time-window
commitment and is not master-data ownership.

No table was dropped and no historical row was rewritten. The correction is an
additive compatibility change: requirement and assignment APIs are validated
and kept synchronized where they represent the same machine-group operation.

## Ownership matrix

| Current Workstation machine field/UI section | Persistence table | Intended meaning | Authoritative? | Duplicate? | Action |
| --- | --- | --- | --- | --- | --- |
| `machine_id` in the legacy Workstation payload | No `md_workstation` column; consumed only by the create handler | Backward-compatible shortcut for one primary machine | No | Semantic duplicate of a default requirement + assignment | Keep temporarily; map transactionally and document as compatibility input |
| `machine_groups[].requirements[]` in the Workstation form | `md_workstation_machine_group` + `md_workstation_machine_requirement` | Required machine aggregate, role, quantity, optionality and pinned units | Yes for requirement configuration | Not a second physical-assignment list, but the old label implied that it was | Keep; label as Machine Requirements and show that it does not prove readiness |
| `primary_machine_id` / `supporting_machines` in payload | Normalized into the same two requirement tables and `md_resource_assignment` | Legacy form shape for group members | No independent persistence | Yes at API-shape level | Keep compatibility normalization; do not add a Workstation machine column |
| Effective group member rows | `md_resource_assignment` with `machine_group_id`, `equipment_id`, `machine_unit_id` | Actual Equipment/physical Unit currently assigned | **Yes** | No duplicate authoritative relationship | Keep as the source used by planning/readiness and expose separately in UI |
| Machine group header | `md_workstation_machine_group` | Requirement grouping and Workstation hierarchy | Yes for group configuration | No | Keep |
| Physical unit ownership | `md_machine_unit.machine_id` | Equipment aggregate -> physical Machine Unit | Yes | No | Keep |
| Generic assignment editor/API | `md_resource_assignment` | Direct effective assignment, including non-group assignments | **Yes** | No | Keep; add hierarchy/equipment/unit validation |
| Work Order resource proposal/commit | `wo_resource_allocation` | Runtime resource commitment for one WO operation and time window | **Yes for execution** | No | Keep separate from master-data assignment |

## Current flow

The Workstation save transaction receives machine groups. It locks the
Workstation, validates site/status/unit availability, ends the previous active
configuration, creates a new group and requirement rows, and creates one
`md_resource_assignment` row per resolved physical unit. This is replacement
semantics with effective-dated history, not two independent machine lists.

The audit found one real consistency gap: the dedicated machine-group member
endpoint inserted an assignment without inserting the matching requirement,
and ending/replacing a member did not end/update its requirement. That gap is
closed by the implementation accompanying this report.

## Readiness interpretation

Machine readiness must resolve, for each required group line:

`Routing Operation -> Workstation -> Machine Requirement -> effective Resource Assignment -> Equipment -> Machine Unit -> capability/calendar/operational state -> WO capacity reservation`.

A requirement row alone is not an assignment. An Equipment row alone is not a
physical unit. A resource assignment is valid only when its Workstation,
Work Center, Site, Equipment and Machine Unit are consistent and effective.

## Compatibility and migration decision

There is no proven duplicate Workstation-owned machine table or direct machine
column to remove. `md_workstation_machine_requirement` is retained because it
stores requirement quantity/role/pinned-unit intent, while
`md_resource_assignment` stores actual effective assignment history. No
migration is required for this correction. Existing APIs remain available and
their contracts are strengthened rather than removed.
