# MBOM Structure Save and Validation Fix

Date: 2026-07-30
MBOM verified: `5d7501bf-415c-45c2-90f7-18676cafb476`

## Findings

1. **Structure save UUID error**

   The endpoint for replacing the complete structure was declared after the
   generic route `/mbom-headers/:id/lines/:lineId`. Express therefore treated
   the literal segment `replace` as `lineId` and PostgreSQL attempted to parse
   `replace` as a UUID.

2. **False UOM errors**

   Quantity validation counted padding zeroes. A persisted value such as
   `1.000000` was interpreted as six decimal places, even when the selected UOM
   allowed only whole numbers. Validation now trims trailing fractional zeroes
   before applying precision and fraction rules. Meaningful values such as
   `1.25` are still validated normally.

3. **Incorrect Draft-line gate**

   The structure-check endpoint rejected every active line whose lifecycle was
   `Draft`. This is incorrect: editable MBOMs are Draft before release. The
   release transaction is responsible for validating the structure and then
   transitioning active lines to `Released`. Draft lines are therefore no
   longer reported as invalid merely because they are not released yet.

## Changes

- Constrained `:lineId` in update/delete routes to UUID syntax so `replace`
  always reaches the atomic replacement endpoint.
- Canonicalized trailing zeroes in `validateUomQuantity`.
- Removed `MBOM_LINE_NOT_RELEASED` from pre-release structure validation.
- Preserved the real release checks: released component revision, released UOM,
  positive quantity, valid hierarchy, unique sibling sequence, and release
  immutability.

## Verification

- TypeScript build: `mes-master-data-service` passed.
- Runtime rebuild: `mes-master-data-service` is healthy on port `13020`.
- Console rebuild: `mes-console` is running on port `13052`.
- `POST /api/mes/master-data/mbom-headers/5d7501bf-415c-45c2-90f7-18676cafb476/validate`
  returned:

  ```json
  {"valid":true,"errors":[],"warnings":[]}
  ```

- `PUT .../lines/replace` with an intentionally stale structure version
  returned `MBOM_STRUCTURE_VERSION_CONFLICT` rather than a UUID parsing error,
  proving that the correct route is selected and optimistic concurrency remains
  active.

## Rules that remain enforced

- The MBOM header must exist and remain editable (`Draft`/allowed lifecycle).
- Structure replacement requires the current `structure_version`.
- Released MBOMs are immutable.
- Quantities must be positive and must comply with the selected UOM precision
  and fraction policy.
- Component revisions and line UOMs must be released for validation/release.
- Active sibling sequence numbers must be unique.
- Parent lines must belong to the same active MBOM.

The Kafka schema-registration warning visible during service startup is an
existing compatibility warning and is unrelated to this MBOM fix; the service
still starts healthy and the API verification succeeds.
