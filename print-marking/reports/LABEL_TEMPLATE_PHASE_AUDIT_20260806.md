# Label Template & Icon Printing Phase Audit — 2026-08-06

## Audit scope

Read-only comparison of `requirement/Labeld-Templated-&d-Icond-Printingd-Phased-Pack` against the current repository after release `printer-adapter:2026.08.06.1`.

## Result

The phased capability is **not yet complete**. Existing functionality provides a useful legacy base, but Phases 2–8 require substantial work before their acceptance gates can pass.

| Phase | Status | Evidence / remaining work |
|---|---|---|
| 1 — Baseline | Partially complete | Architecture maps and baseline reports exist. Docker health check passed; CUPS/simulator log defects are recorded. Reusable template/asset/transport test fixtures still need completion. |
| 2 — Domain/schema | Incomplete | `LabelTemplate` and version snapshot tables exist, but lifecycle is only `draft/published/archived`; no approved immutable lifecycle, maker-checker, assets/variants/references, printer profiles, template audit or printer-owned outbox. |
| 3 — ZPL compiler | In progress | New typed canonical parser and `ZplLabelCompiler` compile 203/300-DPI native text/Code128/QR/line/rectangle with escaping. It is not yet wired as the authoritative API/workflow and lacks golden/decode tests and asset rendering. Legacy renderer remains authoritative for current requests. |
| 4 — Asset pipeline | Missing | No authoritative SVG/PNG validation, sanitization, raster variants, Z64/hex encoder, stored graphic synchronization, or printer asset cache. |
| 5 — Preview/preflight/test print | Incomplete | Browser preview and legacy Labelary proxy/test-print exist. They do not use the canonical compiler end-to-end, do not persist complete evidence, and lack required preflight/barcode verification. |
| 6 — Kiosk designer/workflow | Incomplete | `LabelTemplatesTab` and `LabelPreview` exist, but no full visual mm designer, asset library, approval lifecycle/RBAC workflow, server-preflight surface, or accessibility/E2E coverage required by the phase. |
| 7 — Production execution/events | Missing | Job Engine has general outbox flows, but there is no versioned `PrintRequested` contract with exact version/request identity, printer inbox, immutable render snapshot, safe `STATUS_UNKNOWN` state machine, or print/template projection integration. |
| 8 — hardening | Not started | Required deterministic assets/profiles/scenarios, full regression/E2E/load/security tests, hardware evidence, and final implementation report are outstanding. |

## Existing strengths to preserve

- Printer Adapter owns `printer.db`, raw TCP/ZPL, print history, template assignment, and a simulator.
- Kiosk UI already exposes template list/preview/version/print-test proxy routes.
- RabbitMQ and Job Engine outbox are existing event boundaries; no cross-service database access is necessary.
- The current release adds non-root `/data` and `/logs` ownership plus canonical compiler groundwork.

## Release gate

No further Printer Adapter or Kiosk UI source change should be made until developer feedback is received for release `2026.08.06.1`, per `deploy/PRINTER_ADAPTER_REMOTE_DEPLOYMENT.md`.
