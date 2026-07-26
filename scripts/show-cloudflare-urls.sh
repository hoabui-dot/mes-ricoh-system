#!/usr/bin/env bash

# Report live Cloudflare Quick Tunnel hostnames. Missing endpoints are explicit.
set -u

URL_REGISTRY="${CLOUDFLARE_URLS_FILE:-infra/cloudflared/current-urls.env}"
if [[ -r "$URL_REGISTRY" ]]; then
  # shellcheck disable=SC1090
  source "$URL_REGISTRY"
fi

url_from_source() {
  local source="$1"
  if [[ ! -r "$source" ]]; then
    return 0
  fi

  grep -Eo 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' "$source" 2>/dev/null \
    | grep -Ev '^https://api\.trycloudflare\.com$' \
    | tail -1 || true
}

tunnel_process_running() {
  local port="$1"
  pgrep -f "[c]loudflared tunnel .*127\.0\.0\.1:${port}([[:space:]]|$)" >/dev/null 2>&1
}

ensure_tunnel_process() {
  local port="$1"
  local log="/tmp/cloudflared-${port}-runtime.log"
  local cloudflared="${CLOUDFLARED_BIN:-/usr/local/bin/cloudflared}"
  local unit="cloudflared-console-${port}.service"

  [[ "$port" == "18080" ]] && return 0
  tunnel_process_running "$port" && return 0
  [[ -x "$cloudflared" ]] || return 0

  # Do not reuse an append-only log: it may contain an expired Quick Tunnel
  # hostname from a previous process.
  : >"$log" 2>/dev/null || true

  # Prefer a transient user-systemd unit. It survives the npm shell and
  # restarts automatically without requiring root to install a system unit.
  if command -v systemd-run >/dev/null 2>&1 && systemctl --user is-system-running >/dev/null 2>&1; then
    systemd-run --user --unit="${unit%.service}" --property=Restart=always --property=RestartSec=5 --property="StandardOutput=append:${log}" --property="StandardError=append:${log}" "$cloudflared" tunnel --no-autoupdate --url "http://127.0.0.1:${port}" >/dev/null 2>&1 || true
  else
    nohup "$cloudflared" tunnel --no-autoupdate --url "http://127.0.0.1:${port}" >>"$log" 2>&1 </dev/null &
    disown 2>/dev/null || true
  fi
}

url_is_live() {
  local url="$1"
  local status
  [[ -n "$url" ]] || return 1
  command -v curl >/dev/null 2>&1 || return 1
  status="$(curl -L -k -sS --max-time 12 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || printf '000')"
  [[ "$status" =~ ^[234][0-9][0-9]$ ]]
}

url_has_dns() {
  local url="$1"
  local host="${url#https://}"
  host="${host%%/*}"
  command -v getent >/dev/null 2>&1 && getent hosts "$host" >/dev/null 2>&1
}

restart_tunnel_process() {
  local port="$1"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user stop "cloudflared-console-${port}.service" >/dev/null 2>&1 || true
  fi
  pkill -f "[c]loudflared tunnel .*127\\.0\\.0\\.1:${port}([[:space:]]|$)" >/dev/null 2>&1 || true
  sleep 1
}

