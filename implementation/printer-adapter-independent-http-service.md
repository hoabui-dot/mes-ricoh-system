# Printer Adapter Independent HTTP Service

Date: 2026-07-26
Status: Implemented and verified

## Objective

Extract Printer Adapter from the print-marking Station Agent into an independently deployable HTTP service. Remove the duplicated `print-marking/mes-frontend` and `print-marking/mes-platform` copies because MES already exists in the main repository.

## Completed Actions

1. Removed `print-marking/mes-frontend` and `print-marking/mes-platform`.
2. Added Printer Adapter endpoints `GET /api/health`, `POST /api/print`, and `GET /api/jobs/{id}`.
3. Changed batch printing from RabbitMQ command consumption to direct HTTP handling.
4. Job Engine now sends `ProductionBatchPrintCommand` to `PRINTER_ADAPTER_URL` and applies the returned `ProductionBatchPrintedEvent` through `PrinterBatchPrintedConsumer.ApplyEventAsync`.
5. Preserved RabbitMQ compatibility in Job Engine for legacy printer events and the remaining station workflows.
6. Removed Printer Adapter RabbitMQ runtime workers and its direct RabbitMQ package dependency.
7. Removed RabbitMQ heartbeat publishing from the virtual printer simulator.
8. Added remote Printer Adapter routing for Kiosk, Projection Service, and Device Simulator.
9. Removed the local `printer-adapter` service from all Station Agent Compose files.
10. Added `print-marking/station-agent/docker-compose.printer-adapter.yml` for separate deployment.
11. Added root `docker-compose.print-adapter.yml` for deploying only Printer Adapter on another server without RabbitMQ or Redis.
12. Added the missing `LabelTemplate` domain model required for a successful Printer Adapter build.
13. Restored the missing Kiosk `LabelTemplatesTab` component required for the frontend build.
14. Updated print-marking AI context, audit progress, and service README documentation.

## Broker Decision

The main MES platform compose provides Kafka, Keycloak, Kong, and observability, but no RabbitMQ or Redis. Station Agent services still require RabbitMQ and Redis for their event topology, cache, and idempotency behavior. The Station Agent stack therefore runs its own RabbitMQ and Redis pair; it does not duplicate an existing MES broker.

Future shared broker support is configurable through:

```text
STATION_RABBITMQ_HOST
STATION_REDIS_CONNECTION_STRING
```

The independent Printer Adapter does not connect to Redis and does not cache requests. Every HTTP call is processed by the adapter; caching and idempotency remain the responsibility of the calling service.

## Deployment

Build the independent image:

```bash
cd print-marking/station-agent
docker build -f services/printer-adapter/docker/Dockerfile \
  -t vanhoadotbui2628/printer-adapter:independent-http-20260726 .
```

Deploy it separately:

```bash
docker compose -f docker-compose.printer-adapter.yml up -d
```

For another server, use the root deployment file:

```bash
docker compose -f docker-compose.print-adapter.yml up -d
```

This standalone file does not start or require RabbitMQ or Redis. It uses direct printer environment values and consumers call the adapter directly at `http://100.68.50.41:5003`.

Configure all consumers with:

```text
PRINTER_ADAPTER_URL=http://<printer-adapter-host>:5003
```

The current deployed adapter endpoint is configured directly in all Station Agent Compose files as:

```text
http://100.68.50.41:5003
```

The standalone image was rebuilt with writable `/data` and `/logs` directories for the non-root `app` user. Health verification succeeded from the calling host:

```text
GET http://100.68.50.41:5003/api/health -> 200 OK
{"status":"healthy","printerCount":5}
```

## Verification Results

- All Station Agent Compose files passed `docker compose config --quiet`.
- Dedicated Printer Adapter Compose passed configuration validation.
- Printer Adapter Docker image built successfully.
- Job Engine, Kiosk UI, Projection Service, and Device Simulator images built successfully.
- Kiosk frontend build completed successfully.
- Station Agent stack started without a local Printer Adapter container.
- RabbitMQ and Redis reported healthy.
- Job Engine, Projection Service, Device Simulator, and Kiosk UI reported healthy.
- HTTP smoke checks passed on ports `5002`, `5007`, `5008`, and `5009`.
- Docker Hub image digest: `sha256:d2756342320da667e16bcb735e51402f7d2982757f8fa4c21970589e2e50cf1e`.

The first runtime start exposed a writable-permission issue on the shared SQLite bind directory. Permissions were corrected for the container application user, after which all services stabilized.

The Printer Adapter image was pushed successfully to Docker Hub as `vanhoadotbui2628/printer-adapter:independent-http-20260726`.

## Related Records

- `print-marking/implementation-printer-adapter-http-refactor.md`
- `print-marking/station-agent/services/printer-adapter/README.md`
- `print-marking/AI_CONTEXT.md`
