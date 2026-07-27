# Full Routing CRUD Implementation

## Scope

Implemented the MES Routing Header and Routing Operation CRUD correction. The Routing Header uses the existing generic master-data list/create/update/delete and release conventions, while the complete operation structure is managed through one transactional replacement endpoint.

## API

- `GET /api/mes/master-data/routing-headers` lists Routing Headers with localized name, description, lifecycle status, operation count, and factory count.
- `GET /api/mes/master-data/routing-operations` returns operation projections with localized Operation and Work Center data.
- `POST /api/mes/master-data/routing-headers` creates a Draft Header. The backend owns the `RT-YYYYMMDD-NNNN` code.
- `PUT /api/mes/master-data/routing-headers/:id` edits a Draft or InReview Header.
- `DELETE /api/mes/master-data/routing-headers/:id` deletes only an unreferenced non-Released Header.
- `POST /api/mes/master-data/routing-headers/:id/release` uses the existing lifecycle and outbox conventions.
- `PUT /api/mes/master-data/routing-headers/:id/operations` replaces the complete desired active operation list in one database transaction.

## Replacement Rules

The submitted operation list is the complete current Routing structure. The service locks the Header, validates the entire graph, ends existing active operation rows with `effective_to` and `Inactive`, then inserts the submitted rows once before commit. An unchanged save therefore succeeds, removed operations remain historical, and active duplicates are not created.

Validation covers duplicate sequence numbers, duplicate Operations, missing/self/cyclic predecessors, active Operation status, active Work Center status, same-Site Work Centers, non-negative timing values, and positive transfer batches.

## Lifecycle and Dependencies

Released Routing Headers and their Operations are immutable. Delete is rejected when the Header is referenced by a Production Version, Production Standard, or Routing Operation Skill Requirement. Routing Operation edit/delete is also blocked when its parent Routing is Released or when dependent standards/skill requirements exist. A new Routing version is required for Released configuration changes.

## MES Console

- Routing list supports search by code, localized name, and type.
- Draft/InReview rows expose edit and delete actions with confirmation.
- Create and edit forms hydrate localized metadata and the complete operation flow.
- Operation management supports add, edit, reorder, remove, timing fields, predecessor, milestone, overlap, Work Center, and Worker Skill Requirements.
- UI uses VI/EN/JA/KO translations and shadcn-based controls.

## Verification

- `npm run build --workspace=mes-master-data-service` passed.
- `npm run build --workspace=mes-console` passed.
- `npm test --workspace=mes-master-data-service -- --run` passed: 3 files, 6 tests.
- `git diff --check` passed.
- Docker Compose runtime verification was unavailable in this environment because access to `/var/run/docker.sock` was denied. The service and console were not claimed as runtime-verified.

## Remaining Risk

Work Order references live in the execution service/database boundary and are not represented by a foreign key in the Master Data database. The current deletion guard covers Master Data dependencies available in this service; the execution service should add a cross-service reference check before allowing deletion in a production deployment.

## Work Center Refresh Fix

Routing Create now requests supported Work Centers with `cache: no-store` and a cache-busting query value whenever an Operation is selected. The backend capability query resolves active Work Centers through the current `md_workstation.work_center_id` hierarchy and active workstation capability rows; it no longer requires a separate `md_work_center_composition` row. This ensures a Work Center appears immediately after its Workstation Operation capability is updated.
