#!/usr/bin/env bash
set -euo pipefail

KAFKA_CONTAINER="${KAFKA_CONTAINER:-platform-kafka}"
BOOTSTRAP="${KAFKA_BOOTSTRAP:-localhost:9092}"

docker inspect "$KAFKA_CONTAINER" >/dev/null 2>&1 || {
  echo "Kafka container $KAFKA_CONTAINER is not running" >&2
  exit 1
}

for topic in station.events.printer station.events.production station.events.integration station.events.devices; do
  docker exec "$KAFKA_CONTAINER" kafka-topics \
    --bootstrap-server "$BOOTSTRAP" \
    --create --if-not-exists \
    --topic "$topic" --partitions 3 --replication-factor 1 >/dev/null
  echo "Kafka topic ready: $topic"
done

docker exec "$KAFKA_CONTAINER" kafka-topics --bootstrap-server "$BOOTSTRAP" --list \
  | grep -E '^station\.events\.(printer|production|integration|devices)$'
