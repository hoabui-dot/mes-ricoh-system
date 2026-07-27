#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_CONTEXT="$ROOT_DIR/print-marking/station-agent"
DOCKERFILE="$BUILD_CONTEXT/services/printer-adapter/docker/Dockerfile"
RELEASE_TAG="${PRINTER_ADAPTER_RELEASE_TAG:-20260727}"
IMAGE_BASE="${PRINTER_ADAPTER_IMAGE_BASE:-vanhoadotbui2628/printer-adapter:real-printers-no-simulator-${RELEASE_TAG}}"
AMD_IMAGE="${PRINTER_ADAPTER_AMD_IMAGE:-${IMAGE_BASE}-amd64}"
ARM_IMAGE="${PRINTER_ADAPTER_ARM_IMAGE:-${IMAGE_BASE}-arm64}"
UI_DOCKERFILE="$BUILD_CONTEXT/services/printer-adapter-ui/docker/Dockerfile"
UI_BASE="${PRINTER_ADAPTER_UI_IMAGE_BASE:-vanhoadotbui2628/printer-adapter-ui:kafka-monitoring-${RELEASE_TAG}}"
UI_AMD_IMAGE="${PRINTER_ADAPTER_UI_AMD_IMAGE:-${UI_BASE}-amd64}"
UI_ARM_IMAGE="${PRINTER_ADAPTER_UI_ARM_IMAGE:-${UI_BASE}-arm64}"
UI_MULTI_IMAGE="${PRINTER_ADAPTER_UI_MULTI_IMAGE:-${UI_BASE}}"
PUSH_IMAGES="${PRINTER_ADAPTER_PUSH:-true}"
BUILDER_NAME="${PRINTER_ADAPTER_BUILDER:-station-agent-multiplatform}"
NO_CACHE="${PRINTER_ADAPTER_NO_CACHE:-true}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'ERROR: docker is required.\n' >&2
  exit 1
fi

printf 'Printer Adapter image build\n'
printf 'Build context: %s\n\n' "$BUILD_CONTEXT"

printf 'Printer Adapter AMD64: %s\nPrinter Adapter ARM64: %s\n' "$AMD_IMAGE" "$ARM_IMAGE"
printf 'Printer Adapter UI AMD64: %s\nPrinter Adapter UI ARM64: %s\nPrinter Adapter UI multi-platform: %s\n' "$UI_AMD_IMAGE" "$UI_ARM_IMAGE" "$UI_MULTI_IMAGE"
printf 'Push images: %s\n\n' "$PUSH_IMAGES"
printf 'Release tag: %s\nNo cache: %s\n\n' "$RELEASE_TAG" "$NO_CACHE"

build_image() {
  local label="$1" platform="$2" tag="$3" dockerfile="$4"
  local -a cache_args=()
  if [[ "$NO_CACHE" == "true" ]]; then cache_args+=(--no-cache); fi
  printf '[%s] Building %s for %s\n' "$label" "$tag" "$platform"
  if [[ "$PUSH_IMAGES" == "true" ]]; then
    docker buildx build \
      --builder "$BUILDER_NAME" \
      --platform "$platform" \
      "${cache_args[@]}" \
      --provenance=false \
      --file "$dockerfile" \
      --tag "$tag" \
      --push \
      "$BUILD_CONTEXT"
    local actual
    actual="$(docker buildx imagetools inspect --format '{{.Image.Architecture}}' "$tag" 2>/dev/null | tail -n 1)"
  else
    docker buildx build \
      --builder "$BUILDER_NAME" \
      --platform "$platform" \
      "${cache_args[@]}" \
      --provenance=false \
      --file "$dockerfile" \
      --tag "$tag" \
      --load \
      "$BUILD_CONTEXT"
    local actual
    actual="$(docker image inspect --format '{{.Architecture}}' "$tag")"
  fi
  local expected="${platform##*/}"
  if [[ "$actual" != "$expected" ]]; then
    printf 'ERROR: %s was published as %s, expected %s. Refusing to continue.\n' "$tag" "$actual" "$expected" >&2
    exit 1
  fi
  printf '  Image: %s\n  Platform: linux/%s (verified)\n\n' "$tag" "$actual"
}

create_multi_platform_tag() {
  local tag="$1" amd="$2" arm="$3"
  [[ "$PUSH_IMAGES" == "true" ]] || return 0
  docker buildx imagetools create --tag "$tag" "$amd" "$arm" >/dev/null
  local platforms
  platforms="$(docker buildx imagetools inspect "$tag" 2>/dev/null || true)"
  if ! grep -q 'linux/amd64' <<<"$platforms" || ! grep -q 'linux/arm64' <<<"$platforms"; then
    printf 'ERROR: multi-platform tag %s does not contain both linux/amd64 and linux/arm64.\n' "$tag" >&2
    exit 1
  fi
  printf '  Multi-platform tag: %s (linux/amd64 + linux/arm64 verified)\n\n' "$tag"
}

build_image '1/4' linux/amd64 "$AMD_IMAGE" "$DOCKERFILE"
build_image '2/4' linux/arm64 "$ARM_IMAGE" "$DOCKERFILE"
build_image '3/4' linux/amd64 "$UI_AMD_IMAGE" "$UI_DOCKERFILE"
build_image '4/4' linux/arm64 "$UI_ARM_IMAGE" "$UI_DOCKERFILE"

# The unsuffixed tags are the tags consumed by generic Compose deployments.
# They must be manifests, never a single architecture accidentally pushed last.
create_multi_platform_tag "$IMAGE_BASE" "$AMD_IMAGE" "$ARM_IMAGE"
create_multi_platform_tag "$UI_MULTI_IMAGE" "$UI_AMD_IMAGE" "$UI_ARM_IMAGE"

printf '\nBuild complete\n'
printf 'Printer Adapter AMD64: %s\n' "$AMD_IMAGE"
printf 'Printer Adapter ARM64: %s\n' "$ARM_IMAGE"
printf 'Printer Adapter UI AMD64: %s\n' "$UI_AMD_IMAGE"
printf 'Printer Adapter UI ARM64: %s\n' "$UI_ARM_IMAGE"
printf 'Printer Adapter multi-platform: %s\n' "$IMAGE_BASE"
printf 'Printer Adapter UI multi-platform: %s\n' "$UI_MULTI_IMAGE"
if [[ "$PUSH_IMAGES" == "true" ]]; then
  printf 'Registry: Docker Hub push completed for all architecture tags and multi-platform manifests.\n'
else
  printf 'Registry: not pushed (PRINTER_ADAPTER_PUSH=false).\n'
fi
