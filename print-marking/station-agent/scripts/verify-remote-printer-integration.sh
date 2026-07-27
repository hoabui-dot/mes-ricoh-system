#!/usr/bin/env bash
set -u

# Read-only verification for the remote Printer Adapter path. The script never
# publishes a command and never calls POST /api/print.

ADAPTER_URL="${PRINTER_ADAPTER_URL:-http://100.68.50.41:5003}"
PROJECTION_URL="${PROJECTION_SERVICE_URL:-http://127.0.0.1:5009}"
KIOSK_URL="${KIOSK_URL:-http://127.0.0.1:5007}"
KAFKA_BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-100.68.50.41:19092}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-platform-kafka}"
KAFKA_CONNECTION_NAME="${KAFKA_CONNECTION_NAME:-PRINT-ADAPTER-01}"
PRINTER_CODE="${PRINTER_CODE:-Zebra-GK420t-CUPS}"
CUPS_QUEUE="${CUPS_QUEUE:-Zebra_Technologies_ZTC_GK420t}"
KAFKA_TOPICS=(
  station.commands.printer
  station.events.printer
  station.events.jobs
  station.events.devices
  station.events.production
  station.events.integration
  station.dlq
)

failures=0

pass_check() { printf '[PASS] %s\n' "$1"; }
fail_check() { printf '[FAIL] %s\n' "$1"; failures=$((failures + 1)); }
warn_check() { printf '[WARN] %s\n' "$1"; }
skip_check() { printf '[SKIPPED] %s\n' "$1"; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    fail_check "Required command '$1' is not installed"
    return 1
  }
}

json_get() {
  local expression="$1"
  node -e '
    const fs = require("fs");
    const expression = process.argv[1];
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) process.exit(0);
    const value = JSON.parse(raw);
    const field = (obj, name) => obj == null ? undefined : obj[name];
    const simple = expression.match(/^\.(\w+)$/);
    if (simple) {
      const result = field(value, simple[1]);
      if (result !== undefined && result !== null) process.stdout.write(String(result));
      process.exit(0);
    }
    const selected = expression.match(/^\.\[\] \| select\(\.(\w+) == "([^"]+)"\)(?: \| \.(\w+))?$/);
    if (!selected || !Array.isArray(value)) process.exit(0);
    const result = value.find(item => String(field(item, selected[1])) === selected[2]);
    if (!result) process.exit(0);
    const output = selected[3] ? field(result, selected[3]) : result;
    if (output !== undefined && output !== null)
      process.stdout.write(typeof output === "object" ? JSON.stringify(output) : String(output));
  ' "$expression"
}

json_has() {
  local expression="$1"
  node -e '
    const fs = require("fs");
    const expression = process.argv[1];
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) process.exit(1);
    const value = JSON.parse(raw);
    const selected = expression.match(/^\.\[\] \| select\(\.(\w+) == "([^"]+)"\)$/);
    process.exit(selected && Array.isArray(value) && value.some(item => String(item[selected[1]]) === selected[2]) ? 0 : 1);
  ' "$expression"
}

http_get() {
  curl -fsS --max-time "${HTTP_TIMEOUT_SECONDS:-8}" "$1"
}

printf 'Remote Printer Adapter Integration Verification\n'
printf 'Adapter: %s\nProjection: %s\nKiosk: %s\n\n' "$ADAPTER_URL" "$PROJECTION_URL" "$KIOSK_URL"

require_command curl || exit 2
require_command node || exit 2

health_json="$(http_get "$ADAPTER_URL/api/health" 2>/dev/null || true)"
if [ -n "$health_json" ] && [ "$(printf '%s' "$health_json" | json_get '.service')" = "printer-adapter" ]; then
  pass_check "Printer Adapter HTTP health"
else
  fail_check "Printer Adapter HTTP health"
fi

KAFKA_HOST="${KAFKA_BOOTSTRAP_SERVERS%%,*}"
KAFKA_HOST="${KAFKA_HOST%%:*}"
KAFKA_PORT="${KAFKA_BOOTSTRAP_SERVERS##*:}"
if printf '' >/dev/tcp/"$KAFKA_HOST"/"$KAFKA_PORT" 2>/dev/null; then
  pass_check "Kafka TCP connection to $KAFKA_BOOTSTRAP_SERVERS"
