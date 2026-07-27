# Printer Activation List Root-Cause Fix

Date: 2026-07-26

## Root cause

The Network page read runtime state from Projection Service
`/api/projection/devices`, while Printer Management used Projection proxy
endpoints that directly returned the Printer Adapter's `/api/printers/ready`
and `/api/printers/active` responses. Projection could therefore show
`Zebra-GK420t-CUPS` online from a RabbitMQ heartbeat while the adapter's local
CUPS status was stale/offline and its readiness query returned an empty list.

The adapter readiness query also used case-sensitive status comparisons, which
could exclude valid `Online` or `Idle` values.

## Architectural fix

Projection Service now exposes the canonical printer read model. It combines:

1. Adapter-owned printer configuration and activation metadata.
2. Projection-owned runtime state from `projection_device_status`.
3. One ready/active filter at the Projection API boundary.

Kiosk continues to call Projection only. The adapter remains the owner of
activation writes. No printer is hardcoded and no projection record is
manually inserted.

## Changed file

`print-marking/station-agent/services/projection-service/src/ND.ProjectionService.Api/Program.cs`

Changes:

- Added canonical printer composition using `ProjectionDbContext.DeviceStatuses`.
- Updated `/api/projection/printers/ready` to use projected online state.
- Updated `/api/projection/printers/active` to return the same canonical DTO.
- Preserved adapter proxy routes for activation and deactivation commands.

## Evidence and verification

Before the fix:

- Adapter `/api/printers`: one `Zebra-GK420t-CUPS`, `OFFLINE`.
- Adapter `/api/printers/ready`: `[]`.
- Projection `/api/projection/devices`: same printer, `isOnline: true`.
- Projection `/api/projection/printers/ready`: `[]`.

After one real `printer.heartbeat` event was published through RabbitMQ:

- Live Projection `/api/projection/printers/ready` returned exactly one
  `Zebra-GK420t-CUPS` record with `status: ONLINE` and `isOnline: true`.
- Activation returned `active: 1` and `ready: 0`.
- Deactivation returned `active: 0` and `ready: 1`.
- No duplicate printer rows were returned.
- Projection Service was rebuilt and restarted locally and reported healthy on
  port `5009`.

The activation test used an existing published template and was reverted after
verification. No persistent activation was left behind.

## Deployment

The Projection Service image must be rebuilt and deployed wherever Kiosk and
Projection run. Local verification used the AMD64 Docker build. For the remote
ARM64 station, rebuild the normal Projection Service image before testing:

```bash
docker compose -f docker-compose.yml build projection-service
docker compose -f docker-compose.yml up -d --no-deps projection-service
```

Then verify:

```bash
curl http://<projection-host>:5009/api/projection/devices
curl http://<projection-host>:5009/api/projection/printers/ready
curl http://<projection-host>:5009/api/projection/printers/active
```
