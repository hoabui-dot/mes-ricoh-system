# Item Revision Effective Date-Time Implementation

Date: 2026-07-30
Status: IMPLEMENTED WITH LEGACY DATA RECONCILIATION

## Root Cause

The Item Revision form collected only a calendar date and serialized it as `T00:00:00.000Z`. This discarded the user's local time and could move the intended manufacturing boundary to the previous local day. The create endpoint locked the highest `version_no`, did not calculate the chronological neighbours, and did not close the previous revision until a later release action. List and resolution consumers therefore risked treating an open-ended future revision as current.

## Temporal Contract

- Validity is the half-open interval `[effective_from, effective_to)`.
- `effective_from` is inclusive and `effective_to` is exclusive.
- Boundaries are stored as PostgreSQL `TIMESTAMPTZ` UTC instants with second-or-better precision.
- The Console captures Site-local date and `HH:mm:ss`; the current site policy is `Asia/Ho_Chi_Minh` (`UTC+07:00`) from `md_site.timezone`.
- API requests use ISO 8601 with an explicit offset representation (`Z` is accepted as an explicit UTC offset).
- `effective_to` is system-managed and is never accepted as a normal new-revision input.

## Backend Changes

`services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`

- Added strict ISO datetime parsing with seconds and explicit timezone.
- Added stable errors for invalid, past, duplicate, and invalid-range starts.
- New revision creation locks the Item and all its revisions in one transaction, resolves chronological previous/next revisions, closes the previous interval exactly at the new start, sets the new interval end to the next start, rejects exact start conflicts, and records temporal audit rows.
- Added `GET /items/:id/effective-revision?at=...` using the canonical predicate and `ITEM_REVISION_NOT_EFFECTIVE` / `ITEM_REVISION_OVERLAP_DETECTED` outcomes.
- Item Revision list responses now include `site_timezone` and `temporal_status` (`Current`, `Scheduled`, `Historical`).

`services/mes-master-data-service/src/infrastructure/db/migrate.ts`

- Migration `0052_item_revision_effective_datetime_integrity` adds temporal audit and reconciliation tables, the effective-range check, exact-start uniqueness, and resolution indexes.
- Existing duplicate starts are reported. Unreferenced ambiguous legacy duplicates are preserved by identity and shifted by one second, then all chronological `effective_to` boundaries are reconciled. Production Version references are not remapped. The follow-up migration `0053_item_revision_legacy_subsecond_boundary_reconciliation` corrected the initial sub-millisecond normalization because JavaScript Date cannot safely expose PostgreSQL microseconds.

## Console Changes

`services/mes-console/src/components/EffectiveDateTimePicker.tsx`

- Added reusable Site-local date/time control with explicit seconds, timezone display, and ISO UTC serialization.

`services/mes-console/src/routes/master-data/ItemsScreen.tsx`

- New Revision now captures date and time separately, defaults slightly in the future to avoid a submission race, sends an explicit UTC instant, and does not expose editable `effective_to`.
- Item status resolution prefers the interval effective at now instead of highest revision number.
- Revision creation messages and temporal status labels are localized for VI/EN/JA/KO.

## Verification

- MES Master Data Service TypeScript build: passed.
- MES Console production build: passed.
- Migration applied successfully in `mes-master-data-db`.
- Legacy duplicate audit was found for `FG-WS-CM01`; ranges were reconciled to zero overlaps. The referenced R1 identity remained unchanged. The exact tested boundary is `R1 [00:00:00, 00:00:01)` and `R2 [00:00:01, ...)`.
- Live effective-revision API returned HTTP 200 and the current `FG-WS-CM01-WMS-CLOSURE-073122` revision with `temporal_status: Current`, `site_timezone: Asia/Ho_Chi_Minh`.
- MES Master Data Service and MES Console containers were rebuilt and recreated.

## Follow-up Fix: Audit Parameter Mapping

The first runtime attempt to create a Revision exposed `bind message supplies 7 parameters, but prepared statement requires 8`. The automatic-boundary audit INSERT has eight placeholders: item, revision, old start, old end, new end, triggered revision, actor, and correlation ID. The route omitted the nullable `triggered_revision_id` value for the predecessor audit row. The parameter list is now aligned, with `NULL` used until the newly inserted Revision identity is available. The service was rebuilt/recreated and the existing unit suite passed (`6/6`).

## Remaining Risk

Production Version and Work Order snapshots already use the full timestamp predicate in the current Master Data validation path, but a broader repository-wide audit of every non-MES service and browser timeline rendering should remain a follow-up. No direct effective-date edit workflow was added for Released or referenced revisions; corrections must use a new revision.

## Follow-up Fix: Successor Revision INSERT Alignment (2026-08-06)

The successor endpoint declared `previous_revision_id` as the final target column and supplied its value as the nineteenth query parameter, but the SQL `VALUES` list stopped at `$18`. PostgreSQL therefore rejected every successor creation with `INSERT has more target columns than expressions`. The query now includes `$19`. The same audit found that the route no longer applied the documented interval reconciliation, so successor creation once again assigns the next boundary to the new row, closes the chronological predecessor at the exact new start, and records both temporal audit rows in the same transaction. An HTTP-level regression test verifies the 19-value INSERT, predecessor update, two audit records, and commit. The running schema already contains all required columns, so no migration is required.
