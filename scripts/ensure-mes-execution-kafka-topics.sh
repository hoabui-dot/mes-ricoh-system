#!/usr/bin/env bash
set -euo pipefail

KAFKA_CONTAINER="${KAFKA_CONTAINER:-platform-kafka}"
BOOTSTRAP="${KAFKA_BOOTSTRAP:-localhost:9092}"
PARTITIONS="${KAFKA_TOPIC_PARTITIONS:-3}"
REPLICATION_FACTOR="${KAFKA_TOPIC_REPLICATION_FACTOR:-1}"

topics=(
  MES.Execution.OperationFailed.v1
  MES.Execution.OperationAborted.v1
  MES.Execution.OperationRetryRequested.v1
  MES.Execution.WOStatusChanged.v1
)

for topic in "${topics[@]}"; do
  docker exec "$KAFKA_CONTAINER" kafka-topics \
    --bootstrap-server "$BOOTSTRAP" \
    --create \
    --if-not-exists \
    --topic "$topic" \
    --partitions "$PARTITIONS" \
    --replication-factor "$REPLICATION_FACTOR"
done

for topic in "${topics[@]}"; do
  docker exec "$KAFKA_CONTAINER" kafka-topics \
    --bootstrap-server "$BOOTSTRAP" \
    --describe \
    --topic "$topic"
done
