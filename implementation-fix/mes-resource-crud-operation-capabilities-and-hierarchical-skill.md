# MES Resource CRUD, Operation Capabilities, and Hierarchical Skills

Date: 2026-07-24
Process: `process-fix/Complete-MES-Resource-CRUD,-Operation-Capabilities,-and-Hierarchical-Skill.md`

## Implemented

- Added migration `0024_resource_crud_capabilities_and_skill_scopes`.
- Added `md_workstation_machine_requirement` for machine-group requirement lines: Machine, role, quantity, Required/Optional type, optional pinned unit IDs, sequence, effective dates, lifecycle, and audit actors. Existing assignments are backfilled.
- Added `md_workstation_operation_capability` with workstation/operation scope, cycle/setup/base quantity, efficiency, scheduling mode, effective dates, and lifecycle.
- Added `md_skill_group`, skill scope metadata (`Machine`, `Workstation`, `WorkCenter`, `Employee`), and `md_resource_skill_assignment`; existing skills are placed in a localized `LEGACY` group.
- Added registry entries, Workstation capability/requirement projections, skill group and scoped skill-assignment APIs, and machine `change-impact` reporting for active requirements, assignments, and capabilities.
- Machine-group creation accepts the new `requirements` payload and remains compatible with the former primary/supporting payload. It validates role, duplicate lines, quantity, same-site status, and available physical units, then writes requirement rows and compatibility assignments.
- Replaced the Workstation form's deprecated minimum-machine/member editor with a requirement-line editor for machine, role, quantity, and Required/Optional state.
- Added Vietnamese, English, Japanese, and Korean translations for the new controls.

## Verification

- Master-data and MES Console TypeScript/Vite builds passed.
- Master-data unit tests passed after updating the registry-count assertion for the four new resources.
- Root static i18n scan and `git diff --check` passed.
- Docker images for `mes-master-data-service` and `mes-console` rebuilt and restarted.
- Live container applied migration `0024_resource_crud_capabilities_and_skill_scopes` and is healthy.
- In-container health, skill-group, and machine change-impact requests returned successful responses against seeded data.
- Existing Schema Registry compatibility warnings remain non-fatal and pre-existing.

## Remaining hardening

Legacy assignment and minimum-machine columns remain for compatibility until all execution/readiness consumers migrate. Full Work Center composition CRUD, a dedicated skill-management workspace, browser click-through evidence, and complete group-aware execution revalidation remain follow-up hardening items.
