# UI Issue Note Fix

Date: 2026-07-23  
Source: `note-fix-ui.md`

## Fixed

- MES Tier-2 Equipment, Production Standards, Reason Codes, and Skills titles/subtitles now use i18n
  keys in VI/EN/JA/KO instead of hardcoded Vietnamese route props.
- MES Items now reads the database contract (`master_id`, `code`, localized `name`) and creates records
  with `code` and `LocalizedText.name`.
- MES Items now loads real item revisions and uses the actual revision ID for release actions.
- MES Production Versions now reads canonical `code`, `item_revision_id`, `mbom_header_id`, and
  `routing_header_id`, resolving item code through the Item Revision and Item master-data endpoints.
- Routing status badges use `whitespace-nowrap`.
- MES Work Order creation page details now explain Item Revision/MBOM/Routing/Production Version
  relationships, readiness checks, WMS stock timing, WorkCenter/Employee/Skill capacity behavior, and
  Draft/Approved/Rejected rules in the page-detail modal.
- Portal language text, app names/descriptions, footer, accessibility labels, and app actions use i18n.
- Portal emoji app icons were replaced with Lucide icons and the native language selector with a compact
  segmented control.
- Portal and MES now support persisted light/dark mode toggles.

## Root Causes

The MES API returns generic master-data rows with `code`, `name`, and `master_id`. Older UI code expected
legacy aliases such as `item_code`, `item_name`, `version_code`, `item_id`, and `production_version_id`.
Those aliases were undefined, so tables appeared empty and release actions used placeholder IDs. The
database seed itself contained the item and production-version code/name data; the defect was in the UI
mapping and create payload shape.

## Verification

- `npm run typecheck --workspace=mes-console` passed.
- `npm run build --workspace=mes-console` passed.
- `npm run lint --workspace=mom-unified-portal` passed.
- `npm run typecheck --workspace=mom-unified-portal` passed.
- `npm run build --workspace=mom-unified-portal` passed.
- Portal and MES Docker images rebuilt and containers restarted.
- Live Portal and MES entry points returned HTTP 200.
- Live item response confirmed `code=FG-WS-CM01` and localized `name`.
- Live production-version response confirmed `code=PV-FG-WS-CM01-R1` and real relationship IDs.

## Remaining UI Follow-up

Several older MES screens still contain direct native `<select>` elements in legacy forms. The affected
Items form now uses the shared MES `Select` primitive; a complete Radix Select migration across every
legacy CRUD form should be handled as a separate UI consistency task so each form's value/validation
behavior can be tested without changing domain payloads unintentionally.
