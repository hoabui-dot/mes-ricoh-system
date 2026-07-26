# Improve Operation CRUD Help Tooltips and Worker Skill Requirements

## Objective

Improve the MES Operation create, edit, and detail experience so users can clearly understand every execution-related field.

Add a visible circular information icon next to fields that require domain explanation. Hovering or focusing the icon must open a well-formatted tooltip with friendly, practical guidance.

Also add Default Worker Skill Requirements to Operation CRUD.

Do not add Machine Skills or Workstation Skills to the Operation form.

---

# 1. Skill Decision

The Operation form must manage only:

```text
Default Worker Skill Requirements

Do not include:

Machine Skills
Workstation Skills

Use this separation:

Machine Skills
= Technical capabilities of a Machine.

Workstation Skills
= Process capabilities of a Workstation.

Worker Skills
= Qualifications required from employees executing an Operation.

The Operation Catalog stores reusable default Worker Skill Requirements.

When an Operation is selected in a Routing Operation:

Load the Operation defaults.
Allow the Routing Operation to confirm or override them.
Persist the final execution requirement at Routing Operation level.
Do not silently overwrite existing released Routing requirements.
2. Default Worker Skill Requirements in Operation CRUD

Add a section:

Default Worker Skill Requirements

Vietnamese:

Yêu cầu kỹ năng nhân viên mặc định

Allow one or more requirement rows.

Each row contains:

interface OperationDefaultWorkerSkillRequirement {
  operationId: string;
  skillId: string;

  minimumLevel: string;
  requiredPersons: number;
  mandatoryFlag: boolean;

  effectiveFrom?: string;
  effectiveTo?: string;

  status: "Active" | "Inactive";
}

Fields:

Worker Skill
Minimum level
Required persons
Mandatory
Effective period
Status
Remove action

Only Skills with:

scope = Employee

may be selected.

Do not show Machine, Workstation, or Work Center Skills.

Validation:

Skill must be active.
Skill scope must be Employee.
Minimum level must exist in the Skill level scale.
Required persons must be an integer greater than zero.
Do not allow duplicate active requirements for the same Skill.
Effective end must be after effective start.
At least one requirement is optional at Operation Catalog level unless business policy explicitly requires it.
Referenced requirements must preserve historical records through effective dating.

Stable errors:

OPERATION_WORKER_SKILL_SCOPE_INVALID
OPERATION_WORKER_SKILL_DUPLICATE
OPERATION_WORKER_SKILL_LEVEL_INVALID
OPERATION_WORKER_SKILL_PERSONS_INVALID
3. Routing Inheritance

When a user selects an Operation in Routing:

Load active default Worker Skill Requirements from the Operation.
Display them in the Routing Operation form.
Mark them as:
Inherited from Operation
Allow the user to:
Keep the defaults
Change minimum level
Change required persons
Change mandatory status
Add another Employee Skill
Remove an inherited requirement with confirmation

The final Routing Operation Skill Requirements remain authoritative for execution planning.

Changing Operation defaults must not automatically rewrite existing Released Routings.

4. Information Icon

Add a circular information icon after the label of each unclear field.

Required visual:

Field Label  ⓘ

The icon should:

Use an existing shadcn/Radix tooltip primitive.
Be circular.
Show an information or exclamation symbol.
Open on mouse hover.
Open on keyboard focus.
Have an accessible label.
Work in light and dark mode.
Never require clicking for basic help.
Remain usable on touch devices through focus or tap.
Not change the form value.

Recommended reusable component:

<FieldHelpTooltip
  title={...}
  summary={...}
  sections={...}
  example={...}
/>

Do not implement a custom tooltip positioning engine.

5. Tooltip Content Format

Every tooltip must use a consistent readable structure:

Title

What it means
Short and friendly explanation.

When to use it
Practical conditions or use cases.

Example
A concrete manufacturing example.

Important
Any dependency, restriction, or consequence.

Use short paragraphs and compact bullet points.

Avoid exposing database names, enum names, UUIDs, or implementation details.

Tooltips may be wider than a normal one-line tooltip. Use a Popover-style help panel when the content does not fit comfortably in a standard Tooltip.

6. Confirmation Mode Tooltip

Field:

Confirmation Mode

Vietnamese:

Chế độ xác nhận

Tooltip content:

How is this Operation confirmed?

This setting determines how the MES records that the Operation was performed.

Start and Finish
The operator starts the Operation and finishes it later. The MES records actual start time, end time, and duration.

Quantity Only
The operator does not create a timed execution session. They only report the completed quantity.

Automatic
A Machine, PLC, IoT device, or integrated system reports the Operation automatically.

Example
Use Start and Finish for pressing, cutting, welding, or machining.
Use Quantity Only for counting or simple manual confirmation.
Use Automatic only when a real machine integration exists.

The Operation model currently distinguishes StartFinish, QuantityOnly, and Auto.

7. Quantity Reporting Tooltip

Field:

Quantity Reporting

Vietnamese:

Báo cáo số lượng

Tooltip content:

What quantities must the operator report?

Good Only
The operator reports only accepted quantity. Scrap is not recorded at this Operation.

Good and Scrap
The operator reports accepted quantity and rejected quantity. A scrap reason may also be required.

Example
Use Good and Scrap for pressing, cutting, machining, and inspection steps where defects may occur.
8. Material Scan Tooltip

Rename the label to:

Require Material Scan

Vietnamese:

Bắt buộc quét vật tư

Tooltip content:

Must the operator scan materials before confirmation?

When enabled, the operator must scan the lot, serial number, QR code, or material label required by the MBOM for this Operation.

The Operation does not define the material or quantity itself.
Material identity and quantity are configured in the product MBOM.

Example
A molding Operation may require scanning the rubber blank and metal core before production starts.

Important
The MES should block confirmation when a mandatory material scan is missing or invalid.

Do not add material item and quantity fields directly to the generic Operation Catalog.

9. Output Label Tooltip

Rename the label to:

Require Output Label

Vietnamese:

Bắt buộc tạo nhãn đầu ra

Tooltip content:

Must the MES create or activate an output label?

When enabled, completing this Operation must create or activate an output label according to the product traceability policy.

The label type, template, numbering rule, and payload are controlled by Traceability configuration.

Example
A cutting Operation may create child labels.
A molding Operation may create a finished-product label.
A final inspection Operation may activate a PASS label.
10. Partial Completion Tooltip

Rename the label to:

Allow Partial Confirmation

Vietnamese:

Cho phép xác nhận từng phần

Tooltip content:

Can the required quantity be confirmed in multiple submissions?

When enabled, operators may report the Operation several times until the full required quantity is completed.

Example
A Work Order requires 1,000 pieces:
- First confirmation: 300
- Second confirmation: 400
- Final confirmation: 300

When disabled, the Operation should normally be completed in one final confirmation.
11. Scheduling Tooltip

Rename the label to:

Require Resource Scheduling

Vietnamese:

Yêu cầu lập lịch tài nguyên

Tooltip content:

Must this Operation receive a planned resource allocation?

When enabled, the Operation must be assigned to a supported Work Center, Workstation, Machine Group, Shift, and planned time before release.

When disabled, the step may be logical, administrative, or automatically executed without consuming planned capacity.

Example
Pressing, cutting, and welding normally require resource scheduling.
An automatic system status update may not require scheduling.

Audit the current field meaning before renaming. Preserve compatibility if it already drives planning logic.

12. Operation Type Tooltip

Field:

Operation Type

Vietnamese:

Loại công đoạn

Tooltip content:

What kind of work does this Operation represent?

Production
Transforms or manufactures material.

Inspection
Checks product or process quality.

Packing
Packages or labels output for storage or delivery.

Handling
Moves, stages, loads, or transfers material.

This classification helps the MES choose suitable workflows, permissions, and reporting behaviour.
13. Worker Skill Section Tooltip

Label:

Default Worker Skill Requirements

Vietnamese:

Yêu cầu kỹ năng nhân viên mặc định

Tooltip content:

Which employee qualifications are normally required for this Operation?

Add the Worker Skills, minimum levels, and number of qualified employees normally needed to execute the Operation safely and correctly.

These are reusable defaults.
A Routing Operation may adjust them for a specific product or manufacturing route.

Example
Hydraulic Press Operation:
- Hydraulic Press Operation, minimum L2, 2 persons, mandatory
- Press Safety, minimum L1, 1 person, mandatory

Important
Only Employee Skills belong here.
Machine and Workstation Skills are resource capabilities and are configured on those resources instead.
14. Skill Row Tooltips
Worker Skill
Select the employee qualification required to perform this Operation.

Only active Employee Skills are available.
Minimum Level
The lowest acceptable qualification level.

An employee with a lower level does not satisfy this requirement.
Required Persons
The number of qualified employees required at the same time.

Example
Enter 2 when two L2 press operators must be available for execution.
Mandatory
Mandatory requirements may block assignment or execution when they are not satisfied.

Non-mandatory requirements produce a warning but do not necessarily block the Operation.
15. UI Layout

Reorganise the Operation form into sections.

Basic Information
Operation name
Code
Description
Operation type
Status
Execution Behaviour
Confirmation mode
Quantity reporting
Allow partial confirmation
Require resource scheduling
Execution Requirements
Require material scan
Require output label
Default Worker Skill Requirements
Skill requirement rows
Add requirement action

Every non-obvious field must have:

Label + circular help icon

Do not rely on placeholder text as the only explanation.

16. Detail and Help Content

The Operation detail page and page-detail help modal must explain:

Operation
= Reusable definition of the manufacturing step.

Material and quantity
= Defined by MBOM lines assigned to the Operation.

Worker Skill Requirements
= Employee qualifications required to execute the Operation.

Machine and Workstation Skills
= Resource capabilities configured outside the Operation form.

Workstation Operation Capability
= Defines which Workstation can execute the Operation and its estimated timing.

Routing Operation
= Places the Operation into a product-specific sequence and owns the final Worker Skill Requirements.

Use friendly VI/EN/JA/KO content.

17. Acceptance Criteria

The change is complete when:

Operation CRUD contains Default Worker Skill Requirements.
Only Employee Skills are selectable in this section.
Machine and Workstation Skills are not shown in Operation CRUD.
Each skill requirement supports minimum level, required persons, and mandatory status.
Routing can inherit and override Operation default Worker Skill Requirements.
Existing Released Routing requirements are not silently changed.
Confirmation Mode has a clear help icon and formatted explanation.
Quantity Reporting has a clear help icon and formatted explanation.
Require Material Scan has a clear help icon and explains the MBOM relationship.
Require Output Label has a clear help icon and explains Traceability ownership.
Allow Partial Confirmation has a practical quantity example.
Require Resource Scheduling clearly explains allocation consequences.
Operation Type has a friendly explanation.
Worker Skill fields each have clear help content.
Tooltips use shared shadcn/Radix components.
Tooltips work through hover and keyboard focus.
All help content is available in VI/EN/JA/KO.
No tooltip exposes UUIDs, database terminology, or raw enum values.