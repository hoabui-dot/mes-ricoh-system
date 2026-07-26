# MES Machine Edit and Safe Delete Actions

Date: 2026-07-26

Process reference: `process-fix/Complete-MES-Resource-CRUD,-Operation-Capabilities,-and-Hierarchical-Skill.md`

## Delivered

- Added edit and delete action buttons to `/master-data/machines` and the shared machine/equipment resource list.
- Machine edit uses the existing read-only business code and the existing resource form fields: localized name and description, type, manufacturer, model, quantity, serial number, efficiency, execution status, planning status, and scoped skills.
- Before saving an existing machine, the console calls the existing `GET /machines/:id/change-impact` contract. When active workstation requirements depend on the machine, the user must confirm that the change will not rewrite historical records.
- Delete opens a shared modal and loads `GET /machines/:id/dependencies`. The modal shows machine units, workstation requirements, machine groups, resource assignments, capabilities, calendars, and production standards.
- Permanent delete remains unavailable when relationships or retained machine units exist. The backend returns the stable `MACHINE_REFERENCED` error and the modal offers deactivation instead.
- Deactivation uses the existing master-data update path with `lifecycle_status = 'Inactive'`; it does not remove assignments, requirements, units, or historical data.
- Added a reusable `deleteResource` client helper and Vietnamese, English, Japanese, and Korean labels for the machine action and dependency states.

## Relational Rules Preserved

- No cascade delete is performed.
- Machine UUIDs, machine units, workstation requirements, machine groups, assignments, capabilities, calendars, production standards, and historical snapshots are not rewritten by edit or delete actions.
- Quantity changes continue through the existing transactional machine-unit synchronization and its active-assignment validation.
- The existing dependency endpoints remain the single API contract; no duplicate dependency route was introduced.

## Verification

- `npm run typecheck --workspace=mes-console` passed.
- `npm run typecheck --workspace=mes-master-data-service` passed.
- `git diff --check` passed.
- Live `GET /api/mes/master-data/machines` returned `200`.
- Live `GET /api/mes/master-data/machines/:id/dependencies` returned dependency records for a seeded referenced machine.
- Live `GET /api/mes/master-data/machines/:id/change-impact` returned the machine impact projection.
- Live deletion of the referenced machine returned `409 MACHINE_REFERENCED`; no data was removed.
- MES master-data service and console Docker images rebuilt successfully and were restarted.

## Edit Form Mapping Fix

The edit route was incorrectly treated as a create route because the loader checked `formMode` before checking whether an `id` existed. As a result, `/master-data/machines/:id/edit` reserved a new code and never fetched the existing machine record.

The loader now fetches existing data whenever an `id` is present for both detail and edit routes. It normalizes localized `name` and `description`, numeric `quantity` and `default_efficiency`, boolean status flags, execution status, and active Machine skill assignments before passing the model to the form. The code remains read-only and the backend remains authoritative.

Verification after the fix:

- Live machine detail returned the expected localized name, equipment type, quantity, efficiency, execution status, planning flag, and active flag.
- Live resource skill lookup was mapped into `skill_ids`.
- MES Console typecheck passed.
- MES Console production build passed.
- MES Console container was rebuilt and restarted successfully.

## Confirmation and i18n Refinement

- Added the shared shadcn/Radix `Confirmation` component and removed all native `window.confirm` calls from the MES Console.
- Machine edit impact, machine delete/deactivate, skill deactivation, and item deactivation now require an explicit Alert Dialog action.
- Added `skills.resourceSkills` and `skills.resourceSkillsHelp` translations for Vietnamese, English, Japanese, and Korean.
- Added machine confirmation labels and descriptions for all supported locales.
- MES Console typecheck passed after the confirmation migration.

## Edit Confirmation Mount Fix

The first machine edit confirmation was created but rendered only in the list-route branch. Edit routes return the form branch early, so the impact check returned without a visible confirmation and the save appeared to do nothing. The confirmation is now mounted alongside `ResourceForm`; confirming re-enters the save flow with an explicit bypass for the already-confirmed impact check, then submits the edited payload.

- MES Console typecheck passed.
- MES Console production build passed.
- MES Console container rebuilt and restarted successfully.

