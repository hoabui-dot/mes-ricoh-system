# Restore Kiosk Label Template Editor and Preview

Date: 2026-07-27
Status: IMPLEMENTED_AND_VERIFIED_BUILD; REMOTE_RUNTIME_RECREATE_PENDING

## Audit result

The Printer Adapter still owned the complete template contract and API. The
Kiosk proxy still exposed list/detail, PUT, publish, versions, print-test,
printer activation, and Kafka management request/reply routes. The regression
was in the Kiosk frontend: `LabelTemplatesTab.tsx` had been reduced to a list
card and no longer mounted detail, editor, preview, publish, activation, or
print-test actions. The adapter Kafka management consumer also did not handle
`POST /api/label-templates/{id}/render-with-data`, so the remote preview path
could not use the stored renderer.

The running adapter database was additionally found to contain legacy active
templates with null business codes. This is a deployment/seed state problem,
not a reason to render placeholders in the UI. The new seeder archives those
rows and keeps template-version and print-history records immutable.

## Changes

- `services/kiosk-ui/frontend/src/components/LabelTemplatesTab.tsx` restores
  metadata cards, detail, edit/version-save, preview, publish, activation, and
  print-test actions and normalizes camelCase/PascalCase responses.
- `services/kiosk-ui/frontend/src/components/LabelPreview.tsx` renders 2UP
  cells side by side using the configured gap.
- `services/kiosk-ui/src/ND.KioskUi.Api/Program.cs` proxies stored-template
  rendering through the existing Kafka management boundary.
- `services/printer-adapter/src/ND.PrinterAdapter.Infrastructure/Messaging/PrinterManagementConsumer.cs`
  handles stored-template rendering with the same `ZplRenderer` used by print.
- `services/printer-adapter/src/ND.PrinterAdapter.Domain/Entities/LabelTemplate.cs`,
  DTOs, and API update the layout fields as part of versioned edits and inject
  nested renderer layout metadata.
- `PrinterDbSeeder.cs` and `inject_template.py` archive obsolete active rows,
  preserve history, seed exactly four canonical item templates, and assign
  `ITEM-DETAIL-1UP` to `Zebra-GK420t-CUPS`.

## Canonical templates

`ITEM-BARCODE-1UP`, `ITEM-BARCODE-2UP`, `ITEM-DETAIL-1UP`, and
`ITEM-DETAIL-2UP`. All use 203 DPI and a 50 x 30 mm cell. 2UP uses two columns,
one row, and a 2 mm gap. The renderer produces one ZPL document with two
parallel cells, not two sequential print jobs.

## Verification

- Kiosk frontend `npm run typecheck`: passed.
- `python3 -m py_compile print-marking/inject_template.py`: passed.
- Docker Kiosk API build: passed.
- Docker Printer Adapter API build: passed after adding the Kafka render route.
- Kiosk `/health` and login: HTTP 200.
- Kiosk `/api/label-templates`: HTTP 200 through Kafka, but the currently
  running remote adapter still returned legacy templates. The remote adapter
  must be recreated from the new image so its startup seeder archives and
  replaces those rows.

## Published images

- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-template-editor-preview-20260727-amd64`
  digest `sha256:f20d0b875dbd86bb8c442ec70984aa3b8dcab6a05a27e1ab3ab4365c75645bb7`
- `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-template-editor-preview-20260727-arm64`
  digest `sha256:e43e55f05ae6ea551b730c4dda3ea1fdab72cacb0229e0b47658d2ca3613bb57`
- Multi-platform adapter tag:
  `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-template-editor-preview-20260727`
- `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-template-editor-preview-20260727-arm64`
  digest `sha256:9fc176b0f1c5a4a930e2b47ef9b0167730564f29403f22cda820f502448c5d0c`
- Multi-platform UI tag:
  `vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-template-editor-preview-20260727`

## Remaining runtime step

Build/push the new Printer Adapter image, update the remote
`docker-compose.print-adapter.yml`, recreate the adapter with its existing
data volume, then verify the four codes, render 1UP/2UP ZPL, activation, and
physical print test. Do not delete the data volume.

Remote deployment command after copying the updated compose file:

```bash
docker compose -f docker-compose.print-adapter.yml pull printer-adapter
docker compose -f docker-compose.print-adapter.yml up -d --force-recreate printer-adapter
docker compose -f docker-compose.print-adapter.yml logs --tail=100 printer-adapter
```

The existing named volume must remain attached. Startup seeding is idempotent,
archives obsolete rows, and preserves immutable versions/history.
