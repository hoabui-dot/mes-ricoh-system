# MES WO Resource Calendar Seed Fix

Date: 2026-07-27

## Reported symptom

Work Order `WO-20260727-0038` showed:

- `Chưa cấu hình lịch nguồn lực cho ngày và ca đã chọn`
- readiness `Blocked`
- candidate error `CALENDAR_NOT_CONFIGURED`

## Root cause

The Work Order used `SHIFT-B` (`88ae8534-8dae-48dd-b1b7-437822982ddd`) on
2026-07-27. The seed script only created the E2E resource calendar for
`SHIFT-A`. The machine group and equipment capacity were valid, but the
resource-planning query correctly requires a calendar matching all of:

`site + resource + calendar date + selected shift`.

There was also a date-boundary bug in the production-ready endpoint. Newly
released records had `effective_from` later on the selected day, but the query
compared them with that day's midnight. This caused a newly seeded Production
Version to be excluded from readiness on its release day.

## Changes

### Seed script

Updated `scripts/seed-mes-wo-complete-dataset.mjs`:

- creates/upserts an Available 540-minute calendar for every Released shift at
  the demo site, not only `SHIFT-A`;
- uses the same `E2E_WO_TARGET_DATE` for calendars, read-model data, WMS expiry
  validation, preflight, and Work Order creation;
- passes an explicit planned start at 08:00 UTC on the target date;
- makes calendar codes date-aware for repeatable runs;
- records `target_date` in the planning and Work Order artifacts.

### Master-data readiness

Updated `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`.
Production-ready date filtering now treats a record released during the
selected date as valid for that date's planning window instead of requiring
`effective_from <= selected_date at 00:00`.

## Database repair performed

Before rerunning the full reset seed, the missing calendars for the existing
WO date were inserted transactionally for the site's released shifts. The
subsequent reset removed the old development Work Orders, including `0038`,
and recreated the clean E2E dataset. No master-data relationships were
patched on an individual Work Order.

## Verification

Command:

```bash
E2E_WO_TARGET_DATE=2026-07-27 ALLOW_PRINT_STATION_OFFLINE=true npm run reset:seed:mes:wo
```

Result:

- seed completed successfully;
- 3 released shifts found;
- 3 resource calendars seeded;
- Production Version readiness: `true`;
- WMS component availability: `2038.03`, required `2`;
- new demo Work Order: `WO-20260727-0039`;
- 3 Work Order operations created;
- all 3 resource-candidate responses: `Ready`;
- all 3 candidate readiness values: `Eligible`;
- all blocking error lists: empty;
- each selected calendar: `Available`, `540` minutes, capacity factor `1`.

The `ALLOW_PRINT_STATION_OFFLINE=true` flag was used only because the remote
physical Print Station is external to this local seed run. It does not bypass
resource-planning, production-version, or Work Order validation.

## Expected future use

Use `E2E_WO_TARGET_DATE=YYYY-MM-DD` when a deterministic date is required. The
seed will create calendars for all Released shifts on that date, so selecting
any valid site shift in the MES Console will be evaluated against a real
calendar rather than synthetic capacity.

