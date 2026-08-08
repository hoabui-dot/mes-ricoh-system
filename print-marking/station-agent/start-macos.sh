#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-macos.sh  –  macOS-safe launcher for the station-agent stack
#
# Root cause of the Docker Desktop I/O errors:
#   • Docker Desktop's containerd store can end up with incomplete / corrupted
#     ingest blobs after a failed pull.  The fix is to purge the dangling
#     blobs, then retry with native ARM64 images for the infrastructure tier.
#
# Root cause of "cannot allocate memory" errors:
#   • By default, docker compose builds ALL services in parallel.
#   • Each `dotnet publish` consumes ~1.5 GB RAM.
#   • 9 services × 1.5 GB = ~13 GB peak → OOM on 8–16 GB Mac.
#   • Fix: build services one at a time (--parallel 1) then start them all.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.macos.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE"

# ── Optional flags ─────────────────────────────────────────────────────────
# Pass --skip-build to skip rebuild (just restart containers with current images)
SKIP_BUILD=false
for arg in "$@"; do
  if [[ "$arg" == "--skip-build" ]]; then
    SKIP_BUILD=true
  fi
done

# ── 1. Clean up stale Docker artifacts ─────────────────────────────────────
echo "▶ Pruning dangling/incomplete Docker build cache & pull blobs …"
docker builder prune -f --filter type=exec.cachemount 2>/dev/null || true
docker image prune -f 2>/dev/null || true

# ── 2. Pre-pull native ARM64 infrastructure images ──────────────────────────
echo "▶ Pre-pulling infrastructure images (native ARM64) one at a time …"
docker pull --platform linux/arm64 redis:7.4-alpine
docker pull --platform linux/arm64 rabbitmq:3.13-management-alpine
docker pull --platform linux/arm64 eclipse-mosquitto:2.0

# ── 3. Sequential build (prevents OOM from parallel dotnet publish) ─────────
if [[ "$SKIP_BUILD" == "false" ]]; then
  echo ""
  echo "▶ Building application images sequentially to avoid OOM …"
  echo "  (Each dotnet publish uses ~1.5 GB RAM; parallel builds exhaust memory)"
  echo ""

  # Services that require a build (infra images are pre-pulled above)
  BUILD_SERVICES=(
    station-gateway
    job-engine
    printer-adapter
    laser-adapter
    vision-service
    plc-adapter
    kiosk-ui
    device-simulator
    projection-service
  )

  for svc in "${BUILD_SERVICES[@]}"; do
    echo "  🔨 Building $svc …"
    $COMPOSE_CMD build --no-cache=false "$svc"
    echo "  ✅ $svc built"
    echo ""
  done

  echo "▶ All application images built successfully."
else
  echo "▶ Skipping build (--skip-build passed). Using existing images."
fi

# ── 4. Start the whole stack ─────────────────────────────────────────────────
echo ""
echo "▶ Starting station-agent stack …"
$COMPOSE_CMD up -d

echo ""
echo "✅ Stack started."
echo ""
echo "Useful commands:"
echo "  Logs:          docker compose -f docker-compose.macos.yml logs -f"
echo "  Stop:          docker compose -f docker-compose.macos.yml down"
echo "  Restart only:  ./start-macos.sh --skip-build"
echo "  Status:        docker compose -f docker-compose.macos.yml ps"
