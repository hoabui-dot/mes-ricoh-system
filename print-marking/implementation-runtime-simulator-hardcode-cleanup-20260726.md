# Runtime Simulator and Hardcoded Configuration Cleanup

Date: 2026-07-26
Status: IMPLEMENTED_AND_VERIFIED_LOCALLY

## Changes

- Removed the running `station-device-simulator` container.
- Restricted the Device Simulator Compose service to the explicit `simulator`
  profile in the station development and production stacks. It is not started
  by the default Compose workflow.
- Removed active Projection diagnostics/config calls to `device-simulator`.
  Laser and PLC diagnostics now report `Unconfigured` until real endpoints are
  supplied.
- Removed simulator settings from Job Engine and Projection Compose runtime
  configuration.
- Removed source fallbacks to `STATION-01` in Projection background services,
  Kiosk manual override handling, Kiosk dashboard state, and the production
  view API.
- Kiosk reads `VITE_STATION_ID` when available and does not request a
  production view when no station identity was built into the frontend.
- An idle station with no production view returns `204 No Content`, not a
  misleading `404`.
- Printer Adapter URLs are required configuration in station services rather
  than falling back to a hardcoded host.
- The root local adapter Compose file now uses the real-printer AMD64 image;
  the independent ARM64 Compose file uses the pushed ARM64 image.

## RabbitMQ Port Clarification

The root local demo stack maps its local `station-rabbitmq` container's port
5672 to host port 5673, so a local adapter log showing `100.68.50.41:5673` is
expected for that stack. The independent Print Station deployment connects to
the shared broker on port 5672. These are deployment settings and must not be
confused or encoded as application defaults.

## Verification

- Projection Service Docker build passed.
- Kiosk frontend TypeScript/Vite and Docker build passed.
- Compose validation passed with explicit `STATION_ID`, `PRINTER_ADAPTER_URL`,
  `LASER_HOST`, and `LASER_PORT` values.
- Projection and Kiosk containers restarted successfully and were healthy.
- `GET /api/projection/production?stationId=PRINT-STATION-01` returned `204`
  while no production view was active.
- No `station-device-simulator` container is running.
- Real Printer Adapter remains the only printer runtime container.
