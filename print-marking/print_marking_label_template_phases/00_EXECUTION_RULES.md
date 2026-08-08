# Mandatory Execution Rules — Label Template & Icon Printing

## 1. Mission

Implement the complete Label Template and Icon Printing capability for the Print-Marking Edge Station. The final feature must include versioned templates, dynamic variables, native ZPL, barcodes, QR codes, icons, printer asset caching, Vietnamese text, preview, test print, approval, production integration, seed data, automated tests, Docker verification, and an implementation report.

These rules are mandatory for every phase.

## 2. Continuous execution

Execute all phases in order. After a phase passes its acceptance gate, continue immediately to the next phase.

Do not stop because one phase, build, test suite, preview, seed command, or initial print simulation succeeds.

Stop only when genuinely stuck. A genuine blocker must:

1. Prevent safe continuation.
2. Remain unresolved after repository, configuration, log, migration, contract, and test inspection.
3. Have no safe adapter, mock, fallback, compatibility layer, or feature-flag solution.
4. Create material risk of data loss, insecure code, corrupt architecture, or uncontrolled duplicate printing.
5. Have exact evidence.

## 3. Mandatory implementation loop

Use this loop continuously:

```text
Inspect
→ Implement the smallest safe increment
→ Build
→ Run targeted tests
→ Seed deterministic data
→ Execute the feature
→ Inspect SQLite, generated ZPL, assets, Kafka, logs, API, SignalR, and UI
→ Fix defects
→ Add regression tests
→ Re-run affected suites
→ Continue
```

Do not batch large unverified changes.

## 4. Repository-first behavior

Before each phase:

- Resolve actual project and service paths.
- Inspect framework and dependency versions.
- Inspect existing printer, template, image, barcode, Outbox, Inbox, Kafka, SignalR, SQLite, RBAC, Docker, seed, and test implementations.
- Reuse valid repository conventions.
- Do not invent duplicate infrastructure.
- Preserve backward compatibility or add an explicit migration/adapter.

## 5. Service ownership

The Printer Adapter owns:

- `printer.db`
- Printer profiles and capabilities
- Label templates and versions
- Assets and DPI variants
- ZPL compilation
- Printer asset synchronization
- Print execution and render snapshots
- Printer transport

The Job Engine owns workflow sequencing and print-step policy. It must not build ZPL or query `printer.db`.

Projection Service owns Kiosk read models, not authoritative template or print state.

Kiosk UI designs, previews, approves, and monitors templates. It must never connect directly to a printer or write SQLite.

## 6. Database-per-service

Never query another service database, use cross-database joins, or create cross-service foreign keys. Use logical IDs such as `template_version_id`, `printer_id`, `job_id`, `print_execution_id`, and `station_id`.

## 7. Outbox and Inbox

All state-changing commands must persist state, audit, and Outbox records atomically. Never publish Kafka directly from HTTP handlers or command handlers.

Every consumed event that mutates state must use Inbox deduplication with uniqueness on:

```text
consumer_name + event_id
```

Duplicate delivery must never cause uncontrolled duplicate physical printing.

## 8. Canonical template format

Use structured JSON or equivalent typed models as the canonical template source. Raw ZPL is generated output or a restricted advanced extension, never the normal editable source.

Store layout dimensions in millimeters and compile using the selected printer DPI. Support at least 203 and 300 DPI.

Use native ZPL for text, Code 128, QR, lines, and rectangles. Rasterize only icons, logos, images, or unsupported text fallback.

## 9. Graphic security

Prioritize SVG and PNG. Validate MIME and file signatures, size, dimensions, and checksum.

Sanitize SVG by rejecting scripts, event handlers, external references, embedded HTML, remote fonts, XML entities, animation, and excessive path complexity.

Generate DPI-specific monochrome one-bit variants. Support Z64 where available and ASCII hexadecimal fallback.

Printer memory is a cache, not the source of truth.

## 10. Vietnamese text

All Kiosk user-facing strings must be Vietnamese. Code, identifiers, routes, comments, schemas, topics, and technical logs must be English.

Use UTF-8 and an approved Vietnamese font where supported. Provide a controlled bitmap fallback for incompatible printers. Do not assume built-in printer fonts support Vietnamese.

## 11. Template lifecycle

