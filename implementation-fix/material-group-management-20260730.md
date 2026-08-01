# Material Group Management Implementation

Date: 2026-07-30

## Scope

Added a central MES Material Group catalog and replaced free-text Item/Item Revision group input with an ID-backed selector. The catalog is separate from `md_skill_group`; material groups are the compatibility family used by MBOM substitutes and existing capability scopes.

## Database and migration

- Added migration `0056_material_group_catalog_and_item_references`.
- Created `md_material_group` with UUID identity, unique case-insensitive code, localized name/description, audit fields, and no deactivate workflow.
- Added `md_item.material_group_id` and `md_item_revision.material_group_id` foreign keys and indexes.
- Backfilled all distinct legacy `item_group` values into the catalog and migrated both Item and Item Revision rows to IDs. Existing `item_group` remains synchronized as a compatibility projection for older queries and substitute/capability logic.
- Current database audit: 7 groups; 0 Item rows and 0 Item Revision rows have a null `material_group_id`.

## API

Implemented:

- `GET /api/mes/master-data/material-groups`
- `GET /api/mes/master-data/material-groups/:id`
- `POST /api/mes/master-data/material-groups`
- `PUT /api/mes/master-data/material-groups/:id`
- `DELETE /api/mes/master-data/material-groups/:id`

Edit and delete query both Item and Item Revision references. A referenced group returns `409 MATERIAL_GROUP_IN_USE`; there is no deactivate endpoint. Codes are validated and unique; localized names require Vietnamese text. Item creation/update and successor revision creation resolve the selected group ID and derive the compatibility code.

## Console

Added `/master-data/material-groups` with BaseDataTable, BaseModal, localized fields, action menu, detail view, create/edit/delete actions, reference counts, and VI/EN/JA/KO translations. Edit/delete controls are disabled in the UI when references exist, while backend constraints remain authoritative.

Item create/edit and New Revision forms now use a SelectBase populated from the central catalog, showing localized name with code as secondary text. The Item Revision API projection returns `material_group_id`, `material_group_code`, and `material_group_name`.

## Verification

- `npm --prefix services/mes-master-data-service run build`: passed.
- `npm --prefix services/mes-console run build`: passed.
- Docker rebuild/recreate completed; `mes-master-data-service` is healthy.
- Migration 0056 applied successfully after correcting trigger-safe backfill and seed compatibility updates.
- `GET /api/mes/master-data/material-groups?limit=500`: HTTP 200, 7 migrated groups.
- Referenced group update: HTTP 409.
- Referenced group delete: HTTP 409 with `MATERIAL_GROUP_IN_USE`.
- Temporary unreferenced group create/edit/delete: HTTP 201/200/200.

## Compatibility note

Legacy consumers that still read `item_group` continue to work because the migration and seed keep it synchronized with the authoritative group code. New UI writes must use `material_group_id`; future cleanup can remove the legacy projection only after all cross-service readers have moved to the group relationship.
