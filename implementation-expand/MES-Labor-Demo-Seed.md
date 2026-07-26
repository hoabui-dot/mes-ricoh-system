# MES Labor Demo Seed

Date: 2026-07-24

## Scope

Added `scripts/seed-mes-labor-demo.sh` and the root command
`npm run seed:mes:labor:demo`. The seed is idempotent and inserts only demo master-data fixtures. It
does not truncate or delete employee, shift, skill, or work-calendar records.

## Fixtures

- Three shifts: existing `SHIFT-A`, plus `SHIFT-B` (16:00-00:30, crosses midnight) and `SHIFT-C`
  (00:00-08:00).
- Eight employees `EMP-001` through `EMP-008`, distributed across Mixing, Cutting, Vulcan Molding,
  and Quality work centers.
- Deterministic skill assignments and levels (`L1`-`L3`) using the existing seeded skills.
- Weekday work-calendar rows from `CURRENT_DATE - 90` through `CURRENT_DATE + 90`, producing 1,032
  rows for the eight demo employees.
- `EMP-008` is marked `OnLeave` for the next weekday as a deliberate labor-availability fixture;
  all other generated rows are `Scheduled`.

## Cleanup integration

`scripts/consolidated-demo-cleanup-reseed.sh` now runs the labor seed after restarting
`mes-master-data-service`, then verifies demo employee and schedule counts. The existing cleanup
guard remains required: `APPLY=1 APP_ENV=development|demo CONFIRM_DEMO_CLEANUP=YES`. Master-data tables
are still never truncated.

## Verification

- First live run: PASS, 8 employees, 3 shifts, 1,032 weekday schedules.
- Immediate rerun: PASS with the same counts, confirming idempotency.
- Consolidated cleanup script dry-run: PASS.
- Bash syntax and `git diff --check`: PASS.
