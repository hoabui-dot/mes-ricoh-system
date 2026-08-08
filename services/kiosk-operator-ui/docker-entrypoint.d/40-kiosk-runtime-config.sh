#!/bin/sh
set -eu

escape_js() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/config.js <<EOF
window.__KIOSK_CONFIG__ = {
  gatewayUrl: "$(escape_js "${PUBLIC_GATEWAY_URL:-}")",
  websocketUrl: "$(escape_js "${PUBLIC_WS_URL:-}")",
  keycloakUrl: "$(escape_js "${VITE_KEYCLOAK_URL:-}")",
  demoCredentialsEnabled: ${KIOSK_DEMO_CREDENTIALS_ENABLED:-false},
  demoUsername: "$(escape_js "${KIOSK_DEMO_USERNAME:-}")",
  demoPassword: "$(escape_js "${KIOSK_DEMO_PASSWORD:-}")"
};
EOF
