# Label Template Editor and Kafka Print Test Fix

Date: 2026-07-28

## Root cause

The Kiosk proxy correctly published `POST /api/label-templates/{id}/print-test`
to the Kafka printer-management boundary. The HTTP API in Printer Adapter had
the same endpoint, but `PrinterManagementConsumer` did not dispatch the Kafka
route. It fell through to `PRINTER_MANAGEMENT_OPERATION_NOT_SUPPORTED` (501).

## Changes

- Added Kafka management dispatch for `label-templates/{id}/print-test`.
- Added the adapter-side render, print queue, physical-driver, history, and
  correlation flow to the management service. It uses the selected printer and
  does not introduce a direct Kiosk-to-adapter HTTP call.
- Added explicit error responses for missing template/printer and render errors.
- Changed the Kiosk editor to a split editing surface: properties and JSON on
  the left, live physical-size preview on the right.
- The preview uses the current form JSON and updates on every edit; the Refresh
  button is available for operators who want an explicit redraw.
- Published new multi-platform images and updated standalone Compose files.

## Verification

- Kiosk frontend `npm run typecheck`: passed.
- Kiosk frontend `npm run build`: passed.
- Docker Kiosk image build and recreate: passed; `http://localhost:5007/health`
  returned healthy and the new asset was served.
- Printer Adapter Docker build compiled both the new management consumer and
  the existing template seeder for AMD64 and ARM64: passed.
- `docker-compose.print-adapter.yml config`: passed.
- Before the new adapter deployment, the running Kiosk reproduced the original
  501 response exactly. This confirms the audited failure path.
- A temporary new adapter container joined the local Kafka network and started
  its management consumer without startup failure. The local host has no CUPS
  printer, so physical print success was not claimed here.

## Images

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-print-test-editor-ux-20260727-amd64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-print-test-editor-ux-20260727-arm64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-print-test-editor-ux-20260727`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-print-test-editor-ux-20260727-amd64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-print-test-editor-ux-20260727-arm64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-print-test-editor-ux-20260727`

The ARM64 tag is configured in `docker-compose.print-adapter.yml` and the
standalone station-agent Compose files. The remote macOS server must recreate
the adapter and UI containers to replace the old running image before a real
Zebra print can be verified. The physical Zebra result remains pending that
deployment; this report does not claim it was printed from this host.
## 2026-07-28 Save-version fix

### Root cause

The Kiosk sends template updates through the Kafka management request key
`command.printer.management`. The Printer Adapter production command consumer
was subscribed to the broad `command.printer.#` pattern and attempted to
deserialize every message that it received as `ProductionBatchPrintCommand`.
Management payloads do not contain `production_order_no`, `job_type`,
`product_code`, or `label_items`, so the unrelated print consumer failed and
sent the management message to the dead-letter flow. This made **Lưu phiên
bản** appear to fail even though the Kiosk PUT route and management handler
were present.

### Fix

`PrinterCommandConsumer` now accepts only the two authoritative production
print routing keys:

- `command.printer.print`
- `command.printer.print.batch`

All other routing keys are ignored before JSON deserialization. Template
management remains handled by `PrinterManagementConsumer` on its dedicated
request queue. This prevents management traffic from being interpreted as a
physical print command.

### Build and deployment tags

The adapter and UI were rebuilt through Docker for `linux/amd64` and
`linux/arm64`; all four architecture-specific images and both multi-platform
tags were pushed:

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-management-routing-filter-20260728-arm64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-management-routing-filter-20260728-amd64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-management-routing-filter-20260728`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-management-routing-filter-20260728-arm64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-management-routing-filter-20260728-amd64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-management-routing-filter-20260728`

The compose files now reference the ARM64 tags for the remote macOS server.

The final v2 rebuild includes the immutable version-history snapshot fix:

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-management-routing-filter-v2-20260728-arm64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-management-routing-filter-v2-20260728-amd64`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-management-routing-filter-v2-20260728`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-management-routing-filter-v2-20260728-arm64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-management-routing-filter-v2-20260728-amd64`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-management-routing-filter-v2-20260728`

### Kiosk save UX

After a successful template update, the Kiosk now refreshes the template list
and closes the edit dialog automatically. On validation or API failure, the
dialog remains open so the operator can correct the form and retry.
Docker build output verified both target architectures and all compose files
passed `docker compose config`.