## Machine Update Payload and Required Skills Fix

The machine edit form was forwarding the complete detail response into the generic update endpoint. That response includes read-only SQL projection fields such as `site_code`, `site_name`, `work_center_code`, `work_center_name`, `assignments`, `units`, and `available_unit_count`. The generic update handler then interpreted those projection keys as `md_equipment` columns, producing:

```text
column "site_code" of relation "md_equipment" does not exist
```

The edit flow now builds an explicit writable machine payload containing only the machine master fields. The backend also strips known projection fields defensively before constructing the SQL `UPDATE`, so a stale client cannot write joined detail fields into the base table.

Machine skill handling is now a replace/synchronize operation rather than repeated one-row inserts. `PUT /resource-skill-assignments/Machine/:id` validates that every skill belongs to the Machine scope, is active, and is not legacy; it closes removed assignments with `effective_to` and inserts only new assignments inside one transaction. The endpoint rejects an empty skill set for Machines with `MACHINE_SKILL_REQUIRED`. The console form also blocks save immediately with a localized message when no Machine skill is selected.

This preserves assignment history and prevents duplicate active rows on repeated edits. Existing detail-only fields remain available for display but are never treated as editable database columns.

## Latest Verification

- `npm run typecheck --workspace=mes-console` passed.
- `npm run typecheck --workspace=mes-master-data-service` passed.
- `npm run build --workspace=mes-console` passed.
- `git diff --check` passed.
- MES master-data service and MES console images rebuilt and containers restarted successfully; both containers are running, and the master-data service is healthy.
- Live `PUT /api/mes/master-data/machines/:id` succeeded with the previously failing `site_code` projection field present; the response contained only valid machine columns.
- Live `PUT /api/mes/master-data/resource-skill-assignments/Machine/:id` succeeded with a valid Machine skill, and the subsequent GET returned the active assignment.
- The machine update no longer produces the `md_equipment.site_code` SQL error.

## Machine Detail Enrichment

The machine detail endpoint now returns active, non-expired Machine skill assignments with business code, localized name, minimum level, required flag, and effective dates. The MES Console detail view now presents:

- equipment type, manufacturer, model, serial number, quantity, available-unit count, efficiency, and planning-resource state;
- localized description, Site, Work Center, and execution status;
- selected Machine skills with level and required/optional state;
- physical machine units with unit sequence and execution status;
- existing assignment history with Work Center, Workstation, group, unit, role, and effective period.

Internal UUIDs remain hidden; only business codes and localized names are displayed.

## Site Relationship Fix for Create and Edit

`md_equipment.site_id` is a mandatory foreign key. The machine form previously exposed neither Site nor Work Center, so a new machine could reach the database without `site_id`; stale edit payloads could also contain `site_id: null`. The form now requires Site, allows an optional Work Center, preserves both values when editing, and sends them as part of the explicit machine payload.

The create handler now validates that Site exists and that an optional Work Center belongs to the same Site before inserting. The update handler ignores null/empty Site values rather than attempting to blank the required relationship; a supplied non-null Site remains subject to the database hierarchy trigger. This gives the user a clear validation response instead of a raw `NOT NULL` database error.

Verification: a live update of the existing machine with `site_id: null` and unchanged localized name succeeded and preserved the existing Site ID. The rebuilt master-data service is healthy and the MES Console is running.

## Workstation Edit and Safe Delete

Workstation rows now expose edit and delete actions. The edit flow loads the existing localized workstation, Work Center, execution mode, Machine Group requirement lines, supported operation capabilities, and Workstation skill assignments. It submits an explicit writable workstation payload and synchronizes capabilities and Machine Groups through transaction-backed replacement endpoints, ending superseded active records instead of deleting history. Work Center changes derive Site, Shopfloor, and Area from the selected Work Center and remain subject to the hierarchy trigger.

Before an edit, the console checks Workstation dependency impact and asks for explicit confirmation when active groups, requirements, assignments, capabilities, calendars, compositions, or skills are present. Delete and deactivate use dependency-aware dialogs. Permanent deletion is blocked by the backend whenever the Workstation has groups, requirements, assignments, capabilities, calendars, compositions, or retained skill references; no related manufacturing configuration is cascade-deleted.
