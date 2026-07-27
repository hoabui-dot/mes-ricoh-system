#!/usr/bin/env bash
set -euo pipefail

# Publishes one explicit physical print command to Kafka. It does not use the
# Printer Adapter HTTP print endpoint and never creates a simulator printer.
KAFKA_CONTAINER="${KAFKA_CONTAINER:-platform-kafka}"
KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}"
PRINTER_CODE="${PRINTER_CODE:-Zebra-GK420t-CUPS}"
copies=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --printer) PRINTER_CODE="$2"; shift 2 ;;
    --copies) copies="$2"; shift 2 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[ "$copies" = "1" ] || { printf '[FAIL] Physical test is limited to exactly one copy.\n' >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { printf '[FAIL] docker is required\n' >&2; exit 2; }
docker inspect "$KAFKA_CONTAINER" >/dev/null 2>&1 || { printf '[FAIL] Kafka container %s is unavailable\n' "$KAFKA_CONTAINER" >&2; exit 1; }

test_id="$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
production_order="REMOTE-PRINTER-TEST-${timestamp//[^0-9]/}"

command_json="$(TEST_ID="$test_id" PRODUCTION_ORDER="$production_order" PRINTER_CODE="$PRINTER_CODE" TIMESTAMP="$timestamp" node <<'NODE'
const id = process.env.TEST_ID;
const timestamp = process.env.TIMESTAMP;
const payload = {
  eventId: `evt-remote-printer-test-${id}`,
  productionOrderNo: process.env.PRODUCTION_ORDER,
  jobType: "PRINT_ONLY",
  productCode: "REMOTE-PRINTER-TEST",
  payloadJson: JSON.stringify({ eventId: id, data: [
    { tag: "test.label", value: "REMOTE PRINTER TEST" },
    { tag: "test.id", value: id },
    { tag: "test.printer", value: process.env.PRINTER_CODE },
    { tag: "test.timestamp", value: timestamp }
  ]}),
  targetPrinter: process.env.PRINTER_CODE,
  dispatchTarget: "production-printer",
  labelItems: [{ jobId: `remote-printer-test-${id}`, productSerial: id, sequence: 1 }],
  batchSize: 1,
  timestamp
};
const envelope = {
  eventId: payload.eventId,
  eventType: "command.printer.print.batch",
  eventVersion: 1,
  occurredAt: timestamp,
  source: "manual-physical-printer-test",
  correlationId: payload.eventId,
  causationId: null,
  stationId: process.env.PRINT_STATION_ID || "PRINT-STATION-01",
  workstationId: process.env.WORKSTATION_ID || null,
  partitionKey: process.env.PRINT_STATION_ID || "PRINT-STATION-01",
  payload
};
process.stdout.write(JSON.stringify(envelope));
NODE
)"

printf '%s:%s\n' "$production_order" "$command_json" | docker exec -i "$KAFKA_CONTAINER" kafka-console-producer \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic station.commands.printer \
  --property parse.key=true \
  --property key.separator=: \
  >/dev/null

printf '[PASS] Published one Kafka print command for %s\n' "$PRINTER_CODE"
printf '[INFO] event=%s order=%s\n' "$test_id" "$production_order"
printf '[INFO] Confirm printer.printed/printer.batch.printed, Job Engine state, and Projection/Kiosk state before declaring physical success.\n'
