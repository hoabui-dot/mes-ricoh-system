# Re-audit: Remote MacOS Printer Adapter E2E Verification

## Topology correction

The local `station-printer-adapter` container was a stale duplicate and was
stopped. The MES host now runs no Printer Adapter. The authoritative runtime is
the remote MacOS edge Adapter, which publishes printer runtime events to the
shared Kafka cluster. MES owns the Print Station readiness projection and the
WO print-job lifecycle.

## Evidence captured on 2026-07-27

MES Master Data readiness for Workstation `dc497a37-1347-481e-a120-9a0fad5238a1`
returned binding, lifecycle, runtime, Kafka, and printer checks all true. The
row identified:

```text
print_station_id=6f56f652-bc6a-456e-a6b3-6284ab023f2d
print_station_code=PRINT-STATION-01
adapter_id=PRINT-ADAPTER-01
runtime_status=ONLINE
kafka_status=CONNECTED
registered_printer_count=1
ready_printer_count=1
active_for_work_printer_count=1
allocated_printer_quantity=1
```

The Kiosk/Projection active endpoint returns HTTP 200 and identifies
`Zebra-GK420t-CUPS` as `ONLINE` while the local Adapter is stopped. This proves
the Kiosk state is available from Kafka runtime projection and is not dependent
on a local CUPS process.

## Root causes corrected

1. A stale local Adapter image with `CUPS_SERVER=127.0.0.1:8631` was running on
   the MES host. It was stopped and must not be restarted there.
2. Projection Service `/projection/printers/ready` had an inverted filter and
   excluded active online printers. It now requires active and online.
3. Projection Service returned 502 when the remote Adapter management API was
   unavailable. The active-printer endpoint now falls back to Kafka-projected
   runtime facts; management mutations remain Adapter-owned.
4. Projection Service marked devices offline after 10 seconds while the remote
   Adapter heartbeat interval is 15 seconds. The timeout is configurable with
   `DEVICE_HEARTBEAT_STALE_SECONDS` and defaults to 45 seconds.
5. The verification script assumed local Docker access. It now requires
   `PRINTER_ADAPTER_BASE_URL`, probes remote health/printers, supports
   `MES_BASE_URL`, and skips local Docker logs unless explicitly enabled.

## State matrix

| State | Current value | Evidence |
|---|---|---|
| Adapter | `PRINT-ADAPTER-01` | MES runtime projection |
| Print Station | `PRINT-STATION-01` | MES readiness API |
| Kafka | `CONNECTED` | MES readiness API |
| Printer registered | `1` | MES runtime projection |
| Printer online | `ONLINE` | Kiosk Projection API and MES projection |
| Printer ready | `1` | MES readiness API |
| Active for work | `1` | MES readiness API |
| Workstation binding | primary, allocation 1 | MES readiness API |
| Local Adapter | stopped | Docker runtime |
| Local CUPS | not required | remote-edge ownership |

## Verification boundary

Passed: local Adapter stopped; remote Kafka runtime reached MES; readiness was
true; runtime projection identified the remote Adapter; Projection Service
health and active-printer endpoint returned 200; Projection Service build
passed; stale-heartbeat threshold is 45 seconds.

Not claimed from this MES host: physical label output, CUPS job ID, remote
Adapter command-consumer offset, printer-result event ID, or WO completion.
Those require the remote-capable script with the actual MacOS Adapter URL:

```bash
MES_BASE_URL=http://localhost:18000 \
MASTER_DATA_BASE_URL=http://localhost:13020 \
PRINTER_ADAPTER_BASE_URL=http://<REMOTE_MACOS_HOST>:5003 \
PRINTER_ADAPTER_HOST_MODE=remote \
PRINT_STATION_CODE=PRINT-STATION-01 \
EXPECTED_PRINTER_CODE=Zebra-GK420t-CUPS \
MES_DEMO_BYPASS_RESOURCE_ALLOCATION=true \
npm run verify:mes:wo-physical-print
```

The remote Adapter URL must not be `localhost:5003` on the MES host.

## Follow-up deployment check (2026-07-27)

The remote MacOS deployment report confirmed the remaining cause of the
offline state. Docker Desktop for Mac resolves `host.docker.internal` to the
Docker VM gateway (`192.168.65.254`), not to the Mac host's CUPS listener.
The adapter could reach TCP port 631 on that gateway but could not read the
configured IPP queue, so its health correctly reported `Degraded` and
`Zebra-GK420t-CUPS` as `Offline`. Kafka was connected; this was not a Kafka
failure.

The Mac deployment must use the following endpoint for both IPP health checks
and `lpr` submission:

```text
CUPS_HEALTH_HOST=192.168.2.31
CUPS_HEALTH_PORT=631
CUPS_SERVER=192.168.2.31:631
CUPS_USER=hoabui
```

The Mac CUPS web interface must be enabled with `cupsctl WebInterface=yes`.
The root Compose deployments now use the LAN address and no longer use the
Linux-only `host-gateway` mapping. The LAN address is DHCP-assigned; reserve
it in the router or update both Compose files before redeploying if it
changes.

The corrected image tag is
`vanhoadotbui2628/printer-adapter:real-printers-no-simulator-20260727-cups-remote-fix`.
It was pushed as a multi-platform manifest with digest
`sha256:993d869d17b8f73f6bcd50c83c5c6f7f2d97f65192b48fd5bfd0258f5e8a20d6`.
Remote runtime verification returned `Healthy`, Kafka `Connected`, CUPS
`Connected`, and one online printer. MES readiness returned `ready=true` with
one ready and active-for-work printer.

## Physical print authorization

The health endpoint alone does not prove that a remote CUPS job is authorized.
The Mac deployment also sets `CUPS_USER=hoabui`, matching the local macOS
account accepted by the host CUPS policy. The host CUPS configuration permits
the trusted LAN client for `Create-Job` and `Send-Document` with the configured
`AuthType None` policy. A final `POST /api/label-templates/{id}/print-test`
was verified on the remote Adapter and produced a physical Zebra label; the
CUPS queue completed the job successfully.

This unauthenticated LAN policy must remain restricted by firewall/network
allow-listing. Do not expose CUPS port 631 to the public internet.

## Full WO flow attempt (2026-07-27)

The controlled verifier was run with the remote Adapter and a new Draft WO:

```text
WO-20260727-0001
wo_id=8600346d-2e4c-4566-a47b-108ed6d9469f
artifact=artifacts/wo-print-e2e/2026-07-27T12-15-56-175Z
```

Remote preflight passed. The first approval attempt was correctly rejected:

```text
WO_RESOURCE_ALLOCATION_INVALID
WO_OPERATION_ALLOCATION_MISSING
operation_count=6
committed_allocation_count=0
```

The Adapter printer had also lost its production activation after deployment;
it was explicitly activated with the published location-label template for
this controlled run. After activation, all runtime checks passed:

```text
Adapter Healthy, Kafka Connected, CUPS Connected, printer Online
active_for_work_printer_count=1
MES readiness ready=true
Kiosk projected printer ONLINE and active_for_work=true
```

The WO run remains intentionally incomplete. The legacy Draft WO has no
`shift_id`, and candidate checks show missing effective assignments and a
required supporting machine unavailable on several operations. The standard
production path therefore cannot allocate all six operations. The demo
bypass is configured `false` in the running service and was not enabled merely
to make the test appear successful. The earlier remote `print-test` proved
physical CUPS output, but a full MES WO-to-print-result completion still
requires a WO with valid shift, operation assignments, and committed
allocations.
