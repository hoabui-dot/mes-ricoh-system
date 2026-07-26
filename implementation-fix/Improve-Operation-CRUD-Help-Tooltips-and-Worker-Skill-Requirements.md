# Operation CRUD Help Tooltips and Worker Skill Requirements

## Scope

Implemented the requirements in process-fix/Improve-Operation-CRUD-Help-Tooltips-and-Worker-Skill-Requirements.md.

## Implementation

### Backend

- Added migration 0029_operation_worker_skill_default_constraints.
- Added positive-person and effective-date constraints.
- Added an active unique index for one default requirement per Operation and Employee Skill.
- Added Operation default endpoints:
  - GET /api/mes/master-data/operations/:id/worker-skill-requirements
  - PUT /api/mes/master-data/operations/:id/worker-skill-requirements
- Added Routing Operation final-requirement endpoints:
  - GET /api/mes/master-data/routing-operations/:id/worker-skill-requirements
  - PUT /api/mes/master-data/routing-operations/:id/worker-skill-requirements
- Validation enforces active Employee scope only, no duplicate active skill, Basic and L1-L5 levels, positive integer required persons, and valid effective dates.
- Stable scope, duplicate, level, and persons errors are returned.
- Updates end prior active records with effective dating. Released Routing requirements are not rewritten when Operation defaults change.

### MES Console

- Reworked Operation CRUD into Basic Information, Execution Behaviour, Execution Requirements, and Default Worker Skill Requirements sections.
- Added Employee-only skill selectors with localized name and code secondary text.
- Added minimum level, required persons, mandatory flag, effective dates, status-aware rows, add, and remove actions.
- Operation detail now displays default worker requirements.
- Routing Operation creation loads active Operation defaults and marks them as inherited from Operation.
- Routing users can change level, persons, mandatory status, add Employee skills, or remove inherited rows with shadcn confirmation.
- Routing submission persists the final requirements against the Routing Operation.
- Added localized VI/EN/JA/KO help content for confirmation mode, quantity reporting, material scan, output label, partial confirmation, scheduling, operation type, and worker requirements.

### Shared UI

- Replaced the old CSS-only InfoTooltip implementation with the Radix/shadcn Tooltip primitive.
- Added reusable FieldHelpTooltip with accessible circular icon, keyboard focus support, hover support, light/dark styling, structured explanation, example, and important note.
- Existing InfoTooltip consumers remain compatible.
- Corrected the tooltip surface tokens: the theme did not define `bg-popover` or `text-popover-foreground`, so the panel was transparent. Tooltip content now uses the existing opaque `surface-elevated` background, semantic foreground, explicit opacity, isolation, and a higher stacking layer.
- Fixed Worker Skill selector freshness: the Operation form refreshes `/worker-skills` when adding a requirement row and accepts both current `scope` and legacy `scope_type` fields while enforcing Employee scope.
- Raised the shared Radix SelectBase content layer to `z-[200]` with an opaque isolated surface so option menus render above modal, tooltip, and card overlays. This fixes the Worker Skill level selector and all other SelectBase consumers.
- Fixed Operation create/update payloads sending legacy `active_flag` to `md_operation`. The operation schema uses the shared `lifecycle_status` field and does not contain `active_flag`; the Console no longer sends it and the API ignores the legacy field for compatibility.
- Audited the Operation detail against the current `md_operation` schema. Detail fields are now rendered only when the corresponding database property is present in the API row; nullable/defaulted values use domain defaults, while empty worker-requirement, dependency, and supporting-workstation sections are omitted.

### Verification Addendum (2026-07-26)

- MES Console build completed after the SelectBase and Operation payload changes.
- MES master-data service build completed after the API compatibility fix.
- Docker images were rebuilt and the MES Console/master-data containers restarted successfully.
- `md_operation` writes now contain only columns present in the current schema; Worker Skill level options use the shared dropdown layer above modal content.

## Verification

- npm run build --workspace=services/mes-console: passed.
- npm run build --workspace=services/mes-master-data-service: passed.
- Docker images rebuilt for MES Console and MES master-data service.
- Containers restarted successfully.
- Migration 0029 applied cleanly in mes-master-data-db.
- Worker skills endpoint returned Employee-scope records only.
- Positive Operation default save returned HTTP 200 and persisted the requirement.
- Machine-scope skill rejected with HTTP 422 and OPERATION_WORKER_SKILL_SCOPE_INVALID.
- Routing Operation requirement read endpoint returned HTTP 200 with localized skill data.
- Existing Schema Registry compatibility warning is unrelated to this change; the service remained healthy and listening on port 3020.
