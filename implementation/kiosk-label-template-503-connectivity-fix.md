# Kiosk Label Template 503 Connectivity Fix

Date: 2026-07-27

## Root cause

The Kiosk label-template endpoints are authenticated HTTP management proxies:

```text
Kiosk UI -> Printer Adapter HTTP /api/label-templates/*
```

The route implementation and the template repository were healthy, but the
running Kiosk was configured with `http://100.68.50.41:5003`. The Docker
container could not reach that Tailscale address, and the Printer Adapter was
not running on the endpoint at the time of the failure. The Kiosk therefore
returned its dependency-unavailable response as HTTP 503.

This was not a Kafka failure. Kafka remains the asynchronous transport for
production print commands, completion/failure events, heartbeat, and printer
status. HTTP remains the management/diagnostic transport for label templates.

## Changes

- Updated `docker-compose.print-adapter.local-amd64.yml` to use the current
  Kafka/CUPS-fix AMD64 image instead of the obsolete local RabbitMQ image.
- Attached the independently started local Adapter container to
  `platform-net` for this integrated host runtime.
- Updated `infra/docker-compose.print-station.yml` local fallback to
  `http://printer-adapter:5003`, which is resolvable from Kiosk and Projection
  through Docker DNS. Remote deployments can still set
  `PRINT_STATION_PRINTER_ADAPTER_URL` to the reachable remote Adapter URL.
- Did not add an Adapter to the Station Compose file and did not change the
  Kafka command/event topology.

## Runtime verification

Commands executed:

```bash
docker compose -f docker-compose.print-adapter.yml \
  -f docker-compose.print-adapter.local-amd64.yml up -d printer-adapter
docker compose -f infra/docker-compose.print-station.yml up -d \
  --force-recreate station-projection-service station-kiosk-ui
```

Results:

- Printer Adapter `/api/label-templates/active`: HTTP 200.
- Kiosk `/api/health`: healthy.
- Kiosk login with the seeded operator account: successful.
- Authenticated Kiosk `/api/label-templates/active`: HTTP 200 through the
  Kiosk proxy.
- Adapter log confirmed it returned the published template `Vị trí kho / kệ /
  ô chứa`, revision 10.
- Adapter is attached to `platform-net`; Kiosk uses
  `PRINTER_ADAPTER_URL=http://printer-adapter:5003`.

## Remaining environment note

The current development host cannot reach the Mac CUPS address
`192.168.2.31`, so the Adapter health may remain `Degraded` and the physical
printer may show offline on this host. That does not prevent label-template
CRUD/read operations. Physical printing still requires the Adapter deployment
on the Mac/server that can reach its CUPS queue, with the Kiosk and Projection
`PRINT_STATION_PRINTER_ADAPTER_URL` set to that reachable Adapter endpoint.
