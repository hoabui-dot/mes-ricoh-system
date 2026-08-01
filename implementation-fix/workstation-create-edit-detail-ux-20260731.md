# Workstation Create/Edit/Detail UX Audit

## Scope

This change is limited to the MES Console UI and its existing Workstation detail/availability API mapping. The
backend ownership model and persistence contracts were not changed.

## Ownership mapping

- Machine Requirements describe the machine type, role, quantity, and required/optional policy for a Workstation.
- Effective Assigned Machines are read from `md_resource_assignment` and represent actual Equipment/Machine Units.
- Machine Readiness is a current master-data summary. Work Order shift capacity and reservations remain owned by
  Resource Planning.
- The existing Workstation save path still creates the initial requirement/assignment rows only after a successful
  Workstation save.

## UI changes

- Create no longer renders a Current Assigned Machines panel or an empty assignment message. It renders an
  `Initial assignments (after save)` explanation below Machine Requirements.
- Edit renders Machine Requirements, the effective Assigned Machines panel, Machine Readiness, and Assignment
  History. Effective dates are applied when deciding which assignments are current.
- Detail renders Machine Readiness, Machine Requirement Groups, effective assignment context, and Assignment History.
- Detail readiness reports Ready, Warning, or Blocked, required quantity, assigned quantity, available quantity, and
  translated blocking/warning reasons.
- Loading labels no longer present Workstation Supported Operations as a current form section.
- Added Vietnamese, English, Japanese, and Korean translations for the new section labels and helper text.

## Verification

- `git diff --check`: passed.
- `npm run typecheck`: passed for workspaces, including MES Console.
- `npm run build` in `services/mes-console`: passed.
- Rebuilt and restarted `mes-console` with the platform and MES Compose files: container started successfully.
- `GET /api/mes/master-data/workstations?limit=1`: HTTP 200.
- `GET /api/mes/master-data/workstations/{id}` for `dc497a37-1347-481e-a120-9a0fad5238a1`: HTTP 200; response
  contained `assignments` and `machine_groups` used by Detail.
- MES Console HTTP root: HTTP 200 after rebuild.

Browser automation was not available in this execution environment. The route/build/runtime checks cover the same
data path; manual browser verification should exercise `/master-data/workstations/new`, an existing Workstation
edit route, and its detail route to confirm the Create/Edit/Detail visibility states.

## Remaining limitation

Machine availability is fetched separately by the existing `machine-availability` endpoint. If that endpoint is
temporarily unavailable, the Detail summary can report a conservative zero available quantity; this does not alter
backend readiness or Work Order planning decisions.
