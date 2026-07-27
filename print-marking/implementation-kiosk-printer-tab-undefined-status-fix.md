# Kiosk Printer Tab: Undefined Status Fix

Date: 2026-07-26
Status: IMPLEMENTED_AND_VERIFIED

## Symptom

Opening the `Thiết bị in` tab on the `Kết nối mạng` page crashed the Kiosk UI with:

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'toLowerCase')
```

## Root cause

`PrinterManagementTab` treated REST printer rows and projected device rows as fully populated domain objects. During projection startup/reconnect, a row can be incomplete or a SignalR event can omit `deviceId`, `lifecycleState`, or `status`. The component called `toLowerCase()` on those unvalidated values while building the live-status map and rendering lifecycle styles. The detail modal also called `toUpperCase()` directly on protocol data.

## Changes

- Added REST boundary normalization for printer rows.
  - Rows without a usable `printerCode` are ignored.
  - Missing display, network, protocol, driver, status, and boolean values receive safe display defaults.
- Added projected device normalization before creating the live lookup map.
  - Rows without `deviceId` are ignored.
  - Missing lifecycle values resolve to `Online` or `Offline` from the validated boolean state.
- Replaced direct lifecycle/device string operations with validated case-insensitive key helpers.
- Added SignalR printer-event validation in `useDashboard`.
  - Missing printer codes are ignored.
  - Missing status and timestamps receive safe defaults.
- Normalized initial `/api/projection/devices` data before storing it in React state.

## Files

- `station-agent/services/kiosk-ui/frontend/src/components/PrinterManagementTab.tsx`
- `station-agent/services/kiosk-ui/frontend/src/hooks/useDashboard.ts`

## Verification

- Frontend production build passed in the Docker builder (`tsc && vite build`).
- Kiosk image rebuilt successfully as `vanhoadotbui2628/kiosk-ui:latest`.
- `station-kiosk-ui` recreated and started successfully.
- `GET http://127.0.0.1:5007/health` returned `{"status":"healthy","service":"kiosk-ui"}`.
- `GET /api/projection/devices` returned printer statuses including `ONLINE` and `OFFLINE` rows.
- Kiosk logs showed successful SignalR negotiate (`200`), WebSocket upgrade (`101`), and device projection proxy (`200`), with no UI exception.

The local frontend checkout does not contain installed npm dependencies, so a direct host `npm run build` cannot resolve packages. The Docker builder installed the declared dependencies and is the authoritative build verification.

## Follow-up: online network devices missing from ready list

The printer-adapter intentionally excludes simulation drivers from the default
`/api/printers/ready` response. The Kiosk now calls that endpoint with
`includeSimulation=true`, because the demo station exposes online simulated
printers in `Mạng lưới thiết bị` and must allow them to be activated for
production. The simulation-only panel continues to subtract printers already
shown in the ready/production data, so the same printer is not duplicated.
