#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# push-images.sh
# Multi-platform Smart Build: linux/amd64 + linux/arm64
#
# Uses Docker Buildx cross-compilation:
#   - Build stage runs NATIVELY on host (no QEMU emulation = fast)
#   - dotnet publish -a $TARGETARCH cross-compiles for the target arch
#   - Both platforms are built & pushed in a single buildx invocation
#
# Usage:
#   ./push-images.sh                         # build & push multi-platform (amd64+arm64)
#   ./push-images.sh --arch amd64            # build & push linux/amd64 only
#   ./push-images.sh --arch arm64            # build & push linux/arm64 only (uses Dockerfile.arm64 if present)
#   ./push-images.sh --service kiosk-ui      # build & push one service only (multi-platform)
#   ./push-images.sh --arch arm64 --service kiosk-ui  # build & push linux/arm64 of one service
#   ./push-images.sh --push-only             # docker push existing local images (single-arch only)
#   ./push-images.sh --build-only            # build locally only (no push to registry)
#   ./push-images.sh --no-cache              # force full rebuild (no layer cache)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CONTEXT_DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRY_USER="vanhoadotbui2628"
PLATFORMS="linux/amd64,linux/arm64"   # default: both
BUILDER_NAME="station-agent-multiplatform"
PUSH=true
BUILD=true
NO_CACHE=""
ONLY_SERVICE=""
BUILD_ARCH=""

# ── Parse flags ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --push-only)   BUILD=false ;;
    --build-only)  PUSH=false  ;;
    --no-cache)    NO_CACHE="--no-cache" ;;
    --service)     ONLY_SERVICE="$2"; shift ;;
    --arch)
      BUILD_ARCH="$2"; shift
      case "$BUILD_ARCH" in
        amd64|x86_64) PLATFORMS="linux/amd64" ;;
        arm64|aarch64) PLATFORMS="linux/arm64" ;;
        *) echo "[ERROR] Unknown --arch: $BUILD_ARCH. Use amd64 or arm64." >&2; exit 1 ;;
      esac
      ;;
    --help|-h)
      sed -n '3,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
  shift
done

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
section() {
  echo -e "\n${CYAN}══════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $*${NC}"
  echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
}

# ── Service definitions ────────────────────────────────────────────────────────
# Format: "service_name|image_tag|dockerfile_path"
declare -a SERVICE_DEFS=(
  "station-gateway|${REGISTRY_USER}/station-gateway:latest|services/mqtt-adapter/docker/Dockerfile"
  "job-engine|${REGISTRY_USER}/job-engine:latest|services/job-engine/docker/Dockerfile"
  "printer-adapter|${REGISTRY_USER}/printer-adapter:latest|services/printer-adapter/docker/Dockerfile"
  "laser-adapter|${REGISTRY_USER}/laser-adapter:latest|services/laser-adapter/docker/Dockerfile"
  "vision-service|${REGISTRY_USER}/vision-service:latest|services/vision-service/docker/Dockerfile"
  "plc-adapter|${REGISTRY_USER}/plc-adapter:latest|services/plc-adapter/docker/Dockerfile"
  "kiosk-ui|${REGISTRY_USER}/kiosk-ui:latest|services/kiosk-ui/docker/Dockerfile"
  "device-simulator|${REGISTRY_USER}/device-simulator:latest|services/device-simulator/Dockerfile"
  "projection-service|${REGISTRY_USER}/projection-service:latest|services/projection-service/docker/Dockerfile"
)

# ── Docker login check ────────────────────────────────────────────────────────
section "Docker Hub Authentication"
if ! docker info 2>/dev/null | grep -q "Username"; then
  warn "Not authenticated — running docker login..."
  docker login
fi
info "Registry: docker.io/${REGISTRY_USER}"

if [ "$BUILD" = false ]; then
  # ── Push-only mode (single-arch) ────────────────────────────────────────────
  section "Push-Only Mode (existing local images)"
  FAILED=(); PUSHED=()
  for def in "${SERVICE_DEFS[@]}"; do
    IFS='|' read -r svc img _ <<< "$def"
    [[ -n "$ONLY_SERVICE" && "$svc" != "$ONLY_SERVICE" ]] && continue
    info "Pushing → $img"
    if docker push "$img"; then
      PUSHED+=("$img")
      echo -e "  ${GREEN}✓ pushed${NC}"
    else
      error "Failed: $img"
      FAILED+=("$img")
    fi
  done
