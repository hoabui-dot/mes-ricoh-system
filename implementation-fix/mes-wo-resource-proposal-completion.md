# MES Work Order Resource Proposal and Planning Verification

Date: 2026-07-27
Scope: `process-fix/Complete-and-Verify-MES-Work-Order-Resource-Proposal-and-All-Dependent-Planning-Features.md`

## Result

The resource-proposal path is now executable for the deterministic development
dataset. The backend resolves a real shift, resource capability, production
standard, resource calendar, workstation/equipment hierarchy, and worker skill
readiness before returning a candidate. Allocation is transactional and the
verified Work Order was revalidated and approved without bypassing the
allocation gate.

## Root causes found

1. Readiness previously allowed synthetic calendar capacity and did not require
   a real shift/calendar. This made a candidate appear usable even when the
   planning context was incomplete.
2. Worker readiness was not evaluated against operation skill requirements,
   employee skill level, employee status, and the selected shift schedule.
3. Work Order operation snapshots did not persist routing queue/move timing;
   Compute & Check therefore could not calculate the complete planning duration.
4. Resource allocation hid several database errors. An empty previous
   allocation UUID was cast before `COALESCE`, and the allocation insert had a
   placeholder/column mismatch. Both issues could surface as a transaction
   abort (`25P02`) instead of a stable domain error.

## Implemented behaviour

- Resource readiness requires a valid site, shift, effective resource calendar,
  capability, production standard, workstation/equipment hierarchy, and worker
  readiness.
- Non-working calendars, planned-down resources, insufficient capacity, and
  missing worker skill/readiness return structured blocking codes.
- Candidate responses include calculation, calendar, capability, standard,
  worker readiness, capacity conflicts, and blocking errors.
- Allocation uses serializable transaction + advisory resource lock, checks
  stale candidates, supersedes an existing allocation, creates reservations,
  writes audit/outbox records, and commits only when every DB operation
  succeeds.
- Revalidation checks every Work Order operation and marks stale allocations;
  query/scan/update failures are returned instead of ignored.
- Work Order creation accepts and stores `shift_id`; the console loads shifts
  for the selected Production Version site and requires one before submit.
- The Work Order create/detail UI uses `FieldHelpPopover` on form labels and
  planning/operation labels. Popovers explain the source and meaning of each
  value in VI/EN/JA/KO.

## Seeded planning matrix

Reusable command:

```bash
npm run reset:seed:mes:wo
```

The command is development-only and performs cleanup before reseeding the
complete E2E master-data/WMS/labor dataset. The successful seed artifact is:

`artifacts/mes-reset-seed-verify/2026-07-27T18-37-31-590Z/`

It contains three resource capabilities, three production standards, three
resource calendars, and three operation skill requirements. The seeded
scenario uses site `SITE-KZ3`, shift `SHIFT-A`, workstation `WS-20260727-0006`,
and a released Production Version `PV-20260727-0022`.

The reusable seed now also owns the cross-service print prerequisites: it
reconciles `PRINT-STATION-01` and its PRIMARY workstation binding, seeds an
E2E label template, numbering rule, QR split rule, and traceability policy for
all three generated operation codes, and creates one Draft Work Order through
the official creation-workflow API. The latest successful seed artifact is
`artifacts/mes-reset-seed-verify/2026-07-27T19-00-31-397Z/`.

Latest seeded demo Work Order:

- `WO-20260727-0036`, ID `9a84d348-6134-43b0-8bff-aa2a0c3fcc23`, status `Draft`
- Item `E2E-WO-FG-01`, revision `E2E-WO-FG-01-R1`, quantity `2 PCS`
- 3 operations, including operation 20 with `PRINT_STATION` execution target
- 1 material requirement at `2.000000 PCS` (the earlier `/100` quantity bug
  was corrected)
- Compute & Check produced 3 labor assignments
- all 3 candidate requests returned `Ready`, one candidate, and no blockers
- Print Station readiness: `ONLINE`, Kafka `CONNECTED`, one ready printer
- WMS live availability: `2038.03 PCS` against required `2 PCS`

The seed command intentionally stops at a valid Draft WO. It does not approve,
allocate, start, consume, or physically print automatically; those are state
changing/runtime actions for the manual demo and must use the current strict
resource and remote printer flow.

## Runtime verification

Verified Work Order:

- ID: `e7d5d7f2-b86d-4458-a7cb-78a684e63c71`
- Code: `WO-20260727-0034`
- Operations: `09c7fc0f-37ac-403e-8c63-d4466080b712`,
  `788fb21e-33d6-4fc7-8fb6-a775a1022cd7`,
  `ed2d74d1-3295-4c9f-92d9-c2a1917ff7af`

Observed runtime results:

- readiness: `Ready`; candidate: `Eligible`
- Compute & Check: total `374` minutes; operation durations `208`, `58`,
  `108`; queue/move timing present; labor assignments present
- all three resource allocations: `Committed`, `validation_status: Valid`
- revalidation: HTTP 200, all three operations `valid: true`
- approval: HTTP 200, `status: Released`, event
  `MES.Execution.WOApproved.v1`, `event_published: true`

The three allocation IDs were `6d1008d2-f5d9-483c-9c98-fc4faaae7c5d`,
`2a182276-5f59-424a-9b17-68796e2f4751`, and
`d2433406-ee20-4fdd-acf6-c0f107a4b127`.

## Verification commands

- `go test ./...` in `services/mes-execution-service`: passed.
- `npm run build --workspace=mes-console`: passed; only the existing Vite
  large-chunk warning remains.
- `npm run rebuild:mes`: completed; MES containers recreated and migration
  `000020_routing_operation_timing_snapshot.up.sql` applied.
- HTTP candidate/readiness, allocation, revalidation, and approval flow:
  passed against the running local containers.
- The latest reset/seed also passed official WO creation, snapshot inspection,
  Compute & Check, all three candidate checks, live WMS stock validation, and
  print-station readiness.

## Changed areas

- MES execution Compute & Check, Work Order creation, resource candidate and
  allocation use cases, resource-planning client, router, and migration.
- MES master-data readiness endpoint for calendar, capacity, worker skill, and
  production-standard checks.
- MES Console Work Order create/detail screens, error mapping, and VI/EN/JA/KO
  help translations.
- Reusable complete Work Order seed and planning-matrix/read-model setup.
- Traceability migration `000004_i18n_read_models_and_templates.up.sql` is now
  applied at startup; this was required for the E2E label template.

## Remaining limitations

- Browser automation was not run in this verification; API runtime, service
  builds, and frontend production build were run.
- Physical printer execution and WMS staging were not claimed by this report;
  they require the independent remote Print Station and live WMS environment.
- The current seed synchronizes the execution read model for the current test
  date. A production deployment should run the normal projection/rebuild path
  for historical and future calendar/shift dates.