Use:

```text
DRAFT → VALIDATED → PENDING_APPROVAL → APPROVED → ACTIVE → RETIRED
```

Approved versions are immutable. Editing creates a new version. Production print requests must resolve an exact `template_version_id`.

Apply maker-checker approval when role structure supports it.

## 12. Print safety

Use deterministic `print_request_id` and Inbox deduplication.

Persist an immutable render snapshot before sending:

- Exact template version
- Resolved variables
- Resolved assets
- Printer profile
- Compiler version
- Generated ZPL
- SHA-256 checksum

Classify failures:

- Failure before payload send: safe automatic retry may be allowed.
- Failure during or after send: set `STATUS_UNKNOWN`; never blindly print again.

## 13. Testing

Test continuously in every phase. Include as applicable:

- Domain and validation tests
- SQLite migration/integration tests
- Outbox and Inbox tests
- Millimeter-to-dot tests
- ZPL golden-file tests
- Injection tests
- Barcode decode tests
- SVG sanitization tests
- Raster and Z64 tests
- API and SignalR tests
- Frontend component/accessibility/E2E tests
- Docker non-root tests
- Printer transport and hardware tests

For every defect, add a reproducing test before or with the fix. Never weaken tests simply to pass.

## 14. Seed data

Seed data must be deterministic, repeatable, idempotent, and guarded from production.

Required templates:

- Product
- Packaging
- QR
- Rework
- QC hold
- Shipping

Required assets:

- Company logo
- QC pass/fail
- Warning
- Rework
- Fragile
- Recycle
- Keep dry
- Orientation arrow

Required printer profiles:

- Zebra 203 DPI
- Zebra 300 DPI
- Offline printer
- Printer without Z64
- Printer without stored graphics
- Printer missing Vietnamese font
- Printer with stale asset cache

Required error cases include missing variables, invalid barcode, unsupported DPI, missing asset, duplicate request, and status unknown.

## 15. Regression chain

After each phase, run current tests, modified-project tests, previous-phase tests, and a smoke test preserving:

```text
Draft
→ Validate
→ Approve
→ Activate
→ Resolve exact version
→ Bind variables
→ Resolve assets
→ Compile ZPL
→ Send safely
→ Publish result
→ Update Job Engine
→ Update projection
→ Push SignalR
→ Show Kiosk status
→ Preserve audit
```

## 16. Docker and SQLite

Runtime services must use UID/GID `1654`. Dockerfiles must create and own `/data` and `/logs` before switching user.

Use the existing SQLite write-probe and safe fallback policy. Verify writable bind mounts, incompatible bind mounts, named volumes, WAL/SHM creation, clean migration, and restart persistence.

Maintain `./push-images.sh` as the registry publisher. Verify `linux/amd64` and `linux/arm64` using build-only commands before any push.

## 17. Stuck report

Only when genuinely stuck, create:

```text
reports/LABEL_TEMPLATE_STUCK_REPORT_<YYYYMMDD_HHMM>.md
```

Required content:

```markdown
# Label Template & Icon Printing Stuck Report

## Current Phase
## Blocker Summary
## Exact Error
## Reproduction Steps
## Repository Paths and Services Involved
## What Was Inspected
## Attempts Already Made
## Build Results
## Test Results
## Generated ZPL or Asset Evidence
## Logs and Diagnostics
## Printer or Environment Details
## Why Safe Continuation Is Not Possible
## Possible Resolution Options
## Recommended Next Action
## Partial or Uncommitted Changes
## Data Safety Status
## Duplicate Print Risk Status
```

Preserve working changes, revert unsafe partial changes, do not fabricate results, and do not mark the phase complete.

## 18. Final report

After every phase passes, create:

```text
reports/LABEL_TEMPLATE_IMPLEMENTATION_REPORT.md
```

Include architecture, changed services, schemas, migrations, canonical template model, elements, lifecycle, printer capabilities, compiler, DPI behavior, Vietnamese font strategy, icon pipeline, SVG security, asset cache, APIs, Kafka, SignalR, Kiosk UI, RBAC, seed data, tests, hardware evidence, Docker verification, performance, security, commands, limitations, deviations, recommendations, and final acceptance checklist.

Do not claim tests or hardware verification that were not executed.
