# Kiosk Unified Printer List and Template Activation

Date: 2026-07-27

## Scope

The `Kết nối mạng` page now has one printer-management area. The former live
device card and the separate online/active printer area were duplicated views
of the same printer state, so they were replaced by one authoritative list.

## Root causes found

1. `DashboardPage` rendered a device grid and `PrinterManagementTab` rendered a
   second printer list. This made online printers appear in different places.
2. The Kiosk API had `/api/printers`, but its proxy did not expose the ready,
   active, activate, and deactivate routes required by the management UI. The
   browser therefore received SPA HTML for some GET requests and HTTP 405 for
   activation.
3. The ready-printer filter was case-sensitive, while runtime status values can
   arrive as `ONLINE` or `Online`.
4. The UI depended on two partially overlapping lists. It now loads the full
   printer list and displays both online and offline printers in one area.

## Implemented behavior

- One `THIẾT BỊ IN` section in `PrinterManagementTab`.
- All printers remain visible, including offline printers, so status is not
  hidden when a remote adapter or CUPS connection changes state.
- Online/idle printers can be added for production.
- Activation still requires a published label template and confirmation.
- Active printers can change their template with the existing confirmation
  flow; offline printers cannot be assigned for production.
- Deactivate, retry connection, template display, and runtime status remain
  available on the same printer card.
- Runtime device status is matched case-insensitively by printer code.

## Files changed

- `print-marking/station-agent/services/kiosk-ui/frontend/src/pages/DashboardPage.tsx`
- `print-marking/station-agent/services/kiosk-ui/frontend/src/components/PrinterManagementTab.tsx`
- `print-marking/station-agent/services/kiosk-ui/src/ND.KioskUi.Api/Program.cs`
- `services/printer-adapter/src/ND.PrinterAdapter.Api/Program.cs`
- `services/printer-adapter/src/ND.PrinterAdapter.Infrastructure/Messaging/PrinterManagementConsumer.cs`
- `scripts/test-kiosk-printer-template-activation.mjs`
- `package.json`

## API verification

The repeatable API script is:

```bash
npm run test:kiosk:printer-template
```

It logs in as the demo administrator, reads printers, reads published label
templates, activates an online printer, then reads the printer again and
asserts the active template. The verified result was:

- Printer: `Zebra-GK420t-CUPS`
- Status: `ONLINE`
- Active for work: `true`
- Template: `50x30 QR Label (Default)`
- Template ID: `cdf29262-4f40-4724-a3fe-e3ef5bfe77e4`

This verifies the API data used by the unified UI without performing the
operation through the browser.

## Build and runtime verification

- Kiosk frontend Vite build passed.
- Kiosk Docker image build passed.
- `station-kiosk-ui` was recreated and became healthy at
  `http://127.0.0.1:5007/health`.
- The printer adapter image containing the case-insensitive ready filter is:
  `vanhoadotbui2628/printer-adapter:real-printers-no-simulator-ready-printer-20260727-arm64`.
- Published multi-platform manifest digest:
  `sha256:48d36447ca8b8ebc0ca926a8b170410f5857d5d9841851e0d899962c122f8c5c`.

The remote Mac server must pull/recreate that adapter image separately. The
Kiosk UI intentionally uses `/api/printers` as its authoritative source, so a
temporary failure of the adapter's optional `/ready` endpoint does not hide a
printer from the unified list.

## Remaining operational note

The displayed ONLINE/OFFLINE state is live remote-adapter state. If CUPS or
the remote adapter changes state, the same card will reflect it on refresh;
the UI does not convert an offline printer into an online printer locally.
