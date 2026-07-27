# Make Production Version the Authoritative Work Order Selection

## Background

The current Work Order creation form is misleading.

It currently presents the primary selector as:

```text
Product to Manufacture
Select a production-ready product revision

However, a Work Order should not be created by selecting an Item Revision as the authoritative production configuration.

The correct domain model is:

Production Version
├── Item Revision
├── Released MBOM
├── Released Routing
├── validity
├── lot-size constraints
└── execution context

Therefore, the user must select a Production Version.

The backend must then derive and validate the Item Revision, MBOM, Routing, Site/execution context, and related values from that selected Production Version.

The Item Revision remains part of the Work Order snapshot, but it must not be selected independently or used to guess a Production Version.

Objective

Update the complete Work Order creation flow so that:

Production Version is the authoritative user selection.
Item Revision, MBOM, Routing, Site, UOM, and related execution context are derived by the backend.
Production Version has a translated display name for VI, EN, JA, and KO.
Existing Production Version records are safely backfilled.
MES Console clearly explains the meaning of the selected Production Version.
Existing Work Orders remain historically correct.
The existing MES-to-remote-Print-Station physical-print verification flow remains functional.
A Vietnamese step-by-step operator document is added to the repository for rerunning the successful WO-to-printer flow from MES Console.

Do not implement only a label change.

Audit and update the database, migrations, backend contracts, frontend selectors, readiness APIs, tests, documentation, seeds, and runtime verification.

Phase 1 — Audit the Current Implementation

Inspect the real codebase before modifying anything.

Review at minimum:

md_production_version
Production Version Drizzle schema
Production Version migrations
Production Version create/update/list/detail APIs
Production Version release validation
Production-ready selector endpoint
Work Order creation workflow
MES Execution read models
WO creation request DTO
WO creation service
WO header snapshot fields
MES Console Work Order create form
Production Version create/edit form
Production Version list/detail screens
seed data
i18n translations
tests
AI_CONTEXT.md
implementation reports

Determine:

whether Production Version already has a localized name field;
whether the UI currently identifies candidates by Item Revision;
whether the backend accepts independently supplied Item Revision, MBOM, Routing, and Site IDs;
whether selected production_version_id is authoritative;
whether any code still selects the first Production Version found for an Item Revision;
whether Work Order creation can persist mismatched IDs;
how existing Production Version records can be named deterministically;
whether current released events include the localized Production Version name.

Search for:

production-ready-item-revisions
product to manufacture
select a production-ready product revision
production_version_id
productionVersionId
item_revision_id
mbom_id
routing_id
site_id
Phase 2 — Confirm the Target Domain Contract

Use this model as authoritative:

User selects Production Version
→ backend loads the Production Version
→ backend derives Item Revision
→ backend derives MBOM
→ backend derives Routing
→ backend derives Site/execution context
→ backend validates lifecycle, validity, and lot size
→ backend snapshots the resolved configuration into the Work Order

The Work Order may retain:

production_version_id
item_revision_id
mbom_id
routing_id
site_id
uom_id

However:

production_version_id

is the authoritative selection.

The other fields are derived snapshot fields.

The client must not be allowed to create an arbitrary combination.

Phase 3 — Add a Localized Production Version Name

Add a localized name field to Production Version.

Use the repository’s existing LocalizedText convention.

Preferred field:

name_i18n JSONB NOT NULL

or the exact naming convention already used in the codebase.

Expected shape:

{
  "vi": "Phiên bản sản xuất cao su chân máy tiêu chuẩn",
  "en": "Standard Engine Mount Production Version",
  "ja": "標準エンジンマウント生産バージョン",
  "ko": "표준 엔진 마운트 생산 버전"
}

Do not store four unrelated columns if the platform already standardises on JSONB LocalizedText.

Update:

database schema;
Drizzle schema;
TypeScript types;
request DTOs;
response DTOs;
validation;
create form;
edit form;
list view;
detail view;
release event;
execution read model where needed;
seeds;
translations.
Validation

Require:

Vietnamese and English names;
Japanese and Korean according to current platform fallback policy;
trimmed non-empty values;
valid LocalizedText shape.

Do not use the Production Version code as the only user-facing identity.

Phase 4 — Migration and Legacy Backfill

Create a new migration using the next actual migration number.

The migration must:

add the localized Production Version name field;
keep it nullable temporarily if required for safe backfill;
backfill every existing row;
validate no null/invalid values remain;
set the field to non-null;
add any required indexes;
preserve IDs, lifecycle, validity, and historical references.

Generate deterministic names using available business data.

Recommended fallback pattern:

VI:
Phiên bản sản xuất {product/item code} - {production version code}

EN:
Production Version {production version code} for {product/item code}

JA:
{product/item code} 生産バージョン {production version code}

KO:
{product/item code} 생산 버전 {production version code}

Where richer names are available, include MBOM or Routing context only when the result remains readable.

Example:

PV-FG-CM01-01
Product: FG-WS-CM01-R1
Routing: RT-CM01-V3

could become:

VI:
Phiên bản sản xuất tiêu chuẩn FG-WS-CM01-R1

EN:
Standard Production Version for FG-WS-CM01-R1

Do not create empty locale values.

Do not overwrite existing manually authored names if a name field already exists.

Backfill report

The migration or companion script must report:

rows scanned
rows already named
rows backfilled
rows skipped
rows failed

If SQL alone cannot safely resolve localized item names, add an idempotent repository script such as:

scripts/backfill-production-version-localized-names.mjs

The migration and script must be safe to rerun according to project conventions.

Phase 5 — Update Production Version CRUD

Update Production Version create and edit forms to include:

Production Version Code
Production Version Name
Item Revision
Released MBOM
Released Routing
validity
lot-size range
default flag
lifecycle

The name must use the shared VI/EN/JA/KO localized input component.

The list must display:

Localized Production Version Name
Production Version Code
Item Revision
MBOM
Routing
Lifecycle
Validity
Lot-size range

The name should be the primary identity.

The code should be secondary context.

Phase 6 — Replace the Work Order Selector

Replace the current field:

Product to Manufacture
Select a production-ready product revision

with:

Production Version
Select a released production configuration

Add translations for VI, EN, JA, and KO.

Recommended Vietnamese:

Phiên bản sản xuất
Chọn một cấu hình sản xuất đã phát hành

Recommended English:

Production Version
Select a released production configuration

The selector must return one option per eligible Production Version.

Each option should display:

Production Version localized name
Production Version code
Item Revision code/name
MBOM code/version
Routing code/version
validity
lot-size compatibility

Example:

Standard Engine Mount Production Version
PV-FG-CM01-01

Product: FG-WS-CM01-R1
MBOM: MBOM-CM01-V2
Routing: RT-CM01-V3
Lot size: 1–1,000 PCS

The selector may be searchable by:

Production Version name
Production Version code
Item code
Item Revision code
MBOM code
Routing code

But the selected value must be:

production_version_id
Phase 7 — Update the Readiness Summary

After selecting a Production Version, display a read-only summary:

Production Version
Item Revision
MBOM
Routing
Site / Factory context
Base UOM
Validity
Lot-size range
Lifecycle readiness

The summary must make clear that these values are derived from the selected Production Version.

Do not show “Select a product” placeholders after a Production Version has been selected.

Use localized names as primary labels and codes as secondary values.

Phase 8 — Simplify and Harden the WO Creation Request

Preferred request contract:

{
  "production_version_id": "uuid",
  "quantity": 500,
  "target_completion_date": "2026-08-01T00:00:00Z"
}

Include other genuinely user-authored fields only when required.

The backend must:

load the selected Production Version;
verify it exists;
verify it is Released;
verify it is effective for the target date;
verify quantity fits the lot-size range;
resolve Item Revision;
resolve MBOM;
resolve Routing;
resolve Site/execution context;
resolve UOM;
validate all required components;
snapshot the complete configuration;
create the WO transactionally.

Do not trust client-supplied:

item_revision_id
mbom_id
routing_id
site_id

as authoritative.

Backward compatibility

If legacy clients still submit derived IDs:

compare them against the selected Production Version;
reject mismatches with a stable error;
ignore matching redundant values after validation.

Suggested error:

WORK_ORDER_PRODUCTION_VERSION_CONTEXT_MISMATCH

Response details should identify the mismatched field.

Phase 9 — Update Production-Ready Candidate API

Replace or refactor:

production-ready-item-revisions

because the name incorrectly suggests Item Revision is the selected entity.

Preferred endpoint:

GET /api/mes/master-data/production-ready-versions

or:

GET /api/mes/master-data/production-version-candidates

Follow existing API naming conventions.

The response must be Production Version-centred:

{
  "productionVersionId": "...",
  "productionVersionCode": "PV-FG-CM01-01",
  "productionVersionName": {
    "vi": "...",
    "en": "...",
    "ja": "...",
    "ko": "..."
  },
  "itemRevision": {
    "id": "...",
    "code": "FG-WS-CM01-R1",
    "name": {}
  },
  "mbom": {
    "id": "...",
    "code": "MBOM-CM01-V2"
  },
  "routing": {
    "id": "...",
    "code": "RT-CM01-V3"
  },
  "site": {
    "id": "...",
    "code": "SITE-01"
  },
  "baseUom": {
    "id": "...",
    "code": "PCS"
  },
  "minLotSize": 1,
  "maxLotSize": 1000,
  "validFrom": "...",
  "validTo": null,
  "ready": true,
  "warnings": []
}

Keep a temporary compatibility alias only if necessary.

Mark the old endpoint as deprecated and remove it after all consumers migrate.

Phase 10 — Work Order Snapshot Integrity

At WO creation, persist:

production_version_id
production_version_code
production_version_name_i18n
item_revision_id
item_revision_code
item_revision_name_i18n
mbom_id
mbom_code
routing_id
routing_code
site_id
uom_id
planning snapshot

Use the actual existing snapshot conventions.

Master-data changes after WO creation must not silently change the WO.

Production Version rename after WO creation should not rewrite the historical WO display value unless the product explicitly chooses live-reference display.

Prefer immutable snapshot identity for approved and completed Work Orders.

Phase 11 — Update Events and Read Models

Review and update:

MES.MasterData.ProductionVersionReleased
MES.Execution.WOCreated
MES.Execution.WOApproved

Include Production Version localized name where it is useful for read models and UI.

Ensure execution consumers can accept the new additive field.

Do not break schema compatibility.

Use a new event version only if the current compatibility rules require it.

Phase 12 — Frontend Validation

The Create WO button must remain disabled until:

Production Version selected
quantity valid
target date valid
Production Version ready
quantity inside lot-size range

Changing Production Version must atomically replace the entire derived readiness summary.

Do not retain stale Item Revision, MBOM, Routing, Site, or UOM from the previous selection.

The UI must not independently request and combine unrelated master-data entities.

Phase 13 — Automated Tests

Add or update tests for:

Production Version name
create with LocalizedText;
update LocalizedText;
list and detail return localized name;
required locales validate;
migration backfills existing rows.
Candidate API
returns one row per eligible Production Version;
returns localized Production Version name;
includes derived Item Revision, MBOM, Routing, Site, and UOM;
filters lifecycle, validity, and lot size correctly.
Work Order creation
creates WO from Production Version ID;
derives all related IDs;
ignores matching redundant legacy IDs;
rejects mismatched legacy IDs;
does not guess a Production Version from Item Revision;
supports multiple Production Versions for one Item Revision;
snapshots the exact selected Production Version.
Frontend
selector label is Production Version;
options show localized name and configuration context;
selected value is Production Version ID;
readiness summary updates correctly;
stale derived state is cleared;
search works by PV, item, MBOM, and Routing code.
Regression
existing Work Orders remain readable;
current WO physical-print flow still works;
selected Production Version reaches MES Execution correctly.
Phase 14 — Runtime Verification

Perform live verification.

Apply migration.
Run the backfill.
Confirm all Production Versions have valid localized names.
Open Production Version list.
Confirm names render in VI/EN/JA/KO.
Open Create Work Order.
Confirm the selector label is Production Version.
Confirm each option shows the Production Version name and configuration.
Select a Production Version.
Confirm Item Revision, MBOM, Routing, Site, UOM, validity, and lot size are derived.
Create the WO.
Read the WO from the API.
Confirm it references the exact selected Production Version.
Confirm derived IDs match that Production Version.
Run Compute & Check.
Approve in the intended demo or strict mode.
Run the existing remote physical-printer verification flow.
Confirm the correct Routing and print operation were snapshotted.
Confirm the physical print command and result correlate to the WO.
Confirm no regression in print-job completion.
Phase 15 — Add a Vietnamese Step-by-Step Runbook

Create this repository document:

docs/vi/huong-dan-kiem-thu-wo-den-tram-in-vat-ly.md

or use the current documentation folder convention.

The document must be written in Vietnamese and explain how an engineer or operator can rerun the complete MES Console to remote physical-printer flow.

It must not be a high-level architecture-only document.

Include exact steps, expected statuses, commands, screens, and failure diagnostics.

Required sections
1. Mục tiêu

Explain the flow:

MES Console
→ chọn Production Version
→ tạo WO
→ Compute & Check
→ phê duyệt
→ bắt đầu thực thi
→ hoàn thành công đoạn trước
→ MES gửi Kafka print command
→ remote MacOS Printer Adapter
→ CUPS
→ Zebra
→ printer result
→ MES hoàn thành công đoạn in
2. Kiến trúc và địa chỉ

Document current roles:

MES host
Kafka host/Tailscale listener
MacOS Adapter Tailscale URL
MacOS CUPS LAN address
printer queue

Do not hard-code secrets.

Mark values that may change.

3. Điều kiện trước khi chạy

Checklist:

MES services healthy
Kafka reachable
remote Adapter Healthy
Kafka Connected
CUPS Connected
printer Online
printer active for work
MES readiness ready=true
Production Version Released
MBOM Released
Routing Released
Print Station binding active
4. Tạo WO trên MES Console

Step by step:

Open Work Orders.
Choose Create Work Order.
Select Production Version.
Verify the derived Item Revision, MBOM, and Routing.
Enter quantity.
Enter target completion date.
Create WO and check readiness.

Explain expected UI text and statuses.

5. Compute & Check

Explain:

where to click;
expected success;
possible planning warnings;
which errors block progress.
6. Demo bypass or strict allocation

Explain both modes.

For demo mode:

MES_DEMO_BYPASS_RESOURCE_ALLOCATION=true

Include:

how to change the real running Compose environment;
recreate the execution service;
verify the value inside the container;
required bypass reason;
restore it to false after the test.

For strict mode, explain shift and committed allocation requirements.

7. Phê duyệt và bắt đầu thực thi

Explain:

approve WO;
expected Released;
call/use Start Execution;
expected InProgress.
8. Kiosk demo

Explain:

port 13051;
which WO lifecycle states appear;
how to start and confirm predecessor operations;
Draft WO must not be executed.
9. Công đoạn in

Explain expected states:

print job Pending
DispatchQueued
Dispatched
Printing
Completed

Explain that MES uses Kafka, not direct HTTP printing.

10. Xác nhận bản in vật lý

Explain how to verify:

selected printer
CUPS job ID
physical label output
template
printed quantity
11. Xác nhận kết quả quay về MES

Explain:

printer.printed
mes-execution-printer-results
wo_print_job Completed
WO operation Finished
successor dispatched
12. Chạy script tự động

Include the real command shape:

TEST_MODE=demo-bypass \
MES_BASE_URL=... \
MASTER_DATA_BASE_URL=... \
KIOSK_GATEWAY_BASE_URL=... \
KAFKA_BOOTSTRAP_SERVERS=... \
PRINTER_ADAPTER_BASE_URL=... \
PRINT_STATION_CODE=PRINT-STATION-01 \
EXPECTED_PRINTER_CODE=Zebra-GK420t-CUPS \
BYPASS_REASON="Controlled physical print test" \
npm run verify:mes:wo-physical-print

Explain every variable.

Do not leave unknown placeholders without instructions for resolving them.

13. Đọc artifact

Explain:

summary.json
timeline.md
network-report.md
failure-report.md
Kafka evidence
database checks
logs
14. Bảng xử lý lỗi

Include at minimum:

WO_OPERATION_ALLOCATION_MISSING
PRINT_STATION_RUNTIME_NOT_READY
Kafka advertised listener error
Adapter cannot consume command
CUPS connection failure
CUPS authorisation failure
printer queue paused
template missing
result correlation failure
WO operation not completed

For each error provide:

meaning
where to check
expected evidence
recommended fix
15. Hoàn tất và phục hồi cấu hình

Explain how to:

restore demo bypass to false;
retain artifacts;
avoid restarting a local Adapter on MES host;
confirm remote Adapter remains authoritative.
Phase 16 — Documentation Updates

Update:

AI_CONTEXT.md
MES Master Data README
MES Execution README
MES Console README
Production Version documentation
Work Order lifecycle documentation
physical-print E2E implementation report
process workload tracking

Replace misleading statements such as:

Select Item Revision to create WO

with:

Select Production Version; Item Revision, MBOM, and Routing are derived.

Mark older conflicting reports as superseded.

Acceptance Criteria

The task is complete only when:

Production Version has a localized name.
Existing rows are backfilled safely.
Production Version create/edit supports VI/EN/JA/KO names.
WO creation UI selects Production Version.
The old Item Revision-centred label is removed.
Production Version name is the primary option identity.
Item Revision, MBOM, Routing, Site, and UOM are derived.
Backend does not guess Production Version from Item Revision.
Backend rejects mismatched client context.
WO snapshots the selected Production Version and derived configuration.
Multiple Production Versions for one Item Revision are selectable distinctly.
Existing Work Orders remain correct.
Events and read models remain compatible.
Automated tests pass.
Migrations pass.
Live browser/API verification passes.
Remote physical-print E2E still works.
The Vietnamese runbook exists and is executable step by step.
All conflicting documentation is updated.
Required Final Report

Provide:

Domain correction

Explain the final authoritative selection model.

Database

List:

migration
new localized name field
backfill rules
row counts
constraints
API

List:

new/updated candidate endpoint
WO request changes
compatibility handling
response fields
UI

Report:

new labels
selector option format
readiness summary
localized Production Version display
Work Order evidence

Provide:

selected Production Version ID/code/name
derived Item Revision
derived MBOM
derived Routing
created WO ID/code
snapshot validation
Physical-print regression

Provide:

print job ID
command event ID
printer
result event ID
WO operation status
Vietnamese runbook

Provide the exact repository path and confirm every required section is included.

Do not report completion while the Work Order form still presents Item Revision as the authoritative selection or while Production Version has no meaningful localized display name.