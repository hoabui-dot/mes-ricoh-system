# MES Work Order Product Selector Readiness Fix

Date: 2026-07-26

## Root cause

`WOCreateScreen` correctly called `GET /api/mes/master-data/production-ready-item-revisions`, but the endpoint returned an empty list because both released Production Versions failed the existing readiness validator. The Item and related master-data lifecycle flags were `Released`; however, active Work Center composition and Workstation capability rows referenced obsolete/generated operation IDs instead of the operations used by the released routing (`OP-MIX`, `OP-PREP`, `OP-CUT`, `OP-MOLD`, `OP-TRIM`, and `OP-QC`). The selector was therefore correctly hiding invalid production configurations.

## Changes

- Added migration `0034_repair_released_production_configuration_capabilities`.
- The migration idempotently creates missing demo Workstations for Mixing, Cutting, and Quality Inspection, then creates the matching active Work Center composition and Workstation operation capability rows for the released demo routing.
- Updated `seed.ts` with the same Workstation and capability/composition graph so a clean database receives a valid demo configuration.
- Readiness validation remains strict; the endpoint was not changed to expose invalid released data.

## Verification

- `npm run build` in `services/mes-master-data-service`: passed.
- Docker rebuild/restart of `mes-master-data-service`: passed.
- Migration `0034`: applied successfully.
- `POST /api/mes/master-data/production-versions/9a90dce8-6f35-486e-abf2-1310dd87c7b7/validate`: `valid: true`.
- `GET /api/mes/master-data/production-ready-item-revisions?planned_date=2026-08-01&limit=50`: HTTP 200, returned 2 ready products.
- Returned payload includes `item_revision_id`, `production_version_id`, `base_uom_id`, `site_id`, MBOM code/name, Routing code/name, and UOM code required by the Work Order form.
- The running database still logs an existing non-blocking Schema Registry compatibility warning during service startup; the HTTP service starts and the selector API is healthy.
