# Phase 2 Production Line to Work Center Report

Date: 2026-08-07

## Objective

Harden the existing Production Line to Work Center topology so ordered membership is validated and maintainable through Master Data APIs without direct database edits.

## Baseline findings

- `md_production_line_work_center` already supported sequence, mandatory marker, effectivity, history, audit fields, foreign keys, and context triggers.
- `GET/PUT /production-lines/:id/work-centers` already existed and PUT used transactional expire-and-replace plus outbox.
- Database triggers already rejected wrong site/area and overlapping Work Center ownership.
- API mutation occurred before complete request validation. Duplicate payload members, duplicate sequence, inactive Work Centers, invalid effectivity, and Released-line removal had no explicit pre-mutation contract.
- GET returned an empty list for a nonexistent Production Line instead of `404`.

## Implementation summary

- Added a pure validation/normalization boundary that runs before expiring current membership.
- Added deterministic sequence ordering and default sequence assignment by submitted order.
- Added explicit duplicate Work Center and duplicate sequence rejection.
- Added Work Center existence, hierarchy, active/lifecycle, and effectivity validation. A Work Center may be shared by multiple lines; Phase 3 Resource Assignment scope is the isolation boundary.
- Added a lifecycle guard: an active `Released` line cannot remove a current Work Center. The line must first return to an approved editable lifecycle or be retired through the existing governance process. Adding the first membership to a newly Released empty line remains compatible with the existing release workflow.
- GET now returns `PRODUCTION_LINE_NOT_FOUND` for an unknown line.
- Preserved transaction, effective-history replacement, trigger protection, and existing outbox event.

## API contract

### List membership

`GET /api/mes/master-data/production-lines/:id/work-centers`

Success `200`:

```json
{
  "data": [
    {
      "line_work_center_id": "uuid",
      "production_line_id": "uuid",
      "work_center_id": "uuid",
      "work_center_code": "WC-L1-BIND",
      "work_center_name": { "vi": "Binding line 1" },
      "sequence_no": 1,
      "mandatory_flag": true,
      "effective_from": "2026-08-07T00:00:00Z",
      "effective_to": null,
      "active_flag": true
    }
  ]
}
```

Unknown line: `404 PRODUCTION_LINE_NOT_FOUND`.

### Replace membership

`PUT /api/mes/master-data/production-lines/:id/work-centers`

```json
{
  "work_centers": [
    {
      "work_center_id": "uuid",
      "sequence_no": 1,
      "mandatory_flag": true,
      "effective_from": "2026-08-07T00:00:00Z",
      "effective_to": null
    }
  ]
}
```

- `work_centers` is required and may be empty only when lifecycle rules allow removal.
- `sequence_no` is a positive unique integer. If omitted, submitted order is used.
- Current rows are expired and submitted rows are inserted in one transaction.
- Response `200` is `{ "data": [new membership rows] }`.
- Event: `MES.MasterData.ProductionLineWorkCenterAssigned.v1` with the new effective membership snapshot.

### Error codes

| HTTP | Code |
| --- | --- |
| 404 | `PRODUCTION_LINE_NOT_FOUND` |
| 404 | `WORK_CENTER_NOT_FOUND` |
| 422 | `PRODUCTION_LINE_WORK_CENTERS_REQUIRED` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_ID_REQUIRED` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_SEQUENCE_INVALID` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_EFFECTIVITY_INVALID` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_EFFECTIVITY_INACTIVE` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_SITE_MISMATCH` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_AREA_MISMATCH` |
| 422 | `PRODUCTION_LINE_WORK_CENTER_INACTIVE` |
| 409 | `PRODUCTION_LINE_WORK_CENTER_DUPLICATE` |
| 409 | `PRODUCTION_LINE_WORK_CENTER_SEQUENCE_DUPLICATE` |
| 409 | `PRODUCTION_LINE_RELEASED_WORK_CENTER_REMOVE_FORBIDDEN` |

## Files changed

- `services/mes-master-data-service/src/infrastructure/http/line-work-center-validation.ts`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-master-data-service/test/unit/line-work-center-validation.test.ts`
- `AI_document/two-line/PHASE_2_LINE_WORKCENTER_REPORT.md`

## Schema/API changes

- No schema migration was required; existing foreign keys, checks, ownership trigger, and audit columns were reused.
- Existing GET/PUT route behavior was hardened additively with explicit validation and errors.

## Tests added or updated

- Valid ordered topology normalization.
- Missing/duplicate Work Center.
- Invalid/duplicate sequence.
- Invalid and expired effectivity.
- Wrong site and wrong area.
- Inactive Work Center.
- Shared Work Center topology remains representable without duplicate membership inside one line.
- Released-line removal guard and Draft-line removal success.

## Commands executed and results

- `npm test -- --run`: PASS, 7 files and 26 tests.
- `npm run build`: PASS.
- `npm run test:mes:two-line-master-data:phase6`: PASS all 9 integration steps, including exact cleanup.

## Remaining risks

- Line release currently may occur before initial Work Center assignment; retained for compatibility. Phase 5 will introduce the authoritative release readiness gate.
- Editing a Released topology requires an explicit governance lifecycle action; the current Console must surface this guard clearly in Phase 4.

## Phase gate

PASS
