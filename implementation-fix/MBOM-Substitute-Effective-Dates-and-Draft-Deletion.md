# MBOM Substitute Effective Dates and Draft Deletion

Date: 2026-07-30

## Scope

- Added explicit effective-date handling for MBOM component substitutes.
- Added draft MBOM deletion with lifecycle and dependency protection.
- Preserved the existing immutable Released MBOM and new-version workflow.

## Root Cause

`md_component_substitute` already inherited effective-date columns in the common master-data schema, but the substitute create API hardcoded `effective_from = NOW()` and did not accept `effective_to`. The MBOM Console also omitted both fields and did not expose the existing substitute delete endpoint. MBOM deletion fell through to generic resource handling, so the UI had no safe lifecycle-specific action.

## Implementation

- Migration `0051_mbom_substitute_effective_dates` idempotently guarantees `effective_from`, `effective_to`, date validation, and an effective-date index.
- Substitute creation accepts and validates `effective_from` and optional `effective_to`.
- Substitute update accepts both effective-date fields and rejects invalid ranges.
- Substitute detail rows now display the effective range.
- Draft MBOM deletion is transactional and removes draft child lines/substitutes only after checking Production Version references.
- Released MBOM deletion returns `MBOM_RELEASED_IMMUTABLE`; dependent draft deletion returns `MBOM_DELETE_DEPENDENCY_EXISTS`.
- The Console shows Delete only for non-Released MBOMs and uses the shared Confirmation component. Released MBOMs show the existing Create New Version action instead.
- The MBOM list `Thao tác` column now contains a single `MoreHorizontal` action icon. View/Edit, Release, Delete, and Create New Version are exposed in the contextual menu according to lifecycle.
- Error and UI labels are translated for VI/EN/JA/KO.

## Verification

- `npm run build` passed for `mes-master-data-service`.
- `npm run build` passed for `mes-console`.
- Docker images rebuilt and `mes-master-data-service` and `mes-console` recreated.
- Migration `0051_mbom_substitute_effective_dates` applied successfully in the running database.
- MBOM list API returned 200 through Kong.
- Released MBOM delete was tested and correctly returned HTTP 409 with `MBOM_RELEASED_IMMUTABLE`.
- MBOM detail returned `effective_from` and `effective_to` values.

## Business Rule

Draft means editable working data and can be deleted only while unreferenced. A Released MBOM is historical production master data: it cannot be deleted or edited in place. Changes require creating and releasing a new version.
