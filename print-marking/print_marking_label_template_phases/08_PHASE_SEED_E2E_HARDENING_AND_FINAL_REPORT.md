# Phase 8 Prompt — Comprehensive Seeds, End-to-End Hardening, Hardware, Docker, Security, and Final Report

## Role

Complete production hardening. Load and obey `00_EXECUTION_RULES.md`.

Do not stop until every acceptance item passes or a genuine blocker requires the stuck report.

## Objective

Verify the complete capability from template creation through physical or simulated print, run all regressions, harden deployment, test performance and security, and create the final implementation report.

## Comprehensive seed dataset

Include all lifecycle states; Product, Packaging, QR, Rework, QC Hold, and Shipping templates; all required icons; 203/300/incompatible printer profiles; safe development users for Operator, Supervisor, Label Engineer, Maintenance, and Admin; and cases for Vietnamese, long values, missing variables/assets, invalid barcode, unsupported DPI, no Z64, no stored graphics, missing font, stale cache, memory full, duplicate request, test print, safe retry, and status unknown.

## Required E2E scenarios

1. Draft → design → validate → server preview → submit → maker-checker approval → test print → activate.
2. Job Engine → PrintRequested → Inbox → exact version → compile → asset sync → send → PrintCompleted → Job Engine → Projection → SignalR → Kiosk.
3. Same event ID delivered repeatedly creates one execution and one print.
4. Different event IDs with the same print request create no duplicate physical print.
5. Offline failure before send follows safe retry policy.
6. Connection loss during send becomes STATUS_UNKNOWN and requires reconciliation.
7. Missing stored logo is downloaded once and reused through `^XG`.
8. Printer without Z64 uses hex fallback.
9. Missing Vietnamese font blocks or uses the approved bitmap fallback.
10. SignalR disconnect preserves stale data and reconnects through REST reconciliation.

## Hardware verification

When hardware is available, test at least one 203 DPI and one 300 DPI printer for alignment, Code 128, QR, logo/icon clarity, Vietnamese text, media, darkness, speed, sensor, repeated consistency, barcode decode, and Vision result.

Record model, firmware, DPI, media, ribbon, settings, result, and evidence.

When hardware is unavailable, use fake transport, authoritative previews, decode tests, and exact ZPL evidence, and state the limitation honestly.

## Regression

Run all Printer Adapter, Job Engine, Projection, Kiosk, shared-contract, Alarm Center, Gateway-affected, authentication, RBAC, localization, Docker, dashboard, history, reprocess, heartbeat, SignalR, and SQLite tests.

## Performance

Test large template/asset sets, preview bursts, print bursts, asset cache hit/miss, Outbox backlog, Projection catch-up, SignalR fan-out, large ZPL, and repeated barcode generation.

Verify no duplicate print, uncontrolled memory, UI freeze, unbounded transaction, repeated asset download, excessive preview delay, or event loss.

## Security

Test ZPL injection, SVG scripts/external references, oversized/malformed assets, unsafe expressions, raw-ZPL permissions, unauthorized approval/activation/test print, direct API bypass, oversized values, immutable audit, generated-payload access, seed endpoint absence, and secret logging.

## Docker and SQLite

Verify UID/GID 1654, `/data` and `/logs` ownership, named volume, writable/incompatible bind mounts, write-probe behavior, WAL/SHM, clean/existing migrations, restart persistence, asset/snapshot persistence, and health checks.

Run:

```bash
./push-images.sh --build-only
./push-images.sh --build-only --service <service-name>
```

Verify `linux/amd64` and `linux/arm64`. Do not push unless requested.

## UI production checks

Verify supported kiosk resolutions, no double scroll, usable canvas, visible panels/dialogs, long Vietnamese text, touch and keyboard use, reduced motion, safe refresh/session expiry, immutable approved versions, and correct role actions.

## Cleanup

Remove dead/debug code and temporary endpoints, format, lint, typecheck, rebuild, rerun critical E2E, verify English code/comments, Vietnamese UI, safe data, and no user-exposed font files.

## Final report

Create:

```text
reports/LABEL_TEMPLATE_IMPLEMENTATION_REPORT.md
```

Include exact architecture, changes, schemas, migrations, template schema/elements/lifecycle, capabilities, compiler/DPI, Vietnamese strategy, graphics/security/cache, APIs, Kafka, SignalR, Kiosk/RBAC, seeds, tests, E2E, hardware evidence, Docker, cross-build, performance, security, commands, limitations, deviations, recommendations, and final checklist.

Never claim tests or hardware verification that did not run.

## Final acceptance gate

All eight phases, builds, migrations, seeds, lifecycle, approval, 203/300 compilation, native Code 128/QR, inline/stored icons, Z64/hex fallback, Vietnamese strategy, preview, test print, duplicate safety, status unknown, Job Engine, Projection, SignalR, Kiosk designer, RBAC, Docker non-root, SQLite write-probe, security, regressions, and final report must pass.

If anything fails, continue fixing and testing. Create a stuck report only when continuation is genuinely impossible.
