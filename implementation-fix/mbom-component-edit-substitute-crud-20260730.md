# MBOM Component Edit and Substitute CRUD

Date: 2026-07-30
Scope: MES Console MBOM component editor and `md_component_substitute` lifecycle.

## Current-state audit

| Capability | Before this change | Result |
|---|---|---|
| Read substitutes from MBOM detail | Implemented | Verified through the running API |
| Read substitutes when opening a component editor | Missing | Added line-scoped refetch |
| Create substitute | Implemented | Added to the component draft only; persisted on component save |
| Update substitute | Partial | Replaced by complete substitute-list replacement on component save |
| Physical remove | Partial/inaccurate | Local draft delete; persisted only during component save |
| End effectivity | Missing | Added transactional endpoint |
| Approve/reject | Implemented | Exposed as contextual row actions |
| Approval history | Stored, not visible | Added line-scoped audit endpoint and modal |

## Implemented UX

The Edit Component modal now separates primary component configuration from a
Substitute Materials section. The section displays a BaseDataTable with:

- substitute item name, code and revision;
- priority, conversion factor and maximum usage;
- approval/effectivity status;
- one local delete action. Substitute edit, approval history, end-effectivity,
  approve and reject actions are not exposed in the component editor.

The Add Substitute form refetches eligible revisions when opened, excludes the
original component and already configured revisions, and uses the existing
backend compatibility checks when the component is saved. Existing substitute
rows are fetched again when the component editor opens, so stale page data cannot
hide persisted children.

## Draft replacement semantics

The Edit Component form is the only substitute editing surface. Add and Delete
operate on `draftSubstitutes` in React state only:

- adding a valid row appends it to the draft list and closes the Add Substitute
  modal immediately;
- deleting a row removes it from the draft list after confirmation and makes no
  network request;
- saving the component sends the primary line update and then the complete
  desired substitute list to `PUT /mbom-lines/:lineId/substitutes/replace`;
- the backend replaces active rows transactionally, preserving historical rows;
  a validation or database failure rolls back the replacement.

The database is unchanged until Save Component succeeds.

## Lifecycle policy

- **Draft, unapproved, no protected history:** delete is allowed in the form;
  no database mutation occurs until Save Component.
- **Approved, rejected, ended, or historically relevant:** physical delete and
  identity editing are rejected. End effectivity retains the row and writes an
  audit event.
- **Released MBOM:** direct component/substitute mutation is rejected. The UI
  exposes the existing Create New Version path instead.
- The primary component revision is never changed by substitute editing.

## Backend contracts

- `GET /mbom-lines/:lineId/substitutes`
- `POST /mbom-lines/:lineId/substitutes`
- `PUT /mbom-lines/:lineId/substitutes/replace` (complete desired active list)
- `PUT /mbom-lines/:lineId/substitutes/:substituteId`
- `DELETE /mbom-lines/:lineId/substitutes/:substituteId`
- `POST /mbom-lines/:lineId/substitutes/:substituteId/end-effectivity`
- `POST /mbom-lines/:lineId/substitutes/:substituteId/approve`
- `POST /mbom-lines/:lineId/substitutes/:substituteId/reject`
- `GET /mbom-lines/:lineId/substitutes/:substituteId/audit`

Mutation handlers verify parent ownership and MBOM lifecycle. End-effectivity
and approval-history decisions run transactionally with row locks. Stable errors
include `MBOM_SUBSTITUTE_RELEASED_MBOM_IMMUTABLE`,
`MBOM_SUBSTITUTE_APPROVAL_HISTORY_EXISTS`,
`MBOM_SUBSTITUTE_DELETE_NOT_ALLOWED`, `MBOM_SUBSTITUTE_ALREADY_ENDED` and
`MBOM_SUBSTITUTE_EFFECTIVE_DATE_INVALID`.

## Verification

- MES Console typecheck passed.
- MES Master Data service TypeScript build passed.
- Runtime rebuild completed for `mes-console` and
  `mes-master-data-service`.
- Target MBOM `5d7501bf-415c-45c2-90f7-18676cafb476` contains one persisted
  Draft substitute on line `9d1c2616-c6fa-43f0-a009-15bda3231b39`.
- The audit endpoint returned the persisted `NotRequired` creation audit.
- No destructive operation was run against the demo substitute during
  verification.

## Structure-save correction

The complete replacement endpoint originally reinserted a line with the same
`code` and default `version_no = 1` after ending the previous line. The unique
constraint `uq_md_mbom_line_code_version` correctly rejected that duplicate.
Replacement now preserves the business code and calculates the next version
from the existing/history rows before inserting the new effective row.

Verified on MBOM `5d7501bf-415c-45c2-90f7-18676cafb476`:

- structure version advanced from `2` to `3`;
- line code remained `MBOM-LINE-20260730-0001`;
- new line version became `2`;
- save returned HTTP `200`;
- subsequent structure validation returned `valid: true`.

## Remaining verification gap

Browser Playwright automation and a full mutation matrix were not run in this
environment. The API, builds, container startup and read/audit path were
verified; physical delete/end-effectivity/approval should be exercised against
a disposable Draft fixture before production data is changed.

## Local delete and modal correction

The component editor now sets the active line identity when it opens. This
allows the substitute delete confirmation to remove the selected row from the
local draft list instead of returning early. The delete action still performs no
API request; persistence happens only during Save Component.

The shared `Confirmation` wrapper now renders through `BaseModal`, so MBOM
confirmation, component editing, and Add Substitute use the same modal layout
and centered placement.
