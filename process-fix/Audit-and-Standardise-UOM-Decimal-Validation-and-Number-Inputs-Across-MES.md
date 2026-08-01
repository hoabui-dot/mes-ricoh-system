# Audit and Standardise UOM Decimal Validation and Number Inputs Across MES

## Objective

Audit the complete MES codebase and standardise how quantities and decimal values are entered, displayed, validated, persisted, calculated, and transferred when they are associated with a Unit of Measure.

The authoritative UOM configuration must control:

```text
decimal_precision
allow_fraction
status
uom_type

The implementation must prevent invalid quantities, inconsistent rounding, silent precision loss, floating-point errors, and confusing UI formatting.

A value entered as an integer must remain visually simple:

1

It must not be displayed as:

1.000000

unless the user actually entered decimal digits or the business context explicitly requires fixed precision.

Use reusable shadcn-style components and centralised validation logic instead of duplicating number-input behaviour across screens.

1. Audit the Current Implementation First

Search the complete MES repository for:

input type="number"
type="number"
parseFloat
parseInt
Number(
toFixed(
toPrecision(
Math.round
step=
min=
max=
quantity
base_quantity
quantity_per
scrap_rate
conversion_factor
max_usage_percent
cycle_time
setup_time
uom_id
uom_code
decimal_precision
allow_fraction

Inspect at least:

services/mes-console
services/mes-master-data-service
services/mes-execution-service
services/mes-traceability-service
services/mes-kiosk-gateway-service
kiosk operator UI
libs/shared-kernel
database schemas and migrations
seed scripts
API contracts
Kafka event contracts
Work Order snapshots
MBOM
Items and Revisions
Production Version
Production Standards
UOM management
UOM conversion
resource planning
traceability split rules
label quantity configuration

Create an audit matrix:

Screen / API / Domain field
Current input/display behaviour
Current validation
Associated UOM source
Risk
Required change
Verification method

Classify each occurrence as:

CORRECT
DUPLICATED_LOGIC
HARDCODED_PRECISION
FLOATING_POINT_RISK
MISSING_UOM_VALIDATION
INCONSISTENT_DISPLAY
LEGACY_FREE_TEXT
BACKEND_ONLY_VALIDATION
FRONTEND_ONLY_VALIDATION

Do not begin by replacing JSX controls blindly. First identify the business meaning of each numeric field.

2. Define the Authoritative UOM Rules

The UOM master record must control quantity behaviour.

Required fields:

uom_id
uom_code
uom_name
uom_type
decimal_precision
allow_fraction
status

Rules:

decimal_precision must be an integer within an explicitly supported range.
If allow_fraction = false, the effective precision for quantity entry is zero.
If allow_fraction = true, the user may enter up to decimal_precision decimal digits.
An inactive or obsolete UOM cannot be selected for new records.
Existing historical records using inactive UOMs must remain readable.
Quantity validation must use the UOM identity, not a hard-coded list such as PCS, KG, or M2.
UOM code must not be used as the sole source of validation when uom_id is available.
Backend validation is authoritative; frontend validation improves usability but cannot replace it.

Clarify and document whether decimal_precision = 0 automatically implies allow_fraction = false.

Prefer enforcing one consistent invariant rather than supporting contradictory values such as:

allow_fraction = false
decimal_precision = 6

If legacy data contains contradictory values, create a reconciliation report instead of silently changing business data.

3. Create Shared Numeric Domain Utilities

Move all reusable numeric and UOM logic into shared utilities.

Recommended location:

services/mes-console/src/lib/numeric/

or an existing common/shared UI library if appropriate.

Create utilities such as:

normaliseNumericInput
validateQuantityAgainstUom
countDecimalPlaces
formatQuantityForDisplay
formatQuantityForEditing
parseDecimalSafely
getUomInputConstraints
roundToUomPrecision
isIntegerValue

Required behaviour:

Parsing
Preserve the user's raw text during editing.
Accept intermediate states such as:
empty string;
- only when negative values are allowed;
1.;
0.;
Do not immediately coerce every keystroke through Number(...).
Reject invalid characters.
Avoid locale-dependent ambiguity unless locale-aware input is explicitly implemented.
Do not use binary floating-point as the authoritative business representation.
Validation

Return structured errors:

type NumericValidationError =
  | "REQUIRED"
  | "INVALID_NUMBER"
  | "NEGATIVE_NOT_ALLOWED"
  | "ZERO_NOT_ALLOWED"
  | "FRACTION_NOT_ALLOWED"
  | "DECIMAL_PRECISION_EXCEEDED"
  | "BELOW_MINIMUM"
  | "ABOVE_MAXIMUM"
  | "UOM_REQUIRED"
  | "UOM_INACTIVE";
Formatting

Display integer values without trailing zeros:

1
10
250

Display meaningful decimals without unnecessary padding:

1.5
2.25
0.125

Do not render:

1.000000
2.500000

unless a specific report or regulatory document explicitly requires fixed precision.

The display formatter must remove insignificant trailing zeros while preserving valid precision.

Examples:

database value 1.000000  -> display 1
database value 1.500000  -> display 1.5
database value 1.250000  -> display 1.25
database value 0.000000  -> display 0

Editing and display formatting must be separate concerns.

4. Create a Reusable shadcn Numeric Input Component

Create a shared component using the existing shadcn-style primitives.

Suggested name:

UomNumberInput

or:

QuantityInput

Base it on the shared shadcn Input, Label, Form, Tooltip, and error-message primitives already used in MES Console.

Suggested API:

type UomNumberInputProps = {
  value: string;
  onValueChange: (rawValue: string) => void;
  uom?: {
    id: string;
    code: string;
    name?: string;
    decimalPrecision: number;
    allowFraction: boolean;
    status: string;
  };
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  min?: string;
  max?: string;
  allowNegative?: boolean;
  allowZero?: boolean;
  showUom?: boolean;
  error?: string;
  onBlur?: () => void;
};

Required component behaviour:

Use inputMode="decimal" where appropriate.
Do not depend only on native step, because native browser number behaviour is inconsistent and insufficient for business validation.
Prefer a controlled text input with explicit numeric parsing and validation.
Display the UOM code/name beside the input.
Show allowed precision in field-specific help.
Prevent or report excess decimal digits.
Reject fractional values when allow_fraction = false.
Preserve user input when backend submission fails.
Do not transform 1 into 1.000000 after blur.
Do not remove a meaningful decimal while the user is still editing.
Support read-only display through the same formatter.
Integrate with the current form library and shadcn FormMessage pattern.
Be accessible by keyboard and screen reader.
Avoid mouse-wheel accidental quantity changes.

Do not create separate duplicated components for MBOM, Work Order, Item, and Production Standard unless their business semantics differ.

5. Separate Generic Decimal Inputs from UOM Quantity Inputs

Not every number belongs to a UOM.

Create a clear distinction:

UOM-aware quantities

Examples:

Item base quantity
MBOM base quantity
MBOM line quantity per
Work Order requested quantity
material requirement quantity
confirmed good/scrap quantity
traceability split quantity
inventory quantity
label units-per-label, when tied to item quantity

These must use UomNumberInput.

Non-UOM decimal or percentage values

Examples:

scrap rate
efficiency factor
conversion factor
maximum usage percent
speed factor
yield

These should use a shared generic component such as:

DecimalInput
PercentageInput

They must still reuse the same lower-level parsing and formatting utilities.

Do not incorrectly apply UOM fraction rules to percentage or time fields.

6. Fix the UOM Management Page

Audit and improve the UOM management page.

Required validation:

code is globally unique
code is uppercase and trimmed
decimal_precision is a non-negative integer
decimal_precision is within the supported maximum
allow_fraction and decimal_precision are logically consistent
used UOM type cannot be changed
used UOM cannot be deleted
inactive UOM cannot be selected for new business records

UX requirements:

Use a proper integer input for decimal_precision.
Do not display 6.000000; display 6.
Explain allow_fraction clearly.
Explain decimal_precision clearly.
Show a live example:
Fractions allowed: Yes
Maximum decimal digits: 3
Examples: 1, 1.5, 1.125
Invalid: 1.1254

For integer-only UOM:

Fractions allowed: No
Valid examples: 1, 25, 100
Invalid examples: 1.5, 2.25

If the user disables fractions, automatically set or require precision zero according to the final domain rule.

Do not silently update a UOM already used by Released master data without backend dependency validation.

7. Apply the Common Component Across MES Console

Replace duplicated numeric controls in all relevant screens.

At minimum audit and update:

Item and Revision
Item base UOM selection.
Any quantity or conversion fields associated with Item.
Display UOM using authoritative metadata.
MBOM
Header base quantity.
Line quantity per.
Scrap rate through PercentageInput.
Substitute conversion factor.
Maximum usage percent.
UOM conversion compatibility.
Production Version
Minimum lot size.
Maximum lot size.
Any quantity constraints using output UOM.
Production Standards
Base quantity.
Setup time.
Cycle time.
Yield.
Efficiency factor.
Labour count where integer-only.
Work Orders
Requested quantity.
Good quantity.
Scrap quantity.
Partial completion quantity.
Material requirement display.
Quantity snapshot display.
Traceability
Parent quantity.
Child quantity.
Split quantity.
Remainder quantity.
Tolerance values.
Resource Planning
Capacity quantities where UOM-aware.
Integer headcount inputs.
Time values using an appropriate dedicated time/decimal component.
Print and Label Configuration
Units per label.
Copies.
Label quantity where connected to item UOM.
Copies must remain integer-only.

For every screen, use business-appropriate components rather than replacing all numbers with one generic input.

8. Strengthen Backend Validation

Frontend validation is not sufficient.

Create or centralise backend validation in mes-master-data-service, mes-execution-service, and other owning services.

For every UOM-aware quantity:

Load or project the authoritative UOM.
Confirm UOM status is valid for new writes.
Confirm quantity is a valid decimal.
Confirm sign and zero constraints.
Confirm fraction policy.
Confirm decimal precision.
Apply approved rounding only when the business rule explicitly allows rounding.
Otherwise reject the request.

Return stable domain errors:

UOM_NOT_FOUND
UOM_NOT_ACTIVE
UOM_FRACTION_NOT_ALLOWED
UOM_DECIMAL_PRECISION_EXCEEDED
UOM_QUANTITY_REQUIRED
UOM_QUANTITY_MUST_BE_POSITIVE
UOM_MISMATCH
UOM_CONVERSION_NOT_FOUND

Error responses should contain:

{
  "code": "UOM_DECIMAL_PRECISION_EXCEEDED",
  "field": "quantity_per",
  "uom_code": "KG",
  "allowed_precision": 3,
  "received_value": "1.1234"
}

Do not silently round invalid user input during create/update unless the product document explicitly defines automatic rounding.

9. Use Decimal-Safe Arithmetic

Audit all quantity calculations.

Do not use binary floating-point for authoritative calculations such as:

WO quantity scaling
MBOM explosion
scrap calculation
UOM conversion
material aggregation
traceability split
inventory movement
label quantity calculation

Use the existing database numeric/decimal types and a decimal-safe library or string/integer-scaled arithmetic appropriate to each service language.

For TypeScript services, use the repository-approved decimal library or introduce one consistently.

For Go services, use a decimal implementation or fixed-scale arithmetic rather than float64 for persisted manufacturing quantities.

Document:

input scale
calculation scale
rounding mode
output scale
UOM precision application point

Do not round at every intermediate step unless the business rule requires it.

10. Database Review and Migration

Audit database columns associated with quantities.

Verify:

numeric precision and scale are sufficient;
integer-only business fields are not stored as arbitrary decimal when avoidable;
no migration converted quantity values through floating-point;
UOM references are valid;
historical values exceeding current UOM precision are identified.

Create a forward migration only where necessary.

Generate a reconciliation report for:

records with fractional values under allow_fraction = false
records exceeding UOM decimal_precision
records with missing UOM
records with inactive UOM used in active Draft data
records with formatted text values instead of numeric values
contradictory allow_fraction/decimal_precision UOM records

Do not silently modify historical Work Order snapshots or inventory transactions.

Classify invalid existing data as:

SAFE_TO_NORMALISE
REQUIRES_BUSINESS_REVIEW
HISTORICAL_READ_ONLY
BLOCKS_RELEASE
11. API, Event, and Projection Consistency

Audit payloads across:

MES master data
MES execution
WMS
QMS
Traceability
Print Station
Kafka events
local projections

For UOM-aware values, contracts should preserve:

quantity as a decimal-safe string or schema decimal representation
uom_id
uom_code
decimal_precision when needed for downstream display
allow_fraction when needed for downstream validation

Do not serialise authoritative quantities as imprecise JavaScript numbers when precision can be lost.

Do not allow downstream services to invent UOM precision from the code.

Update event schemas and compatibility tests where necessary.

12. Display Formatting Rules

Create one repository-wide display rule:

Editable fields
Preserve raw user input.
Do not append trailing zeros.
Show validation only after appropriate interaction.
Do not replace an empty input with zero automatically.
Read-only business quantities

Use compact formatting:

1
1.5
1.25
1000.125

Respect locale grouping where the existing console formatting standard supports it, but do not introduce ambiguous decimal separators in API payloads.

Fixed precision exceptions

Fixed trailing zeros may only appear in explicitly defined contexts such as:

regulated reports
export files
technical measurement reports
printer payload contracts

These exceptions must use a separate formatter and must not affect normal form inputs.

13. Required Automated Tests

Add tests for the shared utilities and components.

UOM Rules
integer-only UOM accepts 1;
integer-only UOM rejects 1.1;
precision 3 accepts 1.125;
precision 3 rejects 1.1254;
inactive UOM rejected for new writes;
zero and negative rules enforced;
whitespace normalisation;
very large values;
leading zeros;
empty values;
intermediate 1. editing state.
Formatting
1.000000 -> 1
1.500000 -> 1.5
1.250000 -> 1.25
0.000000 -> 0
1000.010000 -> 1000.01
Component
value remains 1 after blur;
backend error preserves raw input;
changing UOM revalidates current value;
switching from KG precision 3 to PCS rejects an existing fraction;
disabled/read-only states;
accessible label and error association;
mouse wheel does not change value unexpectedly.
Backend
direct API request bypassing UI is rejected;
decimal precision is enforced;
fractional prohibition is enforced;
invalid UOM is rejected;
no silent rounding;
correct stable error codes.
Calculations
MBOM scale;
scrap calculation;
UOM conversion;
material aggregation;
traceability split;
no floating-point artefacts.
14. Required Browser Verification

Run at least these scenarios in MES Console.

Scenario A — Integer UOM

Select PCS with:

allow_fraction = false
decimal_precision = 0

Enter:

1

Expected:

input displays 1;
after blur it remains 1;
after save and refresh it remains 1;
API/database may store a numeric scale internally, but UI must not show 1.000000.

Enter:

1.5

Expected:

field-level validation;
save blocked;
backend also rejects a direct request.
Scenario B — Decimal UOM

Select KG with precision 3.

Enter:

1.125

Expected: accepted.

Enter:

1.1254

Expected: rejected with allowed precision shown.

Scenario C — Change UOM

Enter:

1.5 KG

Then change UOM to PCS.

Expected:

existing value becomes invalid;
user is prompted to correct it;
value is not silently rounded to 2 or truncated to 1.
Scenario D — MBOM

Create a line:

A × 1 PCS
B × 1.25 KG

Expected:

display 1 PCS;
display 1.25 KG;
no unnecessary trailing zeros;
validation follows each UOM independently.
Scenario E — Work Order

Create a WO quantity:

100 PCS

Expected:

display 100, not 100.000000;
material explosion still uses exact decimal-safe values.
Scenario F — Backend bypass

Send an invalid API payload directly:

{
  "quantity_per": "1.5",
  "uom_id": "<PCS_ID>"
}

Expected:

UOM_FRACTION_NOT_ALLOWED

Capture screenshots, requests, responses, and persisted values.

15. Documentation and Evidence

Create:

process-fix/Standardise-MES-UOM-Decimal-Validation.md
implementation-fix/Standardise-MES-UOM-Decimal-Validation-Implementation.md

Update:

AI_CONTEXT.md
UOM product documentation
Item and MBOM documentation
Work Order quantity documentation
shared UI component documentation
API/event contracts

The implementation report must include:

audit results
shared component design
shared utility design
screens migrated
backend validators
database findings
data reconciliation
decimal arithmetic decisions
API/event changes
automated tests
browser evidence
remaining exceptions

Do not claim repository-wide completion if any active MES screen still uses duplicated uncontrolled numeric input logic for a UOM-aware quantity.

Required Execution Order

Follow this order:

1. Audit all numeric and UOM usages.
2. Define authoritative UOM invariants.
3. Audit existing data for invalid precision/fractions.
4. Create shared decimal utilities.
5. Create shadcn UomNumberInput and related common components.
6. Add backend shared validation.
7. Migrate UOM management page.
8. Migrate Item and Revision flows.
9. Migrate MBOM and Production Version.
10. Migrate Work Order and execution quantity flows.
11. Migrate traceability and remaining MES screens.
12. Audit API/event decimal representations.
13. Add automated tests.
14. Run browser scenarios.
15. Rebuild and recreate affected services.
16. Update product documentation.
17. Update AI_CONTEXT.md.
18. Write implementation and reconciliation reports.
Completion Criteria

Do not report completion unless:

UOM fraction and precision rules are enforced in both frontend and backend.
Integer-only UOM values reject fractions.
Decimal UOMs reject excess precision.
Integer values render as 1, not 1.000000.
Meaningful decimals render without insignificant trailing zeros.
A common shadcn-based numeric input is used across all active UOM-aware MES forms.
Generic decimal and percentage inputs also reuse central numeric utilities.
Changing UOM revalidates the current value.
Backend API bypass tests fail correctly.
Authoritative calculations use decimal-safe arithmetic.
Invalid legacy data is reported and not silently rewritten.
API/events preserve quantity precision safely.
Browser scenarios pass for UOM management, Item, MBOM, Production Version, and Work Order.
Product documentation and AI_CONTEXT.md match the running implementation.

Keep the final status as PARTIALLY_IMPLEMENTED if any active UOM-aware screen still uses uncontrolled number input logic, hard-coded precision, or binary floating-point for authoritative manufacturing quantities.