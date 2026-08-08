# Resource Calendar to Downtime Update

Date: 2026-08-07

## Decision

`md_resource_calendar` remains the storage table and API route for compatibility, but the MES Console feature is now a **Resource Downtime** feature. It records an interruption window for one Equipment, Workstation, or Work Center.

The form no longer asks for Factory, Shift, Availability Status, Available Minutes, Capacity Factor, or a reason-code option. It requires:

- localized Name;
- generated, read-only Code;
- resource type and resource;
- downtime start date and time;
- downtime end date and time; the range may span multiple days;
- free-text Reason.

The backend derives Site and Work Center from the selected resource. It persists `availability_status = 'PlannedDown'`, `shift_id = NULL`, `available_minutes = 0`, and `capacity_factor = 0` in one transaction.

## Validation

- Resource must be active and must exist in the selected resource domain.
- Date, start time, end time, and reason are required.
- End date/time must be later than start date/time.
- The same resource cannot have overlapping downtime intervals.
- Downtime records do not require a shift.
- Existing non-downtime calendar rows still require a valid Site/Shift relationship through the database trigger.
- Overlapping downtime intervals for the same resource are rejected with `DOWNTIME_OVERLAP`.

## Production planning behavior

During resource candidate evaluation, MES checks downtime overlap with the requested shift for:

- direct Equipment assignments;
- Workstations;
- Work Centers;
- machine-group Primary machines;
- required Supporting machines.

An overlap adds `RESOURCE_DOWNTIME` as a blocking diagnostic, including the reason and downtime interval. The candidate becomes `Blocked`, allowing the existing Production Line selection flow to choose a feasible Backup line. If no complete line remains feasible, the Work Order remains blocked by the existing line/resource readiness rules.

## Verification

- Migration `0077_resource_downtime_semantics` adds `reason_text` and permits shiftless downtime rows.
- Migration `0078_allow_shiftless_downtime` updates the validation trigger so PlannedDown rows do not require a Shift while ordinary availability rows retain Shift validation.
- Migration `0079_localize_resource_downtime_name` converts resource downtime names to localized JSONB and repairs the seeded Banbury row.
- `resource-downtime-smoke.spec.ts` verifies required-field and time-range failures, creates and reads a shiftless downtime row, checks the UI fields, and removes the disposable row.
- Docker Compose deployment applied migration `0078`; `/health` returned `ok` after Kafka and print-station runtime dependencies connected.

## Known compatibility boundary

The route and table names still contain `resource-calendar` because Work Order and master-data contracts use those identifiers. New UI copy and create/edit behavior use downtime semantics. Existing baseline availability rows remain read-compatible for planning; they are not created by the new downtime form.
