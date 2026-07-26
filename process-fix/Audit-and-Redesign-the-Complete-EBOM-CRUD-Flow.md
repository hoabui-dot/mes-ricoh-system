# Audit and Redesign the Complete EBOM CRUD Flow

## Objective

Audit and correct the complete EBOM flow in MES Console and `mes-master-data-service`.

Current Create EBOM UI is too shallow and does not clearly represent the real EBOM lifecycle:

```text
Create EBOM header
→ Build engineering design tree
→ Validate the tree
→ Release EBOM
→ Convert Released EBOM to MBOM Draft

Do not redesign the flow only from the current modal. First inspect:

Running source code
Migration 0010_ebom_and_mbom_traceability
EBOM header and line schemas
EBOM APIs
EBOM list/detail/create/edit/release flow
Released EBOM → MBOM Draft conversion
Item Revision relationships
MBOM source-line traceability
Current i18n and validation contracts

Preserve the actual implemented domain contract. Do not remove Item Revision unless the running schema and business rules prove that it is incorrect.

Required UX Flow
1. Create EBOM Header

The Create dialog should contain only the fields required to establish the EBOM header.

After successful creation:

Create EBOM
→ Navigate directly to EBOM Detail / Design Tree Editor

Do not keep the user in a modal that tries to manage the complete component tree.

The form should clearly explain that the selected Item Revision is the engineering output/design target of this EBOM.

Use backend-generated business code when the current backend already owns code generation. Do not ask users to manually enter a code when it should be generated.

2. EBOM Design Tree Editor

The EBOM detail/edit screen must provide a proper hierarchical component editor.

Each line should support the actual schema fields found in the migration/API, including where applicable:

Parent line
Component Item Revision
Sequence
Quantity
UOM
Engineering notes
Optional or alternative designation
Effectivity
Lifecycle state

Do not invent unsupported fields. Add only fields proven by the current schema or an explicitly approved migration.

Required tree behaviour:

Add root component
Add child component
Edit line
Remove draft line
Reorder siblings safely
Expand/collapse hierarchy
Prevent circular parent relationships
Prevent a line from becoming its own parent
Validate positive quantity
Display localized Item name as primary identity
Display Item code and revision as secondary identity
Never expose UUIDs as the main label
3. Lifecycle

Use the current lifecycle model from the backend.

At minimum, clearly separate:

Draft
Released
Obsolete/Inactive

where supported.

Rules:

Draft EBOM can be edited.
Released EBOM must not be silently mutated.
Releasing requires a valid non-empty design tree.
Historical released engineering data must remain auditable.
The UI must explain why editing is disabled for released records.
Do not weaken backend release validation.
4. Released EBOM to MBOM Draft

Provide a clear action on a Released EBOM:

Convert to MBOM Draft

Before conversion, show a confirmation dialog explaining:

EBOM contains the engineering design structure.
MBOM contains the manufacturing structure.
Conversion creates a new MBOM Draft.
The conversion does not modify the released EBOM.
The resulting MBOM may require manufacturing-specific quantities, scrap, phantom, issue-operation, and backflush configuration.
MBOM source lines must retain traceability to their originating EBOM lines.

After successful conversion:

Open the created MBOM Draft detail/editor

Do not silently redirect without identifying the created MBOM.

5. List and Detail Pages

EBOM list should show meaningful business information:

EBOM code
Localized name
Target Item Revision
Revision/item context
Lifecycle status
Number of current design-tree lines
Created/updated information where currently available

EBOM detail should show:

Header information
Target Item Revision
Lifecycle status
Engineering design tree
Release action
Convert-to-MBOM action when eligible
Audit/effectivity information supported by the backend

Historical or inactive lines must not appear as current editable lines.

Field Help Icons and Popovers

Add a reusable InfoTooltip or shadcn/Radix Popover help icon beside every field label in all EBOM CRUD forms.

Use a visible ! icon inside a small circular button.

Example:

Item Revision *  (!)

Requirements:

Use shared shadcn-style and Radix primitives.
Do not use native browser title tooltips.
Keyboard accessible.
Focusable.
Has an accessible aria-label.
Works in light and dark themes.
Does not trigger form submission.
Does not block label/input interaction.
Localized in VI/EN/JA/KO.

Each popover must explain:

What the field means.
Why the field is needed.
How it affects EBOM behaviour.
A concise example where useful.
Whether it can be changed after release.

At minimum provide help content for:

Item Revision

Explain:

The finished or semi-finished Item Revision whose engineering
design structure is defined by this EBOM.

Do not describe it as a component selector.

EBOM Name

Explain:

A human-readable engineering structure name used to identify
the EBOM in lists, reviews, and conversion workflows.
Description

Explain:

Optional engineering context, design purpose, assumptions,
or scope notes for this EBOM.
Component Revision

Explain:

The Item Revision used as a component in the engineering
design structure.
Parent Component

Explain:

The direct parent line under which this component appears
in the EBOM hierarchy.
Sequence

Explain:

The ordering value among components under the same parent.
It controls display and deterministic tree ordering.
Quantity

Explain:

The engineering quantity of this component required for
the parent assembly or EBOM quantity basis.
UOM

Explain:

The unit in which the component quantity is expressed.

Add equivalent help for every additional field proven by the schema.

Use one reusable component such as:

<FieldHelp
  labelKey="ebom.fields.itemRevision"
  helpKey="ebom.help.itemRevision"
/>

Do not duplicate popover implementation in every form.

Form Validation

Use field-level validation messages.

Required validations include:

Item Revision is required.
Localized required name is present.
Component Revision is required.
Quantity is greater than zero.
Parent line belongs to the same EBOM.
No hierarchy cycle exists.
No duplicate line identity according to current business rules.
Released EBOM is immutable.
Release requires at least one valid current line.
Only a Released EBOM can be converted to MBOM when that is the existing backend contract.

Do not return raw SQL errors or UUID-focused messages.

Preserve stable backend error codes and translate them in VI/EN/JA/KO.

Data Loading and Hydration

Apply the same freshness protections recently added to Workstation forms:

Use fresh EBOM detail when entering edit/detail.
Use cache: no-store for availability- or lifecycle-sensitive EBOM detail requests.
Reset create form to an empty state on every create-route entry.
Do not merge a previous EBOM’s lines into the new form.
Ignore delayed responses from a previous EBOM or route.
Replace tree state from the latest backend response; never append during hydration.
Show loading indicators separately for:
EBOM header
Item Revision selector
Design tree
Conversion eligibility
Disable mutations until required data is loaded.
Show inline Retry when a section fails.

Historical lines must remain available for audit APIs where applicable, but only active/current lines may hydrate the editable tree.

Transaction and Replacement Rules

Treat submitted EBOM line state according to the actual API contract.

When the editor represents the complete current tree, use transactional replacement semantics:

submitted current tree
= complete desired current state

Do not append all submitted lines to existing active lines.

In one transaction:

Lock and validate the EBOM.
Validate the complete submitted hierarchy.
End or replace current draft lines according to the effective-dated model.
Insert/update the desired current lines once.
Preserve historical records.
Commit atomically.

A failed tree save must not leave a partial hierarchy.

If the existing backend uses line-level commands instead, keep those commands but guarantee equivalent atomic and non-duplicating behaviour.

Help Modal

Add or update the EBOM page help modal to explain:

1. Create or select an Item Revision.
2. Create a Draft EBOM for that engineering output revision.
3. Build the component design tree.
4. Review and release the EBOM.
5. Convert the Released EBOM into an MBOM Draft.
6. Complete manufacturing-specific MBOM configuration.
7. Production Version selects the Released MBOM and Routing.
8. Work Orders continue to explode from MBOM, not EBOM.

Clearly distinguish:

EBOM
= engineering design structure

MBOM
= manufacturing production structure

Do not claim that Work Orders execute directly from EBOM.

Verification

Create:

scripts/verify-ebom-crud-flow.mjs

Verify through real APIs:

Create a Draft EBOM header.
Read it back.
Add a multi-level component tree.
Reload and verify exact tree hydration.
Edit quantity and hierarchy.
Remove one line and verify it does not return as a current editable line.
Reject a circular hierarchy.
Release a valid EBOM.
Verify released EBOM editing is blocked.
Convert it to an MBOM Draft.
Verify MBOM lines retain EBOM source-line traceability.
Verify the released EBOM remains unchanged.
Print PASS or FAIL and exit non-zero on failure.

Also verify:

MES Console build
Master-data service build
Docker rebuild/restart
Runtime APIs
i18n coverage
git diff --check
Acceptance Criteria
Create EBOM establishes a valid header and opens the design-tree editor.
The Item Revision relationship follows the actual backend domain contract.
EBOM lines are edited as a real hierarchy.
Current editable lines never include inactive historical lines.
Draft, release, and conversion actions are clearly separated.
Released EBOM remains immutable and auditable.
Conversion creates an MBOM Draft without changing the EBOM.
MBOM lines preserve EBOM source traceability.
Work Orders remain MBOM-driven.
Every EBOM CRUD field has a localized ! help popover.
All popovers are reusable, accessible, and consistent.
Fresh route hydration prevents stale or duplicated EBOM data.
Tree persistence is transactional and cannot create duplicate active lines.
The end-to-end EBOM verification script passes.

AI Context xác nhận EBOM hiện đã có header/line, create/release, conversion sang MBOM Draft và source traceability; đồng thời Item Revision và Component Revision selectors đang dùng localized Item name. Prompt trên giữ nguyên các contract đó thay vì thay thế chúng bằng một model suy đoán mới. :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2}