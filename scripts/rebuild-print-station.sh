#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/infra/docker-compose.platform.yml" -f "$ROOT_DIR/infra/docker-compose.print-station.yml")

echo "[print-station] Ensuring shared Kafka is running and topics exist"
"${COMPOSE[@]}" up -d kafka
(cd "$ROOT_DIR" && bash scripts/ensure-mes-print-kafka-topics.sh)

echo "[print-station] Building Projection and Kiosk images against shared platform Kafka"
"${COMPOSE[@]}" build station-projection-service station-kiosk-ui
echo "[print-station] Recreating control-plane services"
"${COMPOSE[@]}" up -d print-station-redis station-projection-service station-kiosk-ui

echo "[print-station] Waiting for health endpoints"
for attempt in $(seq 1 30); do
  projection="$(curl -fsS --max-time 2 http://127.0.0.1:5009/health 2>/dev/null || true)"
  kiosk="$(curl -fsS --max-time 2 http://127.0.0.1:5007/health 2>/dev/null || true)"
  if [[ "$projection" == *'healthy'* && "$kiosk" == *'healthy'* ]]; then
    echo "[print-station] Projection and Kiosk are healthy"
    break
  fi
  if [[ "$attempt" == 30 ]]; then
    echo "[print-station] Health timeout" >&2
    "${COMPOSE[@]}" ps
    exit 1
  fi
  sleep 2
done

echo "[print-station] Running runtime verification"
(cd "$ROOT_DIR" && node scripts/verify-print-station-realtime-flow.mjs)
