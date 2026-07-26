# MES Console Common Modal

Date: 2026-07-26

## Change

Standardized modal surfaces on the existing shadcn/Radix `Modal` component. The shared component now supports independent left and right footer slots:

- `footerLeft`: Back, Cancel, or secondary navigation actions
- `footer`: Save, Create, or primary submit actions

This keeps modal actions predictable: Back/Cancel is bottom-left and Save/Create is bottom-right.

## Migrated flows

- Employee create/edit modal
- Shift create/edit modal
- Skill create modal
- Worker Skill detail modal
- EBOM create modal continues using the shared modal surface

Employees remains the only place to assign skills to workers. Worker Skill detail is read-only.

## Verification

- MES console typecheck passed.
- MES console production build passed.
- Docker image rebuilt and `mes-console` restarted successfully.
- `git diff --check` passed.
