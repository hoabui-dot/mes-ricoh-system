# Translate Workstation Required-Fields Error

Implemented the Workstation create-form handling for backend error code `WORK_CENTER_AND_MACHINE_GROUPS_REQUIRED`.

- Added Vietnamese, English, Japanese, and Korean translations.
- Mapped the exact backend error code to the localized message before displaying the toast on `master-data/workstations/new` and edit forms.
- Preserved backend validation and the existing Work Center/Machine Group relationship rules.

Verification: MES Console production build and i18n scan passed; `git diff --check` passed.

## Follow-up root-cause fix

The localized error exposed a separate submit-flow defect: the create form kept `work_center_id` and `machine_groups` in React state, but the workstation POST payload only sent `work_center_id`. The backend correctly rejected the request because `machine_groups` was absent. The payload now includes `machine_groups`; the existing transaction-backed group synchronization remains in place for the subsequent capability/group save flow.

## Machine quantity and primary assignment fix

- Added client-side capacity accounting across all Machine Groups. A machine with two available units can be selected for two group requirements, but the third selection is disabled and submit validation blocks any over-capacity configuration.
- Each group still requires exactly one Primary machine; a machine selected as that group’s Primary cannot also be selected as its Supporting machine.
- Backend unit resolution now excludes physical units already assigned to an overlapping Primary requirement and resolves different units when a machine record has quantity greater than one.
- Added migration `0031_machine_unit_primary_assignment_exclusivity`, changing the exclusion key from the aggregate equipment ID to `machine_unit_id` when available. This allows distinct physical units of the same machine model to be assigned independently while preserving overlap protection per unit.
- Database conflicts are returned as a stable `MACHINE_UNIT_ALREADY_ASSIGNED` error and translated in the Console.

## Runtime verification

- `npm run build --workspace=services/mes-master-data-service` passed.
- `npm run build --workspace=services/mes-console` passed.
- Static i18n coverage check passed.
- Migration `0031_machine_unit_primary_assignment_exclusivity` applied successfully at runtime.
- Rebuilt `mes-master-data-service` is healthy and `mes-console` is running on port `13052`.
- `GET http://localhost:13052/master-data/workstations/new` returned HTTP 200.
- `git diff --check` passed.

## Primary machine validation correction

The rendered Workstation form uses `MachineRequirementEditor`, whose state is stored as `machine_groups[].requirements[]`. Each requirement carries `role` and `machine_id`; it does not use the `primary_machine_id` shape used by the alternate legacy editor. The client validator was therefore checking the wrong field and always reported that a Primary machine was missing.

- Validation now accepts the actual requirement-line shape and requires a populated `role: Primary` line.
- Capacity accounting now includes requirement quantities from the rendered editor.
- Machine options prevent duplicate machine use within a group and prevent selecting more physical units than the machine capacity across groups.

## Historical effective-date replacement fix

When editing an existing Workstation, the detail response includes the original machine-group `effective_from`. Resubmitting that historical date after ending the current assignment at `NOW()` made the old Primary assignment appear to overlap its replacement, producing `MACHINE_REQUIREMENT_QUANTITY_UNAVAILABLE` even when the machine unit was Available. The backend now starts replacement machine-group assignments at `NOW()` for past/current dates and preserves only explicitly future-dated effective dates.
