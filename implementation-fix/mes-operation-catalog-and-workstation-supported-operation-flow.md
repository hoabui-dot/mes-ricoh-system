# MES Operation Catalog and Workstation Supported Operation Flow

## Scope

Implemented the central MES Operation Catalog and completed the supported-operation path:

```text
Operation Catalog -> Workstation Capability -> Work Center Composition -> Routing Operation
```

Operations remain reusable master data. A Workstation stores capability timing and scheduling data; a Work Center exposes only the capabilities of its Workstations; Routing continues to reference the central Operation and logical Work Center.

## Backend

- Added backend-generated `OP-YYYYMMDD-NNNN` reservation support through the existing business-code allocator.
- Added Operation CRUD validation for localized name, type, confirmation mode, and quantity reporting.
- Operation update strips immutable code/version fields while allowing lifecycle deactivation.
- Added `GET /operations/:id` with supporting Workstation and Work Center business identities.
- Added `GET /operations/:id/dependencies` for capabilities, Work Center compositions, Routings, skill requirements, work instructions, resource capabilities, and production standards. Work-instruction lookup is tolerant of older schemas.
- Added safe-delete dependency protection with stable `OPERATION_REFERENCED` response; deactivation remains available for referenced Operations.
- Routing Operation creation rejects inactive/obsolete Operations with `ROUTING_OPERATION_INACTIVE`.
- Routing Operation creation rejects an Operation/Work Center pair that is not exposed by an active Workstation capability and Work Center composition with `WORKCENTER_OPERATION_NOT_SUPPORTED`.
- Existing transactional Workstation capability replacement and Work Center composition validation remain the source of truth for timing and hierarchy rules.

## MES Console

- Added `/master-data/operations`, `/new`, `/:id`, and `/:id/edit` routes.
- Added Operation list, read-only generated code, localized create/edit form, detail view, dependency impact counts, deactivate, and confirmation-protected delete/edit actions.
- Added localized Operation Catalog navigation, breadcrumbs, enum labels, dependency labels, and inline-create labels for Vietnamese, English, Japanese, and Korean.
- Workstation Supported Operations now supports inline creation of a central Operation. The created Operation is inserted into the capability row that launched the modal, rather than being appended to an unrelated row.
- Inline creation uses the same backend reservation and central Operation endpoint as the dedicated catalog.

## Verification

- `npm run typecheck --workspace=mes-console`: passed.
- `npm run typecheck --workspace=mes-master-data-service`: passed.
- `npm run typecheck` at repository root: passed for all workspaces.
- `node --check scripts/test-mes-operation-workstation-workcenter-flow.mjs`: passed.
- Integration smoke test: `npm run test:mes:operation-flow`.

Runtime verification after rebuild:

- `mes-master-data-service` is healthy and `mes-console` is running after Docker rebuild/restart.
- Smoke test passed with live fixture `OP-20260726-0003`, `WS-MOLD-KIOSK01`, and `WC-VULCAN-MOLD`.
- Inactive Operation Routing validation returned the expected `ROUTING_OPERATION_INACTIVE` business error.
- The smoke test passed both positive composition validation and negative unsupported-capability rejection using an unused active Operation fixture.

During the first live run, the dependency endpoint exposed a schema mismatch by selecting `md_work_center_composition.master_id`; the actual primary key is `composition_id`. This was corrected and the endpoint was rebuilt and reverified.

The smoke test creates a uniquely named Operation, verifies backend code generation, persists and reads a Workstation capability, accepts the supported Work Center composition, rejects an unsupported Workstation composition when a second fixture exists, verifies Operation detail/dependency projections, and verifies inactive Operation rejection by Routing when a Routing fixture exists. Created test Operations are intentionally retained as auditable demo data and are deactivated after the Routing validation assertion.

## Runtime Notes

Run the smoke test against the direct service by default (`http://localhost:13020/api/mes/master-data`) or set `MES_MASTER_DATA_URL` to the Kong URL. The script uses an existing active Workstation and Work Center fixture and does not expose UUIDs in the console UI.
