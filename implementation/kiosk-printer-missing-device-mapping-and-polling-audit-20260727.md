# Kiosk Printer Missing Device Audit

Date: 2026-07-27

## Finding

The Kiosk API had a printer, but the UI showed `Chưa tìm thấy thiết bị in`.
`GET /api/printers` returned PascalCase fields such as `PrinterCode`, `Status`,
and `IsActiveForWork`, while `PrinterManagementTab` only read camelCase fields.
The normalizer therefore discarded every API row because `printerCode` was
empty.

Verified API response after login:

- `Zebra-GK420t-CUPS`
- `Status=ONLINE`
- `IsActiveForWork=true`
- `ActiveTemplateName=50x30 QR Label (Default)`

## Fix

`PrinterManagementTab` now accepts both PascalCase and camelCase for printer,
template, and live device fields. The published-template list is normalized in
the same way. The Kiosk image was rebuilt and recreated; health is:

```json
{"status":"healthy","service":"kiosk-ui"}
```

## Polling and retry audit

- The printer list is fetched by `GET /api/printers` every 15 seconds while the
  printer-management component is mounted, plus an explicit refresh after
  activation/deactivation/manual refresh.
- There is no frontend heartbeat endpoint fetch. `LastHeartbeatAt` is data
  returned by the printer API; the adapter owns heartbeat publication/probing.
- Offline cards use the test-connection endpoint for an automatic retry every
  30 seconds. This is not a tight loop and now has an in-flight guard, so a slow
  request cannot overlap with the next retry. Manual retry uses the same guard.
- Online cards do not run automatic retries.

## Verification

- Frontend TypeScript/Vite build passed.
- Kiosk Docker build and recreate passed.
- Kiosk health check passed.
- Authenticated `GET /api/printers` returned the physical printer.
- `npm run test:kiosk:printer-template` still verifies activation and persisted
  template assignment through the Kiosk API.
