# Printer Adapter Monitoring UI

Date: 2026-07-26

## Result

Implemented `printer-adapter-ui` as an independently deployable, read-only
ASP.NET Core service with a React/Vite dashboard. It runs on port `5010` and
polls the monitoring API every five seconds. The browser never receives
RabbitMQ credentials, opens a RabbitMQ connection, consumes a print queue, or
mounts the printer adapter SQLite database.

## Runtime architecture

```text
Browser
  -> printer-adapter-ui:5010
       -> Printer Adapter HTTP (health, printers, print history)
       -> Projection Service HTTP (reserved for read-only projection data)
       -> RabbitMQ Management HTTP API (queues/topology only)
```

The service reads RabbitMQ through the Management API. It does not use the
RabbitMQ AMQP client and cannot acknowledge, consume, publish, or mutate print
commands. HTTP endpoints remain read-only monitoring endpoints.

## Implemented endpoints

- `GET /health`
- `GET /api/monitoring/summary`
- `GET /api/monitoring/printer-adapter`
- `GET /api/monitoring/printers`
- `GET /api/monitoring/printers/{printerCode}`
- `GET /api/monitoring/cups`
- `GET /api/monitoring/tcp-printers`
- `GET /api/monitoring/rabbitmq`
- `GET /api/monitoring/rabbitmq/queues`
- `GET /api/monitoring/rabbitmq/exchanges`
- `GET /api/monitoring/rabbitmq/bindings`
- `GET /api/monitoring/rabbitmq/connections`
- `GET /api/monitoring/rabbitmq/consumers`
- `GET /api/monitoring/heartbeats`
- `GET /api/monitoring/status-transitions`
- `GET /api/monitoring/print-jobs`
- `GET /api/monitoring/errors`

The first UI view displays overall state, adapter, RabbitMQ, CUPS, topology,
registered printers, heartbeats, and the printer command queue. There are no
start, stop, retry, activate, delete, print, or configuration actions.

## State rules

- `Healthy`: adapter and RabbitMQ are reachable and at least one printer is
  online.
- `Degraded`: the adapter is reachable but CUPS, RabbitMQ, or printer readiness
  is degraded.
- `Offline`: the adapter itself cannot be reached or is unconfigured.
- Heartbeat records are `Current`, `Stale`, or `Missing` using
  `MONITOR_STALE_HEARTBEAT_SECONDS`.

Dependency failures are converted to degraded/empty read models where possible
so a temporary printer or management API outage does not crash the dashboard.

## Deployment

The server compose file requested for deployment is:

`/home/neurosus/mes-system/docker-compose.print-adapter.yml`

It now starts both the real-printer adapter and the monitoring UI. The UI is
published at `http://100.68.50.41:5010` when the host firewall allows that
private port. In this same Compose file, the UI reaches the adapter through
`http://printer-adapter:5003`; `localhost` would incorrectly point to the UI
container itself. The process-specific standalone UI compose is also available at:

`print-marking/station-agent/docker-compose.printer-adapter-ui.yml`

That file is for a deployment where the adapter, Projection Service, and broker
are reached remotely. It has no RabbitMQ, Redis, or SQLite volume. The image
uses the intentionally requested Docker tag `lastest`.

The repository-level compose uses the existing local/demo broker mapping
(`5673` AMQP and `15673` Management API). A real remote deployment should use
the broker's private AMQP/Management ports and a dedicated account instead of
`guest/guest`.

## Build and image

The Dockerfile is:

`print-marking/station-agent/services/printer-adapter-ui/docker/Dockerfile`

It builds the Vite frontend, copies the static bundle into ASP.NET `wwwroot`,
then publishes the backend. The local AMD64 build passed on 2026-07-26. The
ARM64 release was built and pushed successfully:

- image: `vanhoadotbui2628/printer-adapter-ui:lastest`
- platform: `linux/arm64`
- manifest digest:
  `sha256:60a06204cb78a2aa62d263c9d4c2427e0c1b320faab2f76ebeade9b36518bd36`

## Verification

Validated:

- frontend `tsc` and Vite production build
- ASP.NET publish for `linux/amd64`
- repository compose config
- standalone UI compose config
- `/health`
- `/api/monitoring/summary`
- `/api/monitoring/printers`
- `/api/monitoring/rabbitmq`
- `/api/monitoring/rabbitmq/queues`
- `/api/monitoring/heartbeats`
- `/api/monitoring/print-jobs`
- `/api/monitoring/errors`
- no runtime exceptions after fixing `JsonNode` parent ownership

The pushed image contains the corrected `Degraded` summary classification for
reachable adapters whose CUPS or printer state is unavailable.

The dashboard renders a complete default shell during cold start or dependency
failure. It shows `Starting`, `Not connected`, `Not checked`, and `Waiting`
values instead of an empty page, then replaces them with live data when the
monitoring APIs recover. The fallback-enabled ARM64 image was pushed with
manifest digest
`sha256:c9bc31d295e943828f213d79a52bf642ccabdfac3dcea02919845bc6f5c2f3e3`.

### Blank UI fix

The initial image served `/health`, `index.html`, and CSS successfully but the
page remained blank because `frontend/src/main.tsx` defined `App` without
mounting it with `createRoot(...).render(<App />)`. The bundle was only 1.6 KB
and contained no application render call. The fix adds the React mount; the
new production bundle is approximately 199 KB and was verified through the
container HTTP endpoint before the ARM64 push.

Local verification observed RabbitMQ `Connected`, the durable
`printer-adapter.print-commands` queue with two consumers, and the real
`Zebra-GK420t-CUPS` printer as `OFFLINE` because the local CUPS queue was not
available. The UI correctly reported the overall state as `Degraded` after the
state classification fix.

## Security and remaining risks

The compose files contain direct demo credentials because this deployment file
is intended to run as-is in the current private environment. For production,
replace `guest/guest` with a dedicated least-privilege RabbitMQ user, restrict
broker and management ports by firewall allow-list, enable TLS where required,
and keep the UI behind the station network or an authenticated reverse proxy.
The monitoring UI itself does not add user authentication; access control must
be provided by the deployment gateway/network before exposing port `5010`.
