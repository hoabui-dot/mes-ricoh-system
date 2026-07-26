# Skill Management: Flat Skill Definitions

Date: 2026-07-26

## Change

Skill Groups are no longer part of the Skill Management user flow. Each scope tab now displays its skill definitions directly:

- Machine Skills
- Workstation Skills
- Work Center Skills
- Worker Skills

The page header contains the scope-aware **Add Skill** action. Clicking it opens a modal containing the localized name, localized description, and minimum level fields. The modal submits the definition for the active scope and closes only after a successful response.

Worker Skills retain the existing assignment panel. Selecting a worker skill still loads employee assignments, supports assignment history, and permits ending an active assignment.

## Implementation

- `services/mes-console/src/routes/master-data/SkillManagementScreen.tsx`
  - Removed group loading, group creation, group selection, and group rendering.
  - Added a controlled shadcn/Radix Dialog for skill creation.
  - Added a header-level Add Skill button for every scope tab.
  - Kept worker assignment management and deactivation actions.
- `services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx`
  - Resource skill selection is now a flat scope-filtered list instead of group sections.
  - Uses canonical `scope` while accepting `scope_type` as a compatibility fallback for older responses.
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
  - Worker skill listing uses a left join so definitions do not require a Skill Group.
  - Worker skill creation no longer requires or stores `skill_group_id`.
  - Generic resource skill creation no longer requires a Skill Group; it stores the active scope as the legacy non-null `skill_group` compatibility value and leaves `skill_group_id` null.
- `services/mes-master-data-service/src/infrastructure/db/migrate.ts`
  - Added migration `0028_skill_definition_description` because the live `md_skill` table was missing the localized description column submitted by the modal.
- `services/mes-master-data-service/src/infrastructure/db/schema.ts`
  - Added the nullable localized `description` JSONB field to `md_skill`.

The Skill Group tables and columns remain in the database for existing historical assignments and backward compatibility. They are no longer used to create, list, or select new skills in the console.

## Verification

- `npm run typecheck --workspace=mes-master-data-service` passed.
- `npm run typecheck --workspace=mes-console` passed.
- `npm test --workspace=mes-master-data-service` passed: 2 files, 3 tests.
- `npm run build --workspace=mes-console` passed.
- Docker images `mes-master-data-service` and `mes-console` rebuilt successfully.
- Containers are healthy/running after restart.
- `GET /api/mes/master-data/skills?scope=Machine` returned `200`.
- `GET /api/mes/master-data/worker-skills` returned `200` with existing definitions.

## Follow-up Hotfix

The first modal submission returned HTTP 500 because the deployed `md_skill` table predated the UI contract and did not contain the `description` JSONB column. Migration `0028_skill_definition_description` adds the column idempotently. The service was rebuilt and restarted, and an isolated create/delete request through the local Kong endpoint returned `201` followed by `200` cleanup.

The refresh issue was caused by `GET /skills` using an inner join to `md_skill_group`. New definitions have no group, so they were stored but excluded from list responses. The list query now uses a left join and filters only by the canonical `md_skill.scope`.

Worker Skills are now read-only in Skill Management: selecting a row opens a localized detail modal with definition and assignment history. Employee skill assignment remains in `EmployeesScreen`, which now requests only `?scope=Employee` definitions.

## Skill Editing and Relational Protection

The Skill Management list now exposes an edit action for every scope. Editing opens the shared modal and permits only localized name, localized description, minimum level, and lifecycle status. Code, scope, and `skill_group_id` are intentionally absent from the form and are rejected by the API if submitted. This preserves the UUID referenced by assignments, operation requirements, and production standards.

Before the modal is opened, the console requests the skill dependency summary. The modal displays active resource assignments, employee assignments, operation skill requirements, production standards, and lifecycle status. Existing relationships are not rewritten during an edit. Referenced skills remain non-deletable and should be deactivated instead.

The master-data API now provides `GET /skills/:id/dependencies` and a dedicated `PUT /skills/:id`. The worker endpoint keeps its dedicated `PUT /worker-skills/:id` contract. Both endpoints validate localized names, reject duplicate active names within the same scope, and reject scope or relationship mutation with a stable conflict error.

## Edit Verification

- `GET /api/mes/master-data/skills/:id/dependencies` returned `200` with all dependency counts and `referenced` status.
- A temporary localized name/description update through `PUT /api/mes/master-data/skills/:id` returned `200`; the original values were restored and verified with a subsequent GET.
- `npm run typecheck --workspace=mes-master-data-service` passed.
- `npm run typecheck --workspace=mes-console` passed.
- MES master-data service and console Docker images rebuilt successfully and containers restarted.
- Service startup completed with database migrations applied; the existing Schema Registry compatibility warning remains unrelated to skill editing.
