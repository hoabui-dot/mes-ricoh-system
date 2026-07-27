#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/infra/docker-compose.platform.yml" -f "$ROOT_DIR/infra/docker-compose.print-station.yml")

echo "[print-station] Ensuring shared Kafka is running and topics exist"
"${COMPOSE[@]}" up -d kafka
(cd "$ROOT_DIR" && bash scripts/ensure-mes-print-kafka-topics.sh)

exec "${COMPOSE[@]}" up -d --force-recreate print-station-redis station-projection-service station-kiosk-ui
