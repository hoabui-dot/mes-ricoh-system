# Implement Centralised UOM Management Across the MOM Platform

## Objective

Audit the current codebase and implement a centralised Unit of Measure management feature.

Replace hard-coded, free-text, inline-created, or incomplete UOM usage with authoritative UOM records, especially in Item and Item Revision management.

The authoritative owner must remain:

```text
mes-master-data-service
Phase 1 — Audit Current UOM Usage

Search the entire repository for:

uom
uom_id
uom_code
base_uom_id
BaseUOM
unit
unit_code
PCS
KG
M2
M
L

Audit backend schemas, APIs, events, projections, seed scripts, and frontend forms in:

mes-master-data-service
mes-execution-service
mes-traceability-service
mes-console
wms-master-data-service
wms-inventory-service
wms-inbound-service
wms-outbound-service
wms-console
qms-inspection-service
qms-console
kiosk applications

Classify every usage as:

AUTHORITATIVE_REFERENCE
LOCAL_PROJECTION
LEGACY_FREE_TEXT
HARD_CODED
MISSING
INCONSISTENT

Do not change cross-service ownership by querying another service database.

Phase 2 — Create UOM Management

Create a dedicated MES Console page:

/master-data/uoms

Support:

list;
search;
filter by type/status;
create;
edit;
activate/inactivate;
detail view;
dependency/usage inspection.

UOM fields:

uom_id
code
localized name VI/EN/JA/KO
type: Count | Length | Area | Weight | Volume | Time
decimal_precision
allow_fraction
status
description

Rules:

UOM code is globally unique and uppercase;
code cannot change after use;
UOM type cannot change after use or release;
integer-only UOMs such as PCS must reject fractional quantities;
used UOMs must be inactivated, not deleted;
internal UUIDs must never be user-facing.

Display localized name as primary identity and code as secondary identity.

Phase 3 — UOM Conversion

Audit whether MD_UOM_CONVERSION is implemented.

If supported by the current schema, add a UOM Conversion tab or page with:

item_id optional
from_uom_id
to_uom_id
factor
rounding_rule
effective_from
effective_to
status

Validation:

factor > 0
from_uom_id != to_uom_id
one active conversion per item/from/to/effective range

Do not invent automatic cross-type conversions.

Phase 4 — Fix Item and Item Revision

Remove inline UOM creation from the Item form.

The Item form must:

load active UOMs from the authoritative UOM API;
use a searchable SelectBase;
show localized UOM name and code;
submit only base_uom_id;
validate UOM compatibility with the Item type;
never accept arbitrary free text.

Item Detail and Revision Detail must show:

Base UOM name
Base UOM code
UOM type
decimal precision
fraction policy

Item Revision must inherit the Item base UOM unless the current domain model explicitly supports a revision-level override.

Do not add a duplicate revision UOM field without an existing business rule.

Phase 5 — Replace UOM Usage Across MES

Update all relevant forms and displays, including:

Items
Item Revisions
MBOM headers
MBOM lines
Production Versions
Production Standards
Work Orders
WO material requirements
operation confirmations
traceability split rules
label/QR payloads
resource-planning quantities

Requirements:

selectors use authoritative UOM records;
APIs pass uom_id as identity;
code/name are display fields or snapshots;
quantity precision follows the selected UOM;
fractional values are blocked when allow_fraction = false;
no UI fabricates PCS, KG, or another fallback.
Phase 6 — Cross-Service Projection

Audit MES, WMS, QMS, and Print Station event contracts.

Where another bounded context needs UOM data, publish or project:

uom_id
uom_code
localized uom_name
uom_type
decimal_precision
allow_fraction

Do not query the MES master-data database directly.

Add or update UOM release/change events and local read models where required.

Legacy rows with only uom_code must remain readable, but new writes must use authoritative UOM identity.

The current context explicitly identifies broad UOM projection/enrichment as incomplete, so this must be addressed without fabricated fallback values.

Phase 7 — Seed and Migration

Create a forward migration and deterministic seed for at least:

PCS — Piece — Count — precision 0 — fraction false
KG  — Kilogram — Weight — precision 3 — fraction true
G   — Gram — Weight — precision 3 — fraction true
M   — Metre — Length — precision 3 — fraction true
M2  — Square metre — Area — precision 4 — fraction true
L   — Litre — Volume — precision 3 — fraction true
MIN — Minute — Time — precision 2 — fraction true

Audit and normalise:

duplicate codes;
blank codes;
inconsistent casing;
Items with invalid base_uom_id;
MBOM lines with missing UOM;
legacy text-only UOM values;
WMS/QMS rows with unknown UOM codes.

Do not silently guess ambiguous mappings.

Write ambiguous records to a migration report.

Update existing reset/seed scripts to reference seeded UOM IDs instead of creating UOMs ad hoc.

Phase 8 — Frontend Validation

Create a shared UOM selector and quantity input behaviour.

The quantity component must:

derive decimal precision from UOM;
reject fractions when not allowed;
display the UOM beside the quantity;
avoid JavaScript floating-point calculations for business quantities;
show clear validation messages.

Apply this consistently across MES, WMS, and QMS where practical.

Verification

Verify:

UOM management page CRUD works.
Duplicate UOM code is rejected.
Used UOM cannot be deleted.
Used UOM type cannot be changed.
Item creation selects an existing UOM.
Item form no longer creates UOM inline.
Item Revision displays the inherited base UOM correctly.
MBOM header and lines use authoritative UOMs.
PCS rejects fractional quantities.
KG accepts configured decimal precision.
WO creation and snapshots preserve UOM identity and display data.
WMS material requests receive correct UOM information.
QMS variable characteristics use valid UOMs.
Legacy rows remain readable without fabricated data.
All builds, tests, migrations, and seed scripts pass.
Required Final Report

Create:

implementation-fix/centralised-uom-management.md

Include:

existing UOM schema and APIs;
previous inline/free-text/hard-coded usages;
UOM page routes and UI evidence;
Item and Item Revision changes;
all updated UOM consumers;
migration and normalisation counts;
seeded UOM records;
cross-service event/projection changes;
unresolved legacy rows;
test and runtime evidence.

Do not report completion while Item creation can still create arbitrary UOMs inline, while any active form uses free-text UOM input, or while downstream services fabricate UOM codes instead of using authoritative data.
