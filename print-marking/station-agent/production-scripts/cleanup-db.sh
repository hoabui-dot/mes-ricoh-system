#!/bin/bash

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/../../.env"
DB_DIR="$SCRIPT_DIR/../sqlite-databases"

echo "=== Cleaning Up Production Databases ==="
echo "[*] Stopping containers..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down

echo "[*] Removing SQLite database files in $DB_DIR..."
if [ -d "$DB_DIR" ]; then
    rm -f "$DB_DIR"/*.db "$DB_DIR"/*.db-shm "$DB_DIR"/*.db-wal
    echo "[+] SQLite database files removed."
else
    echo "[-] Database directory $DB_DIR does not exist."
fi

echo "[*] Starting containers..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

echo "[+] Database cleanup complete."
