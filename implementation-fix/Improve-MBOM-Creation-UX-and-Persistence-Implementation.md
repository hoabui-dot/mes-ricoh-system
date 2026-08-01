# MBOM Creation UX and Persistence Flow

Date: 2026-07-30

## Selected persistence model

The MES platform uses Model A: create the Draft MBOM Header first, then persist each component through `POST /api/mes/master-data/mbom-lines`. A successful component mutation increments `md_mbom_header.structure_version`; the detail API hydrates the persisted Header -> Line -> Substitute aggregate. This matches the existing backend transaction and avoids fake client-only line IDs.

## Changes

- Replaced the always-visible component and substitute forms with focused modals.
- Added a clear Manufacturing Components section, empty state, Add first component action, and separate Save Draft/Validate/Release actions.
- Add/Edit component keeps the entered form open on API failure and closes/resets only after a successful persisted response.
- Parent component options now show localized component identity, item/revision identity and sequence; the generic `Line` option was removed.
- Each persisted component row has Manage substitutes; the original component is read-only in the substitute modal.
- Substitute UI is unavailable when no persisted component exists.
- Added field-specific help for sequence, parent, revision, quantity, UOM, scrap, issue operation, backflush, phantom, optional, substitute and effective dates.
- Added effective-date fields to component editing and backend update validation.
- Guarded the detail render during post-create navigation: lifecycle resolution now handles a temporarily missing Header while the detail request hydrates, preventing `Cannot read properties of null (reading 'lifecycle_status')`.

## Verification

- `npm run build` passed for MES Console and MES Master Data.
- MES Console and Master Data containers rebuilt and recreated.
- MBOM list API returned HTTP 200 through Kong after deployment.
- MBOM detail route shell returned HTTP 200 after the post-create navigation fix.
- Master Data API contains the persisted line creation path and increments `structure_version` in the same transaction.
- Release error handling was corrected so HTTP 422 validation arrays retain their `code` and `path`; an empty Draft now renders the translated `MBOM_RELEASE_REQUIRES_LINES` detail instead of `[object Object]`.

## Remaining browser evidence

The browser scenarios in the process document require an operator-created disposable Draft MBOM and should be run against the deployed UI: add first component, refresh, add child, open Manage substitutes, and test a rejected quantity. No production master data was deleted or mutated during this deployment verification.
