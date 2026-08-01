# Audit and Redesign the MES Console MBOM Creation UX and Persistence Flow

## Objective

Audit and fix the current MBOM creation page in MES Console.

The current page is confusing and appears to have a mismatch between frontend draft state, backend persistence, validation, and substitute relationships.

Do not apply cosmetic changes only. Inspect the MES Console state flow, API calls, backend transaction order, database relationships, validation timing, and query invalidation before redesigning the UI.

---

# 1. Current User-Facing Problems

The current screen mixes three different concerns in one continuous form:

```text
MBOM structure list
MBOM component-line input
Component substitute input

Observed problems:

The component table is empty and shows:
No MBOM lines
The user fills the component form and clicks:
Add line
Instead of adding the component to the table, the UI returns:
MBOM must contain at least one line
The user cannot determine whether the entered component is:
only local draft state;
already added to the structure;
persisted in the database;
or being validated before persistence.
The substitute form is visible even when no persisted MBOM line exists.
A field labelled only as Line contains a meaningless single option such as Line.
The substitute form does not clearly distinguish:
original MBOM component;
substitute Item Revision.
Generic information icons do not explain the specific business meaning of each field.
2. Audit the Actual Create Flow

Trace the complete frontend and backend sequence for creating an MBOM.

Inspect:

MbomCreateScreen
MbomScreen
component form state
substitute form state
masterDataApi
TanStack Query mutations
query invalidation
MBOM detail hydration
structure replace endpoint
individual line endpoints
validation endpoint
release endpoint
database transaction

Determine which model is currently intended:

Model A — Persist Header First
Create Draft MBOM Header
→ receive mbom_header_id
→ create lines
→ create substitutes
→ validate
→ release
Model B — Atomic Draft Creation
Enter Header + Lines + Substitutes in local draft
→ Save Draft
→ backend creates the complete aggregate transactionally

Do not leave the implementation halfway between both models.

Document the selected model and explain why it matches the existing backend architecture.

3. Fix the “Add Line” Failure

Reproduce the current issue and capture:

button click handler
local state before click
request URL
request payload
response status/body
backend handler
database state before/after
validation invocation order
query cache before/after

Verify whether the error happens because:

validation runs before line insertion;
release validation is called instead of line creation;
the line exists only in stale local state;
the structure replacement request sends an empty line list;
the MBOM Header has not yet been persisted;
mbom_header_id is missing;
mutation ordering is incorrect;
query invalidation replaces optimistic state with an empty response;
incorrect API routing or payload mapping is used.

Required behaviour:

Fill component form
→ click Add component
→ component appears immediately in the structure table
→ form resets
→ user can add the next component

The action must never invoke release validation.

If persistence fails:

keep the entered values;
show the exact field or backend error;
do not clear the form;
do not display the unrelated “MBOM must contain at least one line” message.

Rename the button from a vague Add line to:

Add component

or:

Save component

according to the final interaction model.

4. Redesign the Page Structure

Create clear visual sections or workflow steps.

Recommended structure:

Step 1 — MBOM Information
Step 2 — Manufacturing Components
Step 3 — Substitute Materials
Step 4 — Validation and Review

At minimum, divide the current page into clear cards.

Manufacturing Components

Show:

Component hierarchy table/tree
[+ Add component]

Do not permanently display a large empty input form directly below the table.

Clicking Add component should open one of:

Dialog
Drawer
Expandable editor card

The editor must clearly show whether the user is:

Adding a component
Editing an existing component
Adding a child component

Provide:

Save component
Cancel

After saving:

close or reset the editor;
show the component in the structure immediately;
update the line count;
update structure_version;
preserve scroll position where practical.
Empty State

When no component exists, show:

This MBOM does not contain any manufacturing components yet.
Add the first component to define the manufacturing structure.
[Add first component]

Do not show a release-validation error before the user attempts validation or release.

5. Correct the Component Form

The component editor must contain:

Sequence
Parent component
Component Item Revision
Quantity per
UOM
Scrap rate
Issue operation
Backflush
Phantom
Optional
Effective from
Effective to
Parent Component

Rename Parent line to:

Parent component

Options must show meaningful business identity:

Localized component name
Item code
Revision code
Sequence

Example:

Rubber Compound
RM-RUBBER-01 · R1 · Sequence 10

Use:

Root component

for no parent.

Never show a generic option called only Line.

Disable invalid parents:

the current line;
descendants of the current line;
lines from another MBOM;
inactive or ended lines.
Component Item Revision

Show:

Localized item name
Item code
Revision
Item type
Item group
Base UOM
Lifecycle

Do not show ambiguous product labels.

Quantity and UOM

Use the authoritative UOM selector.

Validate precision and fraction rules before submission and again in the backend.

Clearly explain that quantity is relative to the MBOM Header Base Quantity.

6. Correct the Substitute Workflow

A substitute always belongs to one persisted MBOM Line through:

md_component_substitute.mbom_line_id

Audit the database schema and API to confirm this relationship is enforced by a foreign key.

Visibility Rule

Do not show the substitute creation form when no persisted MBOM Line exists.

Instead show:

Add at least one MBOM component before configuring substitute materials.
Preferred Interaction

Each component row should have an action:

Manage substitutes

Clicking it opens a dialog or drawer with the selected original component already fixed.

Display:

Original component
Substitute Item Revision
Priority
Conversion factor
Maximum usage percent
Requires approval
Effective from
Effective to
Reason / notes

The original component must be:

selected from an existing persisted MBOM Line;
shown as read-only inside the substitute dialog.

The user must not select an arbitrary generic Line value.

Field Naming

Use unambiguous labels:

Original MBOM component
Substitute material

Do not label both fields as Component.

Validation

Backend must reject:

missing mbom_line_id;
line from another MBOM;
substitute equal to original component;
duplicate active substitute;
incompatible technical group without approved exception;
incompatible UOM without valid conversion;
invalid effective period.

The UI must display these errors beside the related field.

7. Improve Field-Specific Help

Replace generic information icons with field-specific tooltips.

Required Vietnamese/English meanings should cover:

Sequence
Display and processing order among components with the same parent.
Parent Component
The parent node in the hierarchical manufacturing structure.
Leave empty for a root component.
Component Item Revision
The released material or semi-finished Item Revision consumed by this MBOM.
Quantity Per
The component quantity required for the MBOM Header Base Quantity.
UOM
The authoritative unit applied to this component quantity.
Scrap Rate
Expected additional material percentage used when calculating Work Order demand.
Issue Operation
The Routing operation where the material is issued or consumed.
Backflush
Automatically record material consumption when the assigned operation is confirmed.
Phantom
Do not create independent demand for this parent; explode its eligible child components instead.
Optional
Do not create mandatory material demand unless the component is explicitly selected.

Tooltips must not simply repeat the field label.

Update VI/EN/JA/KO translations.

8. Separate Draft Save from Validate and Release

The actions must have distinct meanings:

Add component
Save Draft
Validate Structure
Release MBOM

Required rules:

Add component only adds or persists the selected component.
Save Draft saves the current aggregate.
Validate Structure runs backend validation without changing lifecycle.
Release MBOM validates and releases.
The “MBOM must contain at least one line” error may appear during validation or release, but not after a successful component-add action.
Validation errors must not be displayed permanently before the user requests validation, except as contextual release-readiness guidance.

After the first line is added successfully, remove any stale empty-structure error automatically.

9. Database and API Verification

Verify the database relationships:

md_mbom_header
└── md_mbom_line
    └── md_component_substitute

Confirm:

each line has a valid mbom_header_id;
each substitute has a valid mbom_line_id;
parent line belongs to the same header;
substitutes cannot exist without an original line;
deleting or ending a line handles substitutes according to lifecycle policy;
Released structures cannot be mutated;
structure_version increments after every successful structure mutation.

Audit whether the create screen attempts to create substitutes using temporary client-only line IDs.

Temporary IDs may be used in local state, but the backend transaction must correctly map them to persisted line IDs atomically.

Do not persist fake or placeholder values such as:

Line
Row
temporary-line

as business references.

10. Required Browser Verification

Run the following scenarios in MES Console.

Scenario A — Add First Component
Create Draft MBOM
→ Add component A × 1 PCS
→ component appears in table
→ no empty-structure error
→ refresh browser
→ component still exists
Scenario B — Add Second Component
Add component B × 2 PCS
→ table contains A and B
→ form resets after each successful add
Scenario C — Add Child Component
Select A as parent
→ add child C
→ hierarchy renders A → C
Scenario D — Invalid Component
Enter 0 quantity
→ field-specific error
→ entered values remain
→ no unrelated MBOM-empty error
Scenario E — Substitute
Select the action on component A
→ Manage substitutes
→ original component is read-only A
→ select A-SUB
→ save
→ substitute appears under A
Scenario F — No Existing Component
Open a new empty MBOM
→ substitute form is hidden or disabled
→ clear guidance explains why
Scenario G — Persistence Failure

Simulate backend failure:

Add component
→ exact error appears
→ form data remains
→ table does not show a false success

Capture screenshots, network requests, payloads, responses, and database rows.

11. Documentation

Update:

process-fix/Improve-MBOM-Creation-UX-and-Persistence.md
implementation-fix/Improve-MBOM-Creation-UX-and-Persistence-Implementation.md
AI_CONTEXT.md
relevant product documentation

Record:

root cause of the current Add Line error;
selected persistence model;
frontend state flow;
backend transaction order;
component/substitute relationship;
revised UI interaction;
browser verification evidence;
remaining limitations.

Do not report completion based only on TypeScript build success.

Completion Criteria

Do not report completion unless:

clicking Add Component creates the first MBOM line successfully;
the line appears immediately and remains after refresh;
the stale “MBOM must contain at least one line” error disappears;
the form clearly separates add and edit modes;
substitute management is attached to a specific persisted component;
no meaningless Line option is shown;
substitute UI is unavailable when no component exists;
tooltips explain each field specifically;
validation, save, and release are separate actions;
database foreign keys and API payloads preserve Header → Line → Substitute relationships;
browser scenarios pass with runtime and database evidence.

Tóm lại, lỗi chính không chỉ là bố cục rối. Hiện tại **UI đang không biểu diễn đúng aggregate MBOM Header → MBOM Line → Substitute**, đồng thời hành động “Thêm dòng” có vẻ đang bị trộn với validation hoặc save toàn cấu trúc. Prompt trên buộc AI phải tìm root cause ở cả frontend state, API ordering và database relationship trước khi sửa giao diện.
