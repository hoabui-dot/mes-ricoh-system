Audit and redesign the complete MBOM Component Edit UX and the Component Substitute CRUD workflow in the MES Console.

## Reported problem

The current “Edit Component” modal allows the user to edit the primary MBOM line fields, but it does not expose the substitute materials already associated with that component.

A user can add a substitute material through the existing workflow, but when the user opens the primary component again:

- the existing substitutes are not visible
- there is no substitute summary
- there is no Edit action
- there is no Remove/Delete action
- there is no End Effectivity action
- approval state is not visible
- effective dates are not visible
- the user cannot complete the substitute CRUD lifecycle

This is not only a missing Delete button. The current modal does not represent the complete business aggregate and has an incomplete information architecture.

## Repository and evidence rules

Before implementing:

1. Read `AI_CONTEXT.md`.
2. Read the relevant MBOM process and implementation-fix documents.
3. Inspect the running source code and treat it as the highest source of truth.
4. Inspect:
   - MBOM detail screen
   - component editor
   - substitute editor
   - master-data API client
   - backend routes and handlers
   - database schema and migrations
   - approval audit tables
   - lifecycle and release guards
   - current query keys and mutation invalidation
5. Do not assume a substitute DELETE endpoint already exists.
6. Record every existing endpoint and classify it as:
   - implemented and verified
   - implemented but untested
   - partial
   - missing

The current documentation confirms that `md_component_substitute` is an effective-dated child of `md_mbom_line`. It also confirms create/update support, substitute approval, effective dates, compatibility controls and approval audit data. Verify the exact running implementation before changing it.

## Domain model

Treat the relationship as:

