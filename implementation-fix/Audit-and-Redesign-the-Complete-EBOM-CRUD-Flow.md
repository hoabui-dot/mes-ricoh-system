# Audit and Redesign the Complete EBOM CRUD Flow

Date: 2026-07-26
Status: IMPLEMENTED_AND_VERIFIED

## Root Cause

The original `EbomScreen` treated EBOM lines as independent generic CRUD rows. It loaded a global
`ebom-lines` list, appended lines with `POST /ebom-lines`, did not hydrate a selected header's current
tree, exposed client-generated header codes, and had no lifecycle-specific validation. That model
could not preserve hierarchy, safely edit siblings, or distinguish historical lines from the current
design.

## Implementation

- Added migration `0032_ebom_current_line_replacement` and corrective migration
  `0033_ebom_sibling_sequence_scope` with a partial unique index for current
  `(ebom_header_id, parent_line_id, seq)` siblings while allowing inactive historical rows to remain
  auditable. The corrective migration is important because sequence uniqueness is scoped to siblings,
  not the whole EBOM header.
- Added backend-owned EBOM code allocation through the existing `allocateResourceCode(client, 'EBOM')`
  pattern. Header creation now accepts only the target Item Revision and localized name/description.
- Added current-only EBOM list/detail projections with target Item name/code, revision code, and line
  count. Detail hydration returns current lines only.
- Added transactional `PUT /ebom-headers/:id/design-tree`. Its payload is the complete desired active
  tree. It validates positive quantity, UOM/component existence, sibling sequence uniqueness, duplicate
  components under one parent, missing/self parents, and cycles; then ends current rows and inserts the
  submitted rows once with generated line IDs/codes.
- Blocked legacy direct line append/update/delete routes with `EBOM_TREE_REPLACEMENT_REQUIRED`.
- Added EBOM-specific release validation. A current non-empty tree is required; current lines and the
  header become Released in one transaction. Released header/tree mutations return stable immutable
  errors.
- Released EBOM conversion qualifies joined header columns, copies current lines only, preserves
  `source_ebom_line_id`, and returns the created MBOM ID and target route without mutating the EBOM.
- Replaced `EbomScreen` with a selected-record, no-store hydrated tree editor. Draft users can add root
  or child lines, edit quantity/component/UOM/notes, remove subtrees, reorder siblings, expand/collapse,
  save the complete tree, release with confirmation, and convert with confirmation. UUIDs are not used
  as primary display values.
- Added Radix `FieldHelpPopover` beside every EBOM CRUD field label and VI/EN/JA/KO translations.
- Added `scripts/verify-ebom-crud-flow.mjs` covering create, tree replacement, hydration, edit, removal,
  cycle rejection, release immutability, conversion traceability, and EBOM immutability.

## Verification

- `npm run build --workspace=mes-console`: passed.
- `MES_MASTER_DATA_URL=http://localhost:18000/api/mes/master-data node scripts/verify-ebom-crud-flow.mjs`:
  passed against the rebuilt Docker stack. Verified EBOM `a14152d7-144a-4961-aac6-91d4d34ab065` and
  generated MBOM `6d33d665-89c3-4f54-99dd-4d91379ac9b0` were retained as audit fixtures.
- `docker compose ... build --no-cache mes-master-data-service mes-console` passed, both services were
  restarted, migration `0032` and corrective migration `0033` applied, and the master-data service stayed
  healthy.

## Remaining Risk

The current editor supports adding children from an existing row and editing the row fields, but does
not yet expose a parent selector for moving a line to a different branch. Backend cycle protection is
still authoritative for all callers. The verification script leaves its released EBOM/MBOM fixtures for
audit and should be run only against a demo database.
