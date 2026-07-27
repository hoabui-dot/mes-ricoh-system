#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml)
SERVICES=(
  mes-master-data-service
  mes-execution-service
  mes-traceability-service
  mes-kiosk-gateway-service
  kiosk-operator-ui
  mes-console
)

echo "Rebuilding MES services"
"${COMPOSE[@]}" build "${SERVICES[@]}"
echo "Recreating MES services"
"${COMPOSE[@]}" up -d --no-build --force-recreate "${SERVICES[@]}"
echo "MES services"
"${COMPOSE[@]}" ps "${SERVICES[@]}"
