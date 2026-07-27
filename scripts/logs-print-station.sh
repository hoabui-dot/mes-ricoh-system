#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec docker compose -f "$ROOT_DIR/infra/docker-compose.platform.yml" -f "$ROOT_DIR/infra/docker-compose.print-station.yml" logs --tail=200 "$@" station-projection-service station-kiosk-ui
