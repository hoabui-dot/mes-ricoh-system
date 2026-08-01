# MES UOM Decimal Validation Implementation

Date: 2026-07-30
Status: PARTIALLY_IMPLEMENTED

## Audit result

The Console had duplicated native number inputs in MBOM, Work Order, Production Version, UOM Management, EBOM, Routing, resource capabilities and planning forms. Native `step="any"` and fixed steps were not sufficient for the UOM contract and allowed inconsistent browser behaviour. The backend commonly used `Number()` and integer checks; MBOM did not consistently enforce the UOM decimal precision.

## Implemented

Added `services/mes-console/src/lib/numeric/uomNumeric.ts` with raw-string editing, decimal-place counting, compact display formatting, UOM status/fraction/precision validation and structured error codes. Added `UomNumberInput` for UOM-aware quantities and `DecimalInput` for generic decimal/integer fields. Both use text inputs, decimal input mode, no mouse-wheel mutation, and do not append trailing zeros.

Migrated:

- MBOM header base quantity.
- MBOM component quantity per.
- MBOM scrap rate and substitute conversion factor to generic decimal input.
- Work Order requested quantity.
- Production Version minimum/maximum lot size.
- UOM decimal precision editor as integer-only input.

The production-ready Work Order API now returns base UOM precision and fraction policy. The Work Order editor passes that authoritative metadata into `UomNumberInput` rather than inferring rules from the UOM code.

The MES Master Data service now validates MBOM header and line quantities against `md_uom.decimal_precision` and `allow_fraction` during create, update, validation, replacement and release. Invalid values return stable errors such as `UOM_FRACTION_NOT_ALLOWED`, `UOM_DECIMAL_PRECISION_EXCEEDED`, or `UOM_QUANTITY_MUST_BE_POSITIVE`; no silent rounding is applied.

## Tests and builds

- `src/lib/numeric/uomNumeric.test.ts`: 3 tests passed.
- MES Console `npm run build`: passed.
- MES Master Data Service `npm run build`: passed.

## Remaining audit gaps

The following active MES screens still contain legacy native numeric controls and require follow-up migration: EBOM quantity editing, Routing operation timing/capability forms, Work Center and Resource Foundation timing/capacity forms, Planning Constraints, Print Station allocation, and some Operation Catalog fields. These are not all UOM-aware quantities; each needs classification as time, percentage, integer count, capacity or UOM quantity before migration. Go execution and traceability calculations also require a separate decimal-arithmetic audit; this change does not claim to replace their `float64` domain types.

No historical data was rewritten. A database reconciliation query/report for legacy values exceeding current UOM precision or using contradictory UOM policies remains required before normalizing existing records.

## Initial-render validation correction

`UomNumberInput` no longer executes validation during React render. UOM metadata is loaded asynchronously, so validating before the selected UOM exists produced a false error on the first form render. The component now preserves and formats the edit value but displays only an error explicitly supplied by the submit/error path. Backend validation remains authoritative. MES Console was rebuilt and recreated after this correction.

Default and hydrated MBOM numeric values were also compacted: `1.000000`, `0.0000`, and `100.0000` are now initialized or displayed as `1`, `0`, and `100`. Existing MBOM lines are normalized when opened for editing, and exploded/display quantities use the shared compact formatter.

## MBOM line persistence fix

Runtime audit on 2026-07-30 reproduced PostgreSQL `23502` on `POST /api/mes/master-data/mbom-lines`.
The actual constraint failure was `md_mbom_line.code`; the Console intentionally does not submit a
technical line code. Schema inspection also confirmed `md_mbom_line.name` is required while the
component editor derives its visible name from the selected revision and does not submit a separate
name field.

The generic MBOM line create path now allocates an atomic backend-owned code using the existing daily
resource counter (`MBOM-LINE-YYYYMMDD-NNNN`) and uses that code as a non-null technical fallback name.
Explicit values remain preserved. Unexpected line `NOT NULL` failures are mapped to a structured 422
instead of leaking PostgreSQL 500/23502 to the browser. The replacement/copy paths already preserve
line codes and remain compatible with the required schema.

Verification: `npm run build` passed; `mes-master-data-service` was rebuilt and recreated; a live POST
without `code` or `name` returned HTTP 201 and persisted `MBOM-LINE-20260730-0001`, with no `23502`.
