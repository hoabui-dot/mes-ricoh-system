# Restore Worker Skills as a Tab in Skill Management

## Status

Implemented and runtime verified on 2026-07-25.

## Requirement audit

The previous worker-skill surface was embedded in the employee editor and used `md_skill` with `scope = 'Employee'` plus `md_employee_skill`. The new Skill Management screen previously exposed only Machine, Workstation, and Work Center tabs. This implementation restores Worker Skills as a fourth tab without moving Employee skills into resource scopes or removing existing records.

## Implementation steps

1. **Preserved the worker model and added history fields**
   - Added migration `0027_worker_skill_assignment_history` in `services/mes-master-data-service/src/infrastructure/db/migrate.ts`.
   - Added effective start/end timestamps, active state, qualification status, certificate code, certification date, expiry date, ending actor, and ending timestamp to `md_employee_skill`.
   - Changed the assignment key to include `effective_from`, allowing an ended assignment to be followed by a new assignment without overwriting history.
   - Added active-assignment uniqueness and lookup indexes.
   - Updated the Drizzle model in `services/mes-master-data-service/src/infrastructure/db/schema.ts`.

2. **Separated Worker Skill APIs from resource Skill APIs**
   - Added `GET /worker-skills` for non-legacy Employee-scope definitions and active assignment counts.
   - Added `POST /worker-skills`; codes are allocated by the backend with the `SK-EMP` prefix.
   - Added `PUT /worker-skills/:id` for name, description, minimum level, and lifecycle updates. Scope and group cannot be changed through this endpoint.
   - Added dependency inspection at `GET /worker-skills/:id/dependencies`.
   - Added assignment listing, assignment creation/update, and assignment ending endpoints.
   - Ending or replacing an assignment updates its effective end and audit fields; it does not delete the row.
   - Added safe delete behavior. Skills referenced by assignments, operation requirements, or production standards return `409 SKILL_REFERENCED` and must be deactivated instead.
   - Updated the legacy employee bulk assignment endpoint to validate Employee scope, end removed assignments, update existing assignments, and preserve historical rows.

3. **Restored the console tab and workflow**
   - Updated `services/mes-console/src/routes/master-data/SkillManagementScreen.tsx` with four tabs: Machine, Workstation, Work Center, and Worker.
   - Worker tab supports worker skill creation, localized name/description, level, worker assignment, qualification status, expiry date, assignment history, and ending an active assignment.
   - Worker names and skill names are rendered as business names; UUIDs are used only as internal select values and React keys.
   - Resource tabs continue to request only their own scopes and cannot display Employee skills.
   - Added Vietnamese, English, Japanese, and Korean translations in `services/mes-console/src/i18n.ts`.

4. **Preserved navigation compatibility**
   - Added redirects for `/master-data/worker-skills`, `/master-data/employee-skills`, and `/worker-skills` to `/master-data/skills/workers`.
   - Updated route header matching for nested Skill Management routes.

## Verification

- `npx tsc --noEmit -p services/mes-master-data-service/tsconfig.json` passed.
- `npx tsc --noEmit -p services/mes-console/tsconfig.json` passed.
- `npm run build --workspace=mes-master-data-service` passed.
- `npm run build --workspace=mes-console` passed.
- Rebuilt and restarted `mes-master-data-service` and `mes-console` with Docker Compose.
- Service logs confirmed migration `0027_worker_skill_assignment_history` applied and the service listening on port 3020.
- `GET /api/mes/master-data/worker-skills` returned HTTP 200 with existing Employee-scope records.
- `GET /api/mes/master-data/skills?scope=Employee` returned HTTP 200 with Employee records.
- `GET /api/mes/master-data/skills?scope=WorkCenter` returned HTTP 200 with Work Center records separately.
- `/master-data/skills/workers` served by the rebuilt console returned HTTP 200.

## Known unrelated runtime warning

The master-data service still logs the existing Schema Registry backward-compatibility warning for `MES.MasterData.ItemRevisionReleased.v1-value`. It does not prevent service startup, migration application, or the Worker Skills APIs.