```text
MBOM Header
  └── MBOM Line / Primary Component
        └── 0..N Component Substitutes

A component substitute is not a temporary UI object. It must reference a persisted mbom_line_id.

The primary MBOM line and each substitute have independent configuration and potentially independent effectivity.

Do not merge the primary component effectivity fields with substitute effectivity fields.

Main UX objective

Redesign the Edit Component modal so the user can understand and manage the complete component configuration from one coherent surface.

The modal must clearly separate:

Primary component fields.
Quantity and issue configuration.
Primary component effectivity.
Consumption behaviour.
Substitute material management.

Do not hide substitute management behind an unrelated page-level action.

Proposed modal structure
Header

Display:

“Edit MBOM Component”
primary component code/revision
MBOM identity
MBOM lifecycle status
a short explanation that the user can update the primary component and manage its allowed substitutes

Example:

Edit MBOM Component
AUDIT-ITEM-20260729 · Revision R1
MBOM-2026... · Draft
Section 1 — Component identity

Fields:

Component Item Revision
Parent Component
Sequence

Place Component Item Revision first and make it full width.

Improve the selector display. Do not render one long concatenated value.

Use a structured option:

Localized item name
ITEM-CODE · Revision R1
Material Group: RM_METAL_BASE

The selected control may use a compact two-line layout.

Section 2 — Quantity and issue configuration

Fields:

Quantity per
UOM
Scrap rate
Issue operation

Continue enforcing UOM fraction and precision rules from authoritative backend data.

Section 3 — Effectivity

Fields:

Effective from
Effective to

Add helper text:

A blank end date means there is no planned end date.

Clearly state that these dates belong to the primary MBOM component.

Section 4 — Material behaviour

Group these fields visually:

Backflush
Phantom
Optional

Use existing shared tooltips or help popovers to explain their manufacturing effect.

Section 5 — Substitute materials

This section must appear whenever the MBOM line is persisted.

Header example:

Substitute materials                         [Add substitute]
2 configured

Render substitutes using the shared BaseDataTable or a reusable compact table wrapper.

Suggested columns:

Priority	Substitute revision	Conversion factor	Max usage	Approval	Effectivity	Status	Actions

Each row must provide contextual actions:

Edit
Remove, when physical deletion is allowed
End Effectivity, when history must be retained
Submit for Approval, where applicable
Approve or Reject, based on permission and state
View Approval History

Do not expose every action when it is invalid for the current lifecycle.

Empty state

Use an explicit empty state:

No substitute materials configured

Add an allowed alternative material that may be used when the primary
component is unavailable.

[Add substitute]
Substitute create form

The Add Substitute modal must support the authoritative running fields, including at minimum:

Substitute Item Revision
Priority
Conversion Factor
Maximum Usage Percentage
Requires Approval
Effective From
Effective To
Compatibility Exception Reason, only when required by policy

The Item Revision selector must:

exclude the original component revision
include only Released and currently effective revisions
enforce the required material-group compatibility
enforce same UOM or a valid Released UOM conversion
exclude duplicates already configured for the same line
refetch when the modal opens
immediately include newly created or released eligible revisions

The backend remains authoritative and must repeat all validation.

Substitute edit form

Load the substitute detail from the server by ID.

Do not use only the table-row object as the edit source.

Allow editing only the fields permitted by lifecycle and approval policy.

Audit whether changing substitute_revision_id is safe after approval or historical use.

Preferred policy:

if no approval/history exists, it may be editable if backend policy allows it
if approval or effective history exists, do not rewrite identity
end the existing substitute and create a new substitute record instead
Removal semantics

Do not implement one unconditional hard-delete action.

Audit the running lifecycle, approval audit and historical-reference rules, then implement explicit removal semantics.

Case A — Draft MBOM, unapproved and unused substitute

A physical delete may be allowed only when:

the MBOM is Draft
the substitute has no protected approval/history dependency
the backend confirms deletion is safe
the mutation is transactional

Expose:

Remove substitute

Use a destructive confirmation dialog.

Case B — Approved, previously effective or historically relevant substitute

Do not physically delete it.

Expose:

End effectivity

Set an authoritative effective_to boundary and retain the historical record and audit data.

Case C — Released MBOM

Released structures are immutable.

Do not show Edit, Remove or End Effectivity actions directly on the Released version.

Display:

This MBOM version is Released and immutable.
Create a new MBOM version to change its component substitutes.

Expose:

Create New Version
Backend API audit and implementation

Inspect the existing routes.

The documented API surface includes:

GET  /mbom-lines/:lineId/substitutes
POST /mbom-lines/:lineId/substitutes
PUT or PATCH substitute update route
POST /mbom-lines/:lineId/substitutes/:substituteId/approve

Verify the exact current routes.

If no safe remove endpoint exists, implement an explicit backend contract instead of simulating deletion only in the UI.

Possible contracts:

DELETE /mbom-lines/:lineId/substitutes/:substituteId

for physically removable Draft substitutes, and:

POST /mbom-lines/:lineId/substitutes/:substituteId/end-effectivity

or an authoritative update endpoint for historically retained substitutes.

The backend must:

lock the parent MBOM line/header where required
verify parent ownership
verify MBOM lifecycle
verify substitute lifecycle and approval history
reject Released MBOM mutation
prevent deleting the original component
preserve audit history
perform the mutation transactionally
return stable error codes
write audit/outbox data where required by the current architecture

Suggested stable errors:

MBOM_SUBSTITUTE_NOT_FOUND
MBOM_SUBSTITUTE_PARENT_MISMATCH
MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE
MBOM_SUBSTITUTE_DELETE_NOT_ALLOWED
MBOM_SUBSTITUTE_APPROVAL_HISTORY_EXISTS
MBOM_SUBSTITUTE_ALREADY_ENDED
MBOM_SUBSTITUTE_EFFECTIVE_DATE_INVALID
MBOM_STRUCTURE_VERSION_CONFLICT

Map them to localized UI messages.

Component modal action design

Do not use one ambiguous Save button for all component and substitute operations.

The main modal footer should contain:

[Delete component]                    [Cancel] [Save component]

Rules:

Delete Component is available only when lifecycle and dependencies allow it.
Save Component updates only the primary MBOM line.
Substitute mutations use their own row actions and focused modals.
Released MBOMs must not show Save or Delete; show Create New Version instead.
Dirty-state handling

Substitute mutations reference a persisted MBOM line and may be saved independently from unsaved component form values.

Prevent ambiguous partial-save behaviour.

When the primary component form is dirty and the user attempts to Add/Edit/Remove a substitute:

either require the user to save or discard the primary component changes first
or implement an explicitly documented atomic aggregate contract

Prefer the first approach unless the backend already supports a proven atomic aggregate update.

Show:

You have unsaved component changes.
Save or discard them before managing substitutes.

Do not allow the user to save a substitute and then click Cancel on the parent modal while believing all changes were cancelled.

Query and cache behaviour

When the Edit Component modal opens, fetch in parallel:

MBOM line detail
current substitute list
eligible substitute Item Revisions
UOM reference data
operation reference data
MBOM lifecycle and structure version

Use the central typed query-key factory.

After substitute create/update/remove/end-effectivity/approve:

wait for backend success
update authoritative cache when safe
invalidate:
substitute list for the line
MBOM line detail
MBOM lines
MBOM detail
MBOM validation
MBOM list summary/count where applicable
await critical refetch
then close the focused dialog and show success

Do not remove a substitute row optimistically for destructive or approval-related actions.

On failure, keep the row and form state visible.

Permissions and action visibility

Audit current roles and permissions.

Action visibility must depend on:

MBOM lifecycle
substitute approval state
user permission
effective state
dependency/history status

Hiding an action is not sufficient security. Backend authorization remains mandatory.

Accessibility

All dialogs and confirmations must use the shared BaseModal and shared Confirmation/AlertDialog primitives.

Required:

keyboard navigation
focus trapping
Escape behaviour
accessible labels
button loading state
disabled duplicate submit
row-action menu accessible by keyboard
destructive actions clearly identified
Tests

Add tests for at least:

Open an MBOM component with no substitutes; empty state appears.
Add a substitute; it appears immediately in the component modal.
Close and reopen the component modal; the substitute remains visible.
Edit a substitute; updated values appear immediately.
Remove a safe Draft substitute; it disappears only after backend success.
Cancel the removal confirmation; nothing changes.
Backend removal failure leaves the row visible.
Approved substitute cannot be physically deleted.
Approved or historical substitute can be ended according to policy.
Released MBOM does not expose direct substitute mutation actions.
Create New Version enables substitute changes on the new Draft only.
Newly released eligible Item Revision appears in Add Substitute without browser reload.
Original component revision is excluded from substitute options.
Duplicate substitute revision is rejected.
Invalid item-group compatibility is shown using structured localized validation details.
Invalid UOM compatibility is rejected.
Reversed effective dates are rejected.
Rapidly switching between components cannot hydrate substitutes from the previous line.
Unsaved primary-component changes block or explicitly resolve substitute mutation.
Stale structure_version returns a conflict and refresh/recovery guidance.

Use hook/API tests and Playwright for the critical user flows.

Deliverables
Current-state UX and API audit.
Component/substitute lifecycle and permission matrix.
Redesigned Edit Component modal.
Visible Substitute Materials section.
Complete supported CRUD actions.
Explicit physical-remove versus end-effectivity policy.
Backend endpoint and validation changes where missing.
Correct query invalidation and refetch behaviour.
Localized errors and confirmations.
Regression tests.
Implementation report under implementation-fix/.
Update AI_CONTEXT.md only with implemented and verified behaviour.
Acceptance criteria

The change is accepted only when:

existing substitutes are visible from Edit Component
users can add, inspect and edit substitutes from the same coherent workflow
safe Draft substitutes can be removed
historical or approved substitutes are retained and ended instead of incorrectly deleted
Released MBOM versions remain immutable
all actions reflect lifecycle and permissions
successful mutations appear immediately without browser refresh
cancellation and failure never silently remove data
no substitute is created against a temporary client-only MBOM line ID
all affected builds and automated tests pass

Điểm quan trọng nhất là không yêu cầu AI chỉ “thêm icon thùng rác”. Nó phải xác định rõ ba nghĩa khác nhau: **physical delete**, **end effectivity**, và **không cho sửa vì MBOM đã Released**. Nếu không tách ba trường hợp này, UI có thể xoá được dữ liệu nhưng lại làm mất lịch sử sản xuất hoặc phá audit trail.