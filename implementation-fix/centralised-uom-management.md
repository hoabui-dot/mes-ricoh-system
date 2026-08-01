# Centralised UOM Management

Date: 2026-07-29
Scope: MES Master Data service and MES Console

## Audit result

`md_uom` was already the MES database owner, but the API and UI were not authoritative. The Item form accepted free-text UOM name/sign and called `POST /uoms` to create or reuse a record. The old endpoint silently returned an existing duplicate and created `Quantity` rows as Released. MBOM selectors displayed only codes, and there was no UOM management route in MES Console.

## Implemented

- Added migration `0046_centralised_uom_metadata`: localized JSONB name/description, `allow_fraction`, conversion `item_id` and rounding metadata, valid UOM type/precision constraints, and removal of self conversions.
- Added migration `0047_normalize_legacy_uom_classes`: maps legacy `Quantity` to `Count` and marks unused demo records inactive. The used legacy `ITEM` record is retained and reported rather than deleted.
- Seeded the canonical UOM set: `PCS`, `KG`, `G`, `M`, `M2`, `L`, `MIN`, with VI/EN/JA/KO names, type, precision and fraction policy.
- Added authoritative UOM API list filters, usage inspection, validated create/update/delete, uppercase code validation, duplicate `409 UOM_CODE_DUPLICATE`, immutable code, type immutability while used, and `409 UOM_IN_USE`.
- Added `/master-data/uoms` MES Console page with list/search, localized metadata, usage count, create/edit, deactivate and dependency-aware delete.
- Added shared `UomSelector` and `uomLabel` components. Item create/edit now submits only `base_uom_id`; inline UOM creation and free-text name/sign fields were removed. Selectors expose Released UOMs only.
- Updated MBOM create and line selectors to display localized name with code.

## Current data verification

After migration, the service returned the canonical rows and legacy audit rows:

| Code | Type | Status | Usage |
|---|---|---|---:|
| PCS | Count | Released | 19 |
| KG | Weight | Released | 3 |
| M2 | Area | Released | 5 |
| G/M/L/MIN | Weight/Length/Volume/Time | Released | 0 |
| ITEM | Count | Released | 6 |
| DEMO-EA, UOM-RACE-1784874860, XE | Count | Inactive | 0 |

`ITEM` is retained because it is referenced by three Items and three Item Revisions. It must be migrated by business decision before deletion or replacement.

## Verification

- `mes-master-data-service`: `npm run build` passed.
- `mes-console`: `npm run build` passed after the UOM selector integration.
- Container rebuild and force-recreate completed for `mes-master-data-service` and `mes-console`.
- Migration 0046 and 0047 applied successfully in the running database.
- UOM list and `/uoms/{id}/usage` returned localized records and usage counts.
- Duplicate `PCS` creation returned HTTP 409 with `UOM_CODE_DUPLICATE`.

## Remaining boundary

WMS/QMS database projections were not changed in this MES-console task. Their existing UOM mapping contracts remain separate; cross-service conversion synchronization requires a separate versioned integration change. The existing Schema Registry compatibility warning for an unrelated ItemRevision event was observed during startup and does not block the UOM API.

## Delete/Edit response fix (2026-07-29)

The UOM delete API intentionally returns HTTP `204 No Content`. The shared MES Console `deleteResource` helper previously called `response.json()` unconditionally, so a successful delete surfaced `Unexpected end of JSON input` and left the deleted row visible in stale UI state. The helper now returns `null` for `204` or empty non-JSON responses.

The reported `uom.errors.UOM_NOT_FOUND` was the follow-on symptom: after the delete had already succeeded, the stale row was edited again. The list now reloads after successful deletion, and the localized error key is present for a genuinely stale/missing record.

Verification: created `DEL-TEST-20260729` (HTTP 201), deleted it (HTTP 204, zero-byte body), and searched the API afterward (zero rows). Existing UOM edit returned HTTP 200. MES Console build passed after the helper change.

## UOM action menu fix (2026-07-29)

The UOM table action column previously rendered several standalone icons, including a power icon whose async action had no error handling. This made the action affordance unclear and could leave the UI appearing blocked when the request failed.

The action column now has one `MoreHorizontal` menu per row with localized actions:

- View details
- Edit
- Deactivate when the UOM is referenced
- Delete when the UOM is unused

The menu closes after an action, successful deactivate/delete reloads the list, and failed mutations show the localized API error. The existing dependency rule is preserved: referenced UOMs cannot be deleted and are deactivated instead.

Verification: `npm run build` passed for MES Console; `mes-console` was rebuilt and force-recreated; the running console returned HTTP 200 at `http://127.0.0.1:13052/`; `mes-master-data-service` remained healthy; `git diff --check` passed.

## Reactivate inactive UOMs (2026-07-29)

The row action menu now maps lifecycle state explicitly. An `Inactive` UOM shows `Activate`, which restores it to `Released`; it no longer shows a disabled `Deactivate` action. Active UOMs retain the relational rule: referenced records can be deactivated, while unused records can be deleted. Reactivation does not change the UOM code, type, usage references, or history.

Verification: MES Console TypeScript/Vite build passed, the Docker image was rebuilt and force-recreated, and the running console returned HTTP 200 at `http://127.0.0.1:13052/`.
