# MES Resource Master Data Foundation - Phase 1

Date: 2026-07-24
Process source: `process-expand/Complete-MES-Resource-Master-Data-Foundation.md`

## Objective

Implement the MES resource master-data foundation as an effective-dated hierarchy:

`Site -> Production Area -> Work Center -> Workstation -> Equipment`

Routing operations continue to reference Work Centers. Equipment is connected to execution through
Resource Assignments rather than becoming a routing-operation substitute.

## Implementation

### Database and migration

- Migration `0015_resource_master_data_foundation` adds localized resource names/descriptions and the
  process fields for areas, Work Centers, Workstations, Equipment, and Resource Assignments.
- Workstation and Equipment Work Center links are nullable to support independent resource creation;
  Workstations require an Area.
- Resource Assignment now stores Site, role (`Primary`, `Alternate`, `Supporting`), scheduling/OEE
  flags, and effective dates. A GiST exclusion constraint prevents overlapping Primary assignments
  for the same Equipment.
- PostgreSQL triggers validate same-Site and same-Area relationships, reject inactive or OutOfService
  resources from active assignments, and preserve the existing Production Area cycle protection.
- Migration `0016_resource_hierarchy_parent_site_validation` validates that a parent Production Area
  belongs to the same Site.
- Migrations `0017_resource_master_data_i18n_backfill` and `0018_resource_assignment_i18n_backfill`
  convert legacy assignment names and repair the demo resource records to full VI/EN/JA/KO values.
- The seed normalizer now covers Production Areas, Workstations, Equipment, and Resource Assignments;
  the demo assignment includes Site, role, scheduling, and OEE fields.

### API

The MES master-data service exposes generic CRUD projections plus specialized resource endpoints:

- `GET /api/mes/master-data/production-areas`
- `GET /api/mes/master-data/work-centers/:id`
- `GET /api/mes/master-data/workstations/:id`
- `GET /api/mes/master-data/equipment/:id`
- `GET /api/mes/master-data/resource-assignments`
- `POST /api/mes/master-data/resource-assignments`
- `POST /api/mes/master-data/resource-assignments/:id/end`
- `POST /api/mes/master-data/resource-assignments/:id/move`

Resource list projections include Site/Area/Work Center business identities, child counts, and active
assignment counts. No UUID is intended for user-facing display. Assignment create/end/move operations
publish `MES.MasterData.ResourceAssignmentCreated.v1` and `MES.MasterData.ResourceAssignmentEnded.v1`
outbox events. The service manifest documents both lifecycle events and the move endpoint.

### MES Console

`ResourceFoundationScreen` provides localized create/list/detail flows for Production Areas,
Workstations, Equipment, Resource Assignments, and new Work Center child routes. It reuses
`LocalizedTextInput`, `SelectBase`, `StatusBadge`, and shared UI primitives. Equipment forms expose
execution status, default efficiency, and planning-resource intent.

`ResourceHierarchy` is a reusable hierarchy view that renders localized name first, business code
second, status, and links for Area, Work Center, Workstation, and Equipment nodes. Production Area
lists show the nested hierarchy and related resources. Resource detail views show assignment history.
All added UI strings are present in VI/EN/JA/KO resources.

## Verification

- MES master-data TypeScript build: passed.
- MES Console TypeScript/Vite build: passed; only the existing large-bundle warning remains.
- Master-data unit tests: 2 files, 3 tests passed.
- i18n static coverage scan: passed.
- Docker image rebuilt and `mes-master-data-service` restarted successfully.
- Runtime migrations `0015`, `0016`, `0017`, and `0018` applied successfully.
- Runtime health endpoint returned `200`; resource area, workstation, and assignment APIs returned
  localized records and projected business identities.
- Schema Registry still logs a pre-existing incompatibility for `ItemRevisionReleased.v1`; it is
  non-fatal and does not prevent service startup. It is outside this resource-domain change.

## Scope and follow-up

This phase establishes master data and assignment governance. It does not implement finite-capacity
scheduling, machine allocation, kiosk enforcement, or an OEE calculation engine. The existing Work
Center list screen remains in place for backward compatibility; the new foundation screen owns the
dedicated child/detail routes and hierarchy surfaces. Browser click-through and screenshot review were
not available in this environment.

## Detail-route hotfix (2026-07-24)

The Workstation detail crash was caused by a valid localized API value being rendered directly in
JSX. `assignment.work_center_name` and `assignment.workstation_name` are objects with `vi`, `en`,
`ja`, and `ko` keys; React error #31 is the expected result when such an object is rendered as a
child. The data was not malformed. `ResourceDetail` now resolves these values through the shared
`useLocalizedText` resolver before rendering and retains business-code context without exposing UUIDs.

The breadcrumb fallback was a separate route-map gap: `RouteHeader` handled resource collection paths
but not `/master-data/workstations/:id` or the corresponding resource detail paths. Explicit collection
and detail mappings were added for Work Centers, Workstations, Equipment, Production Areas, and Resource
Assignments.