else
  FAILED=(); PUSHED=()
  # ── Buildx multi-platform mode ───────────────────────────────────────────────
  section "Setting up Docker Buildx (multi-platform builder)"

  # Create or reuse the multi-platform builder
  if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
    info "Creating new buildx builder: $BUILDER_NAME"
    docker buildx create \
      --name "$BUILDER_NAME" \
      --driver docker-container \
      --platform "$PLATFORMS" \
      --use
  else
    info "Reusing existing buildx builder: $BUILDER_NAME"
    docker buildx use "$BUILDER_NAME"
  fi

  # Bootstrap builder (pulls moby/buildkit if needed)
  docker buildx inspect --bootstrap "$BUILDER_NAME" >/dev/null

  LOGS_DIR="${CONTEXT_DIR}/.build_logs"
  mkdir -p "$LOGS_DIR"
  rm -f "${LOGS_DIR}"/*

  pids=()
  svc_names=()
  images=()
  log_files=()

  for def in "${SERVICE_DEFS[@]}"; do
    IFS='|' read -r svc img dockerfile <<< "$def"
    [[ -n "$ONLY_SERVICE" && "$svc" != "$ONLY_SERVICE" ]] && continue

    # ── Auto-select Dockerfile.arm64 when building for arm64 ──────────────────
    effective_dockerfile="$dockerfile"
    if [[ "$PLATFORMS" == "linux/arm64" ]]; then
      arm_df="${dockerfile%Dockerfile}Dockerfile.arm64"
      if [[ -f "${CONTEXT_DIR}/${arm_df}" ]]; then
        effective_dockerfile="$arm_df"
      fi
    fi

    BUILD_CMD=(
      docker buildx build
      --platform "$PLATFORMS"
      --file "$effective_dockerfile"
      --tag "$img"
      $NO_CACHE
    )

    # Add --push only if push is enabled
    if [ "$PUSH" = true ]; then
      BUILD_CMD+=(--push)
    else
      # Single-platform build-only: load into local docker
      if [[ "$PLATFORMS" != *","* ]]; then
        BUILD_CMD+=(--load)
      fi
    fi

    BUILD_CMD+=("$CONTEXT_DIR")

    log_file="${LOGS_DIR}/${svc}.log"
    info "Starting build for ${CYAN}${svc}${NC} (Log: .build_logs/${svc}.log)..."
    
    # Run in background
    "${BUILD_CMD[@]}" > "$log_file" 2>&1 &
    pids+=($!)
    svc_names+=("$svc")
    images+=("$img")
    log_files+=("$log_file")
  done

  echo ""
  info "Waiting for all parallel builds to complete..."
  echo ""

  for i in "${!pids[@]}"; do
    pid="${pids[$i]}"
    svc="${svc_names[$i]}"
    img="${images[$i]}"
    log_file="${log_files[$i]}"

    wait "$pid"
    exit_status=$?

    if [ $exit_status -eq 0 ]; then
      PUSHED+=("$img")
      echo -e "  ${GREEN}✓ ${svc} completed successfully${NC}"
    else
      error "  ✗ ${svc} failed (exit code $exit_status)"
      echo -e "${RED}══════════════════════════════════════════════════${NC}"
      echo -e "${RED}  Build logs for ${svc}${NC}"
      echo -e "${RED}══════════════════════════════════════════════════${NC}"
      cat "$log_file" || true
      echo -e "${RED}══════════════════════════════════════════════════${NC}"
      FAILED+=("$img")
    fi
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Summary"
echo -e "${GREEN}Success (${#PUSHED[@]}):${NC}"
for img in "${PUSHED[@]}"; do echo "  ✓ $img"; done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Failed (${#FAILED[@]}):${NC}"
  for img in "${FAILED[@]}"; do echo "  ✗ $img"; done
  exit 1
fi

section "Done 🚀  Images pushed to Docker Hub"
