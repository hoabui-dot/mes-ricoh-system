# Routing Ownership and Resource Selection Implementation

## Scope

Implemented `process-fix/Decouple-Routing-from-Product-Revision-and-Site,-and-Correct-Routing-Operation-Resource-Selection.md`.

## Backend and Database

- Added forward-only migration `0030_decouple_routing_ownership`.
- Removed `item_revision_id` and `site_id` from `md_routing_header`.
- Preserved `md_production_version` ownership of Item Revision, MBOM, Routing, and Site relationships.
- Removed Routing ownership fields from routing event payloads and list projections.
- Routing list now returns operation count and distinct Factory count derived from Routing Operations.
- Added `GET /api/mes/master-data/operations/:operationId/supported-work-centers`.
- Supported Work Centers require an active Work Center, active Work Center composition, active Workstation, and active Workstation Operation Capability.
- Routing Operation create validation now rejects inactive Operations, invalid Work Centers, and unsupported Operation/Work Center pairs with stable errors.
- Production Version validation no longer requires Routing Site or Product Revision equality. It validates active Routing Operations, active Operations, current Work Center support, and reports `INTER_FACTORY_ROUTING` as a warning when multiple Factory/site contexts are used.
- Resource planning readiness now resolves the Product Revision and Site through the selected Production Version rather than through Routing ownership.

## Console Changes

- Routing Create no longer asks for Product Revision or Site.
- Routing Operation rows now follow Operation first, then supported Default Work Center.
- Work Center selection is disabled until an Operation is selected.
- Changing Operation reloads supported Work Centers and clears an incompatible previous selection.
- Work Center options show localized Work Center names with Factory/Shopfloor context and no UUIDs.
- Production Version still filters MBOM by Item Revision/Site, but lists all Released reusable Routings.
- Routing list/detail no longer shows Product Revision or Site ownership fields.
- Routing detail shows Factory count, multi-Factory status, and Work Center-derived Factory/Shopfloor location.
- Added VI/EN/JA/KO translations for the new routing-selection states and location labels.

## Verification

- `npm run build --workspace=services/mes-master-data-service`: passed.
- `npm run build --workspace=services/mes-console`: passed.
- Migration `0030_decouple_routing_ownership`: applied successfully in `mes-master-data-db`.
- `md_routing_header` no longer contains `item_revision_id` or `site_id`.
- Routing list endpoint returned HTTP 200 without Product Revision/Site ownership joins.
- Supported Work Centers endpoint returned HTTP 200 with localized Work Center, Shopfloor, Factory, and workstation count data.
- Production Version validation executed successfully at the API level and returned stable `WORKCENTER_OPERATION_NOT_SUPPORTED` failures for legacy demo Routing Operations that do not yet have an active Workstation Operation Capability; this is the intended blocking rule under the new contract, not a Routing Site/Product Revision mismatch.
- MES master-data service reached healthy state and MES Console remained running.
- Existing Schema Registry compatibility warning remains unrelated; service startup completed normally.

## Workstation Supported Operations Labels (2026-07-26)

- Added visible localized labels to every field in the Supported operations list on `master-data/workstations/new`: Operation, Cycle time, Setup time, and Base quantity.
- Kept the existing VI/EN/JA/KO translation keys and capability update handlers; no relational IDs or backend payload fields changed.
- Added an explicit accessible label to the remove action while retaining the icon-only control.

Verification:

- `npm run build --workspace=services/mes-console`: passed.
- `git diff --check`: passed.
- The MES Console container was rebuilt and restarted after the UI change.
