# MBOM Substitute Detail and Component Table

## Root cause

`POST /api/mes/master-data/mbom-lines/{lineId}/substitutes` intentionally accepts only an Item
Revision that exists, is inside its effective window, and has `lifecycle_status = Released`. A Draft
revision therefore produces `MBOM_SUBSTITUTE_REVISION_INVALID`; it is not eligible for a released
MBOM structure or production use. The backend now returns the exact reason (`NOT_FOUND`,
`NOT_RELEASED`, or `OUTSIDE_EFFECTIVE_WINDOW`) plus revision code, status, and effective dates.

## UI changes

- The validation toast detail maps the backend diagnostic to translated VI/EN/JA/KO text. It explains
  that only a Released revision in its effective period is valid.
- The MBOM detail component list now uses `BaseDataTable`.
- The first column is an expand icon. Expanded content is a nested `BaseDataTable` of substitutes.
- The model supports multiple substitutes per MBOM line; the backend query returns all active rows
  ordered by priority. Existing unique constraints protect duplicate revision and duplicate priority.
- Component actions are grouped under one icon menu: edit, manage substitutes, and remove.

## Verification

- MES Console typecheck passed.
- MES Console production build passed.
- MES Master Data service TypeScript build passed.
- MES Console and Master Data service Docker images rebuilt and recreated.
- MES Console returned HTTP 200 on port 13052.
- Master Data service started and applied migrations 0051-0053 without new migration changes.
