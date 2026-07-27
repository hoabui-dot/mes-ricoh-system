# Production Version MBOM Selection and Derived Site

> Historical report. Superseded by `implementation-fix/decouple-mbom-from-item-revision.md` on 2026-07-27.

## Root cause

The Create Production Version form filtered Released MBOMs by both the selected
Item Revision and a client-controlled Site value. The API correctly returned a
Released MBOM for the requested revision, but the console also applied a second
local filter to the response. Stale form state could therefore make a valid
backend row disappear from the selector.

## Implementation

- Removed the Production Site selector from the MES Console form.
- The Released MBOM selector now filters by Item Revision and lifecycle only.
- The console treats the already-filtered API response as authoritative and no
  longer applies a second Item Revision/Site filter to those rows.
- Selecting an MBOM derives the hidden form context `site_id` from that MBOM.
- The master-data create and update handlers derive `site_id` from the selected
  Released MBOM and ignore stale client-supplied Site values.
- The backend validates that the MBOM exists, is Released, and belongs to the
  selected Item Revision before persisting a Production Version.
- Added migration `0038_production_version_site_derived_from_mbom` to normalize
  existing Production Version rows whose Site differs from their Released MBOM.

## Database decision

The `md_production_version.site_id` column is retained and remains non-null.
It is an execution/readiness key used by Production Version validation, work-order
creation, and resource planning. The UI no longer asks users to enter it; the
master-data service owns and derives it from the selected MBOM. Dropping the
column would break those existing contracts and would require a broader database
and execution redesign.

## Verification

- MES Console TypeScript/build verification: passed (`npm run build`).
- MES master-data service build verification: passed (`npm run build`).
- Database migration and live API/browser verification: unavailable because the
  local Docker/Postgres runtime is not accessible from this environment.
