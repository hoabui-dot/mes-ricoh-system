# MBOM Material Component Form UX

Date: 2026-07-30

## Scope

Standardize the MES Console MBOM material-line Add and Edit flows. The form
represents one primary component and its substitute materials. It no longer
asks the user to select a parent component or a routing operation.

## Changes

- `services/mes-console/src/routes/master-data/MbomScreen.tsx`
  - Removed the Parent Component selector from the line editor.
  - Removed the Operation selector and stopped fetching the Operation catalog
    for this form.
  - New lines submit `parent_line_id = NULL` and all new/edited lines submit
    `issue_operation_id = NULL`. Existing parent metadata is preserved while
    editing legacy nested lines so opening and saving an old record does not
    silently reparent it.
  - The substitute-material section is now shown in the Add Component form as
    well as Edit Component.
  - Substitute additions and deletions remain local draft changes until the
    primary component form is saved.
  - When adding a new component, the response ID is used to persist the draft
    substitute list through the existing replacement endpoint. This avoids
    attempting to create substitutes against a not-yet-persisted line.
  - Existing persisted substitute rows are still loaded by primary line and
    multiple substitutes remain supported.

## Domain decision

Routing operations belong to Routing and are selected together with MBOM by a
Production Version. MBOM material lines do not need a user-selected operation
in this editor. The database `issue_operation_id` column remains nullable for
legacy data and compatibility; no schema deletion was made in this UI change.

## Verification

- `npm --prefix services/mes-console run build` passed.
- Backend endpoints were not changed because the existing MBOM line API
  already accepts nullable `parent_line_id` and `issue_operation_id`, and the
  existing transactional substitute replacement endpoint is sufficient.

## Follow-up UOM correction

- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
  now derives MBOM line UOM from `md_item_revision.base_uom_id` in create,
  update, complete replacement, structure validation, and release validation.
- `services/mes-master-data-service/src/application/validation-engine/validation-engine.ts`
  uses the same derived UOM for Production Version checks.
- Migration `0058_normalize_mbom_line_uom_to_item_revision_base` repairs active
  legacy line snapshots without changing Item Revision or UOM master data.
- Existing active MBOMs returned HTTP 200 with `{ valid: true }` from the
  structure validation endpoint after the migration.

## Runtime test cases

In a Draft MBOM, add a component, add one or more substitutes, save the
component, reopen it, delete a substitute in the form, cancel, and confirm the
database remains unchanged. Save again and confirm the complete desired
substitute set is reflected after reload. Released MBOMs remain immutable and
do not expose component editing.
