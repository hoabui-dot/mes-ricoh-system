# MES Resource CRUD, Workstation Operations, Work Center Composition, and Skill Management

Date: 2026-07-24
Process: `process-fix/Complete-MES-Resource-CRUD,-Workstation-Operations,-Work-Center-Composition,-and-Skill-Management.md`

## Delivered

- Added forward migration `0025_work_center_composition_and_code_reservations`.
- Added `md_work_center_composition` as an effective-dated Work Center -> Workstation -> Operation relationship. The API validates same-Shopfloor hierarchy, active Workstations, at least one operation per selected Workstation, and only operations represented by active Workstation capabilities.
- Added business-code reservation storage and `POST /business-codes/reservations`. Workstation, Work Center, Factory, Shopfloor, Machine, and Skill prefixes use backend allocation; create handlers consume reservations atomically when supplied.
- Added Workstation operation capability create/list API and Workstation detail projections. Workstation forms now support translated operations, cycle time, setup time, base quantity, and operation persistence.
- Added Work Center composition UI for Shopfloor-filtered Workstations and supported-operation checkboxes. The Work Center form no longer exposes the incorrect free-standing concurrent-machine/cycle-time controls.
- Added dedicated Skill Management routes for Machine, Workstation, and Work Center scopes with central Skill Groups and Skill Definitions. Skill prefixes use scoped `SKG-*` and `SK-*` reservations where supplied.
- Added grouped resource skill selection to Machine, Workstation, and Work Center resource forms and persisted scoped assignments through the central assignment API.
- Replaced the handwritten status switch with Radix `@radix-ui/react-switch` and added it as a direct MES Console dependency.
- Added machine dependency projection and stable `MACHINE_REFERENCED`/`WORKSTATION_REFERENCED` delete errors. Machine quantity reductions now check active required machine demand before retiring units.
- Corrected the source translation for Vietnamese `common.site` from corrupted text to `Nhà máy`.

## Verification

- MES master-data TypeScript build passed.
- MES Console TypeScript/Vite build passed.
- Root i18n static scan passed.
- `git diff --check` passed.
- Docker image rebuild succeeded after one transient `esbuild` `ETXTBSY` dependency-install failure; containers were restarted successfully.
- Live migration `0025_work_center_composition_and_code_reservations` applied and master-data service is healthy.
- In-container health, skill-group, business-code reservation, and Work Center composition endpoints returned valid responses.
- Existing non-fatal Schema Registry compatibility warning remains unchanged.

## Remaining hardening

The current demo console does not yet provide a full dependency-impact dialog with navigation on every resource mutation, inline “Other” skill creation inside each resource selector, complete actor-name directory projection, or execution-side revalidation migration of every legacy assignment path. These are recorded as follow-up work rather than hidden behind UI-only behavior.
