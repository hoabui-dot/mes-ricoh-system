# Workstation Machine Group Availability and Assignment Validation

Implemented `process-fix/Fix-Workstation-Machine-Group-Availability-and-Assignment-Validation.md`.

## Root cause

The Machines list counted units by execution status only. A unit already committed as a Primary machine elsewhere was displayed as available, then the transactional save excluded it and returned one generic error. Edit mode also needed to exclude the current Workstation's own Primary assignment.

## Changes

- Added `GET /api/mes/master-data/workstations/machine-availability` with physical-unit availability, external Primary assignment exclusion, and current-Workstation self-exclusion.
- Workstation create/edit forms load this focused availability projection instead of using status-only machine counts.
- Backend allocation excludes externally conflicting Primary units and already-selected units across all requirements in the transaction.
- Unit resolution is deterministic by unit sequence and code.
- Backend now returns structured cause-specific codes: `MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE` and `MACHINE_UNIT_PRIMARY_CONFLICT`.
- Error responses preserve `code` and `details`; the Console maps them to separate localized messages.
- Machines list availability count now excludes overlapping external Primary assignments.
- Historical assignments retained by the current Workstation remain selectable during edit.
- Removed obsolete `active_flag`, `ended_by`, and `ended_at` writes from `md_resource_assignment` replacement logic; assignment activity is represented by `effective_to` in the actual schema.
- Machine master and physical-unit availability requests used by create/edit forms explicitly bypass browser caching so the form always starts with current availability.

## Verification

- MES master-data build passed.
- MES Console build passed.
- Create-mode availability correctly reports `EQ-MOLD-HYD01` as unavailable because it is assigned to `WS-MOLD-KIOSK01` and reports `EQ-MOLD-HYD02` as available.
- Edit-mode availability for `WS-MOLD-KIOSK01` correctly restores its own `EQ-MOLD-HYD01-01` unit as available.
- Both affected containers rebuilt and restarted; master-data service is healthy.
- `git diff --check` passed.
- Direct valid edit verification passed: Primary `EQ-MOLD-HYD01` plus Supporting `EQ-MOLD-HYD02` resolved two distinct physical units.
