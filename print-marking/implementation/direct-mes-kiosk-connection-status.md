# Direct MES Connection Status in Kiosk

## Change

The Kiosk Device Network view no longer treats the synthetic `gateway-01` device as the factory connection. The banner now reports the direct MES HTTP intake path through Station Gateway and shows:

- MES status: `RECENTLY_ACTIVE`, `IDLE`, `DEGRADED`, or `OFFLINE`
- Station Gateway readiness and HTTP protocol
- Last successful MES request
- MES request, success, and failure counts for the last 24 hours
- Sanitized dependency state for SQLite, Redis, and RabbitMQ

`IDLE` is a healthy, reachable HTTP integration with no recent traffic. It is not rendered as offline.

## Source of truth

Station Gateway exposes `GET /api/gateway/connection-status`. The endpoint reads the existing `gateway_requests` audit table and the existing dependency registrations. It does not add a second request log and does not expose payloads or credentials.

The source classifier excludes values containing `simulator`, `manual`, or `device-sim`. Existing real station edge IDs remain eligible for MES telemetry. The order intake route and its idempotency/outbox behaviour are unchanged.

Projection exposes `GET /api/projection/integrations/mes` and polls Station Gateway every 15 seconds. The Projection service is the Kiosk-facing source of truth. It broadcasts `OnMesConnectionStatusChanged` only when status, dependency state, last success, or last error changes.

## Files changed

- `services/mqtt-adapter/src/ND.StationGateway.Api/Program.cs`
- `services/projection-service/src/ND.ProjectionService.Application/Dtos/MesConnectionStatusDto.cs`
- `services/projection-service/src/ND.ProjectionService.Application/Interfaces/IMesConnectionStatusProvider.cs`
- `services/projection-service/src/ND.ProjectionService.Infrastructure/Integration/MesConnectionStatusProvider.cs`
- `services/projection-service/src/ND.ProjectionService.Infrastructure/BackgroundServices/MesConnectionStatusPoller.cs`
- `services/projection-service/src/ND.ProjectionService.Infrastructure/DependencyInjection/ServiceCollectionExtensions.cs`
- `services/projection-service/src/ND.ProjectionService.Api/Program.cs`
- `docker-compose.yml`
- `services/kiosk-ui/frontend/src/hooks/useDashboard.ts`
- `services/kiosk-ui/frontend/src/pages/DashboardPage.tsx`
- `shared/ND.Infrastructure/Messaging/IRabbitMqPublisher.cs`
- `shared/ND.Infrastructure/Messaging/RabbitMqPublisher.cs`
- `services/mqtt-adapter/src/ND.StationGateway.Infrastructure/Messaging/OutboxProcessorWorker.cs`
  - Warms the existing RabbitMQ publisher during idle periods so readiness does not depend on a pending outbox row.

## Verification

- Confirmed the old banner no longer reads `gateway-01` status.
- Confirmed simulator/manual sources are excluded from gateway telemetry.
- Confirmed an idle reachable HTTP path maps to `IDLE`, not `OFFLINE`.
- The host-only `npm run build` could not run because this checkout lacks installed frontend dependencies; the Docker Kiosk build restored dependencies and completed TypeScript/Vite successfully.
- Station Gateway, Projection, and Kiosk Docker builds completed successfully.
- Live verification after restart: Station Gateway and Projection returned `status=IDLE`, `stationGatewayStatus=READY`, and `rabbitMqStatus=CONNECTED` with zero requests. Quiet HTTP traffic is therefore not shown as Offline.

## Operational requirements

Station Gateway and Projection must share `station-net`. Projection must receive `STATION_GATEWAY_URL=http://station-gateway:5001`. The direct status endpoint is internal and should not be exposed publicly without existing network controls.