url_for_tunnel() {
  local port="$1"
  local unit="$2"
  local url=""
  local source
  local process_was_running=0

  if [[ "$port" == "18080" ]] || tunnel_process_running "$port"; then
    process_was_running=1
  fi

  ensure_tunnel_process "$port"

  local sources=("/tmp/cloudflared-${port}-runtime.log")
  if [[ "$process_was_running" == "1" ]]; then
    sources+=("/home/neurosus/cloudflared-${port}.log" "/home/neurosus/cloudflared-mes-${port}.log" "/tmp/cloudflared-${port}.log")
  fi
  for source in "${sources[@]}"; do
    url="$(url_from_source "$source")"
    if [[ -n "$url" ]]; then
      break
    fi
  done

  if [[ -z "$url" ]] && command -v journalctl >/dev/null 2>&1; then
    url="$(journalctl -u "$unit" --no-pager -n 300 2>/dev/null \
      | grep -Eo 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' \
      | grep -Ev '^https://api\.trycloudflare\.com$' \
      | tail -1 || true)"
  fi

  if [[ -z "$url" ]] && command -v journalctl >/dev/null 2>&1; then
    url="$(journalctl --user -u "cloudflared-console-${port}.service" --no-pager -n 100 2>/dev/null \
      | grep -Eo 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' \
      | grep -Ev '^https://api\.trycloudflare\.com$' \
      | tail -1 || true)"
  fi

  # Cloudflare assigns the hostname asynchronously. Wait for the newly
  # started user unit before falling back to the registry.
  if [[ -z "$url" ]]; then
    local attempt
    for attempt in $(seq 1 30); do
      sleep 1
      for source in "${sources[@]}"; do
        url="$(url_from_source "$source")"
        [[ -n "$url" ]] && break
      done
      if [[ -z "$url" ]] && command -v journalctl >/dev/null 2>&1; then
        url="$(journalctl --user -u "cloudflared-console-${port}.service" --no-pager -n 100 2>/dev/null \
          | grep -Eo 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' \
          | grep -Ev '^https://api\.trycloudflare\.com$' \
          | tail -1 || true)"
      fi
      [[ -n "$url" ]] && break
    done
  fi

  # Quick Tunnel processes can remain alive after their hostname has expired.
  # DNS failure is enough to prove that the log entry is stale; restart only
  # the console tunnel for this port and read a new runtime log.
  if [[ -n "$url" ]] && ! url_has_dns "$url" && [[ "$port" != "18080" ]]; then
    restart_tunnel_process "$port"
    : >"/tmp/cloudflared-${port}-runtime.log" 2>/dev/null || true
    ensure_tunnel_process "$port"
    url=""
    process_was_running=0
    sources=("/tmp/cloudflared-${port}-runtime.log")
    local retry
    for retry in $(seq 1 30); do
      sleep 1
      url="$(url_from_source "/tmp/cloudflared-${port}-runtime.log")"
      [[ -n "$url" ]] && break
    done
  fi

  # A previous run may have left an expired hostname in the append-only log.
  # Prefer the current transient unit's latest hostname when that happens.
  if [[ -n "$url" ]] && [[ "${CLOUDFLARE_VALIDATE_URLS:-0}" == "1" ]] && ! url_is_live "$url" && command -v journalctl >/dev/null 2>&1; then
    local fresh_url
    fresh_url="$(journalctl --user -u "cloudflared-console-${port}.service" --no-pager -n 100 2>/dev/null \
      | grep -Eo 'https://[A-Za-z0-9.-]+\.trycloudflare\.com' \
      | grep -Ev '^https://api\.trycloudflare\.com$' \
      | tail -1 || true)"
    [[ -n "$fresh_url" ]] && url="$fresh_url"
  fi

  if [[ -z "$url" ]]; then
    case "$port" in
      13000) url="${CLOUDFLARE_PORTAL_URL:-}" ;;
      13052) url="${CLOUDFLARE_MES_URL:-}" ;;
      13091) url="${CLOUDFLARE_WMS_URL:-}" ;;
      13130) url="${CLOUDFLARE_QMS_URL:-}" ;;
      18000) url="${CLOUDFLARE_API_URL:-}" ;;
      18080) url="${CLOUDFLARE_SSO_URL:-}" ;;
    esac
  fi

  # Use the registry only as a fallback. It can contain an expired hostname
  # after a Quick Tunnel restart, so it is never authoritative by itself.
  case "$port" in
    13000) [[ -z "$url" && -n "${CLOUDFLARE_PORTAL_URL:-}" ]] && url="$CLOUDFLARE_PORTAL_URL" ;;
    13052) [[ -z "$url" && -n "${CLOUDFLARE_MES_URL:-}" ]] && url="$CLOUDFLARE_MES_URL" ;;
    13091) [[ -z "$url" && -n "${CLOUDFLARE_WMS_URL:-}" ]] && url="$CLOUDFLARE_WMS_URL" ;;
    13130) [[ -z "$url" && -n "${CLOUDFLARE_QMS_URL:-}" ]] && url="$CLOUDFLARE_QMS_URL" ;;
    18000) [[ -z "$url" && -n "${CLOUDFLARE_API_URL:-}" ]] && url="$CLOUDFLARE_API_URL" ;;
    18080) [[ -z "$url" && -n "${CLOUDFLARE_SSO_URL:-}" ]] && url="$CLOUDFLARE_SSO_URL" ;;
  esac

  if [[ -n "$url" ]] && { [[ "${CLOUDFLARE_VALIDATE_URLS:-0}" != "1" ]] || url_is_live "$url"; }; then
    printf '%s' "$url"
  else
    printf 'NONE'
  fi
}

printf 'Cloudflare URLs\n'
printf 'Portal: %s\n' "$(url_for_tunnel 13000 cloudflared-console@13000.service)"
printf 'MES: %s\n' "$(url_for_tunnel 13052 cloudflared-console@13052.service)"
printf 'WMS: %s\n' "$(url_for_tunnel 13091 cloudflared-console@13091.service)"
printf 'QMS: %s\n' "$(url_for_tunnel 13130 cloudflared-console@13130.service)"
printf 'API: %s\n' "$(url_for_tunnel 18000 cloudflared-console@18000.service)"
printf 'SSO: %s\n' "$(url_for_tunnel 18080 cloudflared-mes-18080.service)"