else
  fail_check "Kafka TCP connection to $KAFKA_BOOTSTRAP_SERVERS"
fi

if command -v docker >/dev/null 2>&1 && docker inspect "$KAFKA_CONTAINER" >/dev/null 2>&1; then
  topic_list="$(docker exec "$KAFKA_CONTAINER" kafka-topics --bootstrap-server localhost:9092 --list 2>/dev/null || true)"
  for topic in "${KAFKA_TOPICS[@]}"; do
    if printf '%s\n' "$topic_list" | grep -Fxq "$topic"; then pass_check "Kafka topic $topic"; else fail_check "Kafka topic $topic"; fi
  done
else
  skip_check "Kafka topic checks (container $KAFKA_CONTAINER is unavailable)"
fi

printers_json="$(http_get "$ADAPTER_URL/api/printers" 2>/dev/null || true)"
printer_json="$(printf '%s' "$printers_json" | json_get ".[] | select(.printerCode == \"$PRINTER_CODE\")" 2>/dev/null || true)"
if [ -n "$printer_json" ]; then
  pass_check "Printer $PRINTER_CODE registered"
else
  fail_check "Printer $PRINTER_CODE registered"
fi

printer_status="$(printf '%s' "$printer_json" | json_get '.status')"
printer_queue="$(printf '%s' "$printer_json" | json_get '.cupsQueueName')"
if [ "$printer_status" = "ONLINE" ]; then pass_check "Printer status ONLINE"; else fail_check "Printer status ONLINE (actual: ${printer_status:-unknown})"; fi
if [ "$printer_queue" = "$CUPS_QUEUE" ]; then pass_check "CUPS queue $CUPS_QUEUE"; else fail_check "CUPS queue $CUPS_QUEUE (actual: ${printer_queue:-unknown})"; fi

projection_json="$(http_get "$PROJECTION_URL/api/projection/devices" 2>/dev/null || true)"
if printf '%s' "$projection_json" | json_has ".[] | select(.deviceId == \"$PRINTER_CODE\")"; then
  pass_check "Projection device state found for $PRINTER_CODE"
else
  fail_check "Projection device state found for $PRINTER_CODE"
fi

before_heartbeat="$(printf '%s' "$projection_json" | json_get ".[] | select(.deviceId == \"$PRINTER_CODE\") | .lastSeenAt")"
sleep "${HEARTBEAT_WAIT_SECONDS:-17}"
after_projection="$(http_get "$PROJECTION_URL/api/projection/devices" 2>/dev/null || true)"
after_heartbeat="$(printf '%s' "$after_projection" | json_get ".[] | select(.deviceId == \"$PRINTER_CODE\") | .lastSeenAt")"
if [ -n "$before_heartbeat" ] && [ -n "$after_heartbeat" ] && [ "$before_heartbeat" != "$after_heartbeat" ]; then
  pass_check "Recent printer.heartbeat projected ($before_heartbeat -> $after_heartbeat)"
else
  fail_check "Recent printer.heartbeat projected"
fi

kiosk_status="$(curl -sS -o /tmp/kiosk-printer-state.json -w '%{http_code}' --max-time "${HTTP_TIMEOUT_SECONDS:-8}" "$KIOSK_URL/api/projection/devices" 2>/dev/null || true)"
if [ "$kiosk_status" = "200" ]; then
  pass_check "Kiosk reads projected printer state"
elif [ "$kiosk_status" = "401" ] || [ "$kiosk_status" = "403" ]; then
  skip_check "Kiosk projected-state API requires an authenticated browser session"
else
  fail_check "Kiosk reads projected printer state (HTTP ${kiosk_status:-unreachable})"
fi
rm -f /tmp/kiosk-printer-state.json

printf '\nResult: %s\n' "$([ "$failures" -eq 0 ] && printf 'PASS' || printf 'FAIL')"
exit "$([ "$failures" -eq 0 ] && printf 0 || printf 1)"
