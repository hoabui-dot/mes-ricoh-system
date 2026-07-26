#!/bin/bash

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/../../.env"

echo "=== Stopping Production Containers ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
