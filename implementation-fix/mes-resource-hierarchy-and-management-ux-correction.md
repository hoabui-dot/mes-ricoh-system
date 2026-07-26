# MES Resource Hierarchy and Resource Management UX Correction

Date: 2026-07-24
Process: `process-fix/Correct MES-Resource-Hierarchy-and-Complete-Resource-Management-UX.md`
Status: Core hierarchy correction implemented and runtime verified; remaining UI hardening is listed below.

## 1. Evidence and domain decision

The existing `md_site` records are the physical factory boundary. Existing `md_production_area` records are workshop-level records: their localized names and descriptions describe molding and rubber-processing areas, and existing Work Centers already reference them through `area_id`. Therefore Site remains the canonical Factory and existing Production Area IDs must not be renamed or repointed.

Migration `0021_correct_resource_hierarchy_shopfloors` preserves those IDs by creating `md_shopfloor` rows with the same IDs and copying the localized names, descriptions, Site relationship, lifecycle, and effective dates. Work Centers and Workstations receive `shopfloor_id` backfills from their existing Area/Work Center relationships. Migration `0022_shopfloor_version_compatibility` adds the version column required by the shared master-data contract.

Canonical hierarchy now exposed by the API:

```text
Factory / Site -> Shopfloor -> Work Center -> Workstation -> Machine
```

The legacy `production-areas` and `equipment` routes remain as compatibility aliases. New UI terminology is Factory, Shopfloor, Work Center, Workstation, and Machine.

## 2. Backend implementation

- Added `md_shopfloor`, `shopfloor_id` on Work Center and Workstation, and `machine_requirement_flag` on Workstation.
- Added `md_resource_numbering_daily` for atomic daily code allocation.
- Added backend-owned generated codes: `FAC-YYYYMMDD-####`, `SF-YYYYMMDD-####`, `WC-YYYYMMDD-####`, `WS-YYYYMMDD-####`, and `MC-YYYYMMDD-####`.
- Work Center creation requires a Shopfloor and derives Site plus the legacy Area reference.
- Workstation creation requires a Work Center and at least one eligible Machine. The primary Resource Assignment is inserted in the same transaction after same-Site, active, and execution-status checks.
- Added an explicit Shopfloor detail projection with Site identity and Work Center, Workstation, and Machine counts.
- Added safe-delete guards returning `RESOURCE_REFERENCED` for dependent Shopfloors, Work Centers, Workstations, Sites, and Machines. This prevents destructive deletion of resources used by routing, assignments, or planning data.
- Added registry aliases: `factories` maps to `sites`; `machines` maps to `equipment`.

## 3. MES Console implementation

- Added routes and navigation for `/master-data/factories`, `/master-data/shopfloors`, and `/master-data/machines`; legacy routes remain available.
- Added shared `GeneratedCodeField`, `StatusSwitchField`, `ResourceHierarchyContext`, and `EffectivePeriodField` components.
- Factory, Shopfloor, Work Center, Workstation, and Machine forms use read-only generated-code fields. Work Center selects Shopfloor; Workstation selects Work Center and Machine, so Factory and Shopfloor are derived rather than redundantly selected.
- Machine detail now renders manufacturer, model, and serial number for both the Machine route and legacy Equipment route.
- Resource tables now paginate with a default page size of 10 and selectable sizes 10, 50, and 100. Pagination labels are translated in Vietnamese, English, Japanese, and Korean.
- `StatusBadge` now translates known resource statuses and renders a translated Unknown fallback instead of an empty badge.
- Production Area hierarchy rows are collapsed by default. Expansion is independent from navigation; the external-link icon is the only navigation action.

## 4. Verification

Passed:

- `services/mes-console`: `npm run build`
- `services/mes-master-data-service`: `npm test` (2 files, 3 tests)
- `git diff --check`
- Docker rebuild and recreation of `mes-master-data-service` and `mes-console`
- Live Factory, Shopfloor, and Machine API probes
- Live database checks: migrations `0021` and `0022` applied; `md_shopfloor=2`; four Work Centers have Shopfloor IDs; one Workstation has a Shopfloor ID
- Root i18n scan had already passed before this final pagination addition; the changed keys are present in all four locale dictionaries

The existing Schema Registry incompatibility warning for `MES.MasterData.ItemRevisionReleased.v1` remains non-fatal and predates this work. It is unrelated to resource hierarchy migration.

## 5. Remaining hardening gaps

- The reusable hierarchy visualization still uses the legacy Production Area tree and has not yet been replaced by a full Factory -> Shopfloor tree view.
- Resource Assignment CRUD still exposes legacy independent Site/Work Center/Workstation selectors; backend validation remains authoritative, but the UI should derive the parent chain in a later pass.
- Full edit/deactivate/delete flows and browser click-through screenshots were not executed in this environment. The backend safe-delete contract and create-time Workstation/Machine transaction were verified by code review and live migration/API checks.
- The resource table remains a focused management list rather than a full filter/search workspace.
