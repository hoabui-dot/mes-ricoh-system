# Printer Adapter Co-located Mac Compose and CUPS Diagnosis

Date: 2026-07-27

## Findings

The standalone root Compose file was configured with
`PRINTER_ADAPTER_URL=http://100.68.50.41:5003`. That is the wrong topology when
the adapter and Monitoring UI are started together in the same Compose project.
The UI must call `http://printer-adapter:5003`; `localhost` would point to the
UI container itself, while the host IP unnecessarily leaves and re-enters the
server.

The running development container was also using the old
`real-printers-no-simulator-20260726-arm64` image. The current Compose file now
uses the verified `real-printers-no-simulator-20260727` multi-platform tag.
That old container also had `CUPS_SERVER=127.0.0.1:8631`, which takes priority
over `CUPS_HEALTH_HOST`/`CUPS_HEALTH_PORT` in the adapter and points back into
the container. Recreating the container from the current Compose file removes
that stale override.

`Zebra-GK420t-CUPS` being `OFFLINE` and the adapter being `Degraded` is
currently an accurate dependency state. The adapter health endpoint requires
Kafka, a reachable CUPS queue, and at least one online printer for `Healthy`.
The development host had no listener on CUPS ports 631 or 8631 during the
check, so changing the UI URL cannot make the physical printer online.

## Changes

- Added a top-of-file Compose comment documenting co-located Mac networking.
- Changed the root UI adapter URL to `http://printer-adapter:5003`.
- Set `CUPS_HEALTH_PORT=631` explicitly in the root and standalone adapter
  Compose files.
- Kept `CUPS_HEALTH_HOST=host.docker.internal`, which is the correct Docker
  Desktop route to the Mac host CUPS daemon.
- Kept the real queue name `Zebra_Technologies_ZTC_GK420t`.

## Deployment verification

```bash
docker compose -f docker-compose.print-adapter.yml config --quiet
docker compose -f docker-compose.print-adapter.yml pull
docker compose -f docker-compose.print-adapter.yml up -d --force-recreate
docker compose -f docker-compose.print-adapter.yml logs -f printer-adapter printer-adapter-ui
```

On the Mac host, CUPS must be running and expose the configured queue. Verify
the queue name and listener before expecting `Healthy`:

```bash
lpstat -p -d
curl -I http://localhost:631/
```

If CUPS is intentionally proxied on another port, set that port in the Mac
Compose deployment, for example `CUPS_HEALTH_PORT: "8631"`; do not change
`PRINTER_ADAPTER_URL` for that case.

Confirm the deployed container has no stale `CUPS_SERVER` override:

```bash
docker inspect printer-adapter --format '{{range .Config.Env}}{{println .}}{{end}}' | grep CUPS
```

The adapter and UI image tags were already rebuilt and pushed by
`npm run build:printer-adapter:both`. No physical print was claimed on this
development host because its CUPS listener was unavailable.
