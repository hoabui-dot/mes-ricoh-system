# Phase 1 Prompt — Baseline Inspection and Architecture Mapping

## Role

Work as a senior architect and implementation engineer inside the existing Print-Marking Edge Station repository.

Load and obey:

```text
00_EXECUTION_RULES.md
```

Continue automatically to Phase 2 after this phase passes.

## Objective

Establish a verified baseline, map real printer and label capabilities, confirm service ownership, identify compatibility risks, and prepare reusable test infrastructure.

## Tasks

1. Inspect actual paths for Printer Adapter, Job Engine, Projection Service, Kiosk UI, shared contracts, RBAC, SQLite, Outbox, Inbox, Kafka, SignalR, Docker, CI, tests, seeds, and `push-images.sh`.
2. Record actual framework and dependency versions.
3. Run current backend builds, tests, Kiosk typecheck/tests/build, Docker Compose validation, and current printer-adapter startup.
4. Create `reports/label-template-phase-1-baseline.md` with existing failures separated from new work.
5. Determine current support for TCP 9100, USB, Link-OS, status queries, DPI discovery, stored graphics, stored formats, downloadable fonts, Z64, test print, print history, and heartbeat.
6. Find existing template entities, raw ZPL templates, variables, preview code, asset upload, icon processing, barcode/QR support, Vietnamese font logic, approval, and printer assignment.
7. Confirm ownership:
   - Printer Adapter: templates, assets, compiler, printer cache, execution.
   - Job Engine: workflow.
   - Projection Service: read models.
   - Kiosk UI: design and operations.
8. Inspect current print contracts and identify missing `event_id`, `print_request_id`, `job_attempt_id`, `template_version_id`, `printer_id`, and `correlation_id`.
9. Define backward-compatible contract evolution.
10. Add reusable test utilities:
    - Temporary SQLite
    - Deterministic clock and IDs
    - Template/asset/printer fixtures
    - Fake printer transport
    - Kafka test fixture or reliable test double
    - ZPL golden-file helper
    - Barcode decode helper
    - Frontend API mocks
11. Define the typed printer capability model.
12. Create `reports/label-template-implementation-map.md`.

## Required verification

- Current printer adapter starts.
- Current SQLite path works under non-root execution.
- Fake or real printer transport can be exercised.
- Existing Kafka/SignalR test paths work or have stable test doubles.
- Existing dashboard, history, reprocess, and printer configuration builds remain intact.

## Acceptance gate

Pass only when the real architecture, baseline status, existing capabilities, ownership, compatibility plan, test foundations, risks, and implementation map are verified.

Continue immediately to Phase 2.
