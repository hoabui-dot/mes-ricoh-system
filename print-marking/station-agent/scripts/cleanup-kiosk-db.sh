#!/bin/bash

# Get directory where script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
PID_FILE="$SCRIPT_DIR/services.pid"

echo "=== ND Station Agent Kiosk DB Cleanup ==="

# Check if services are running
if [ -f "$PID_FILE" ]; then
    echo "[!] Services are currently running."
    echo "[*] Please run kill-all.sh first before cleaning up databases."
    exit 1
fi

KIOSK_DB_PATH="$ROOT_DIR/services/kiosk-ui/src/ND.KioskUi.Api/data/kiosk.db"
KIOSK_PROD_DB_PATH="$ROOT_DIR/sqlite-databases/kiosk.db"

echo "[*] Deleting Kiosk SQLite database files..."
rm -f "$KIOSK_DB_PATH" "${KIOSK_DB_PATH}-wal" "${KIOSK_DB_PATH}-shm"
rm -f "$KIOSK_PROD_DB_PATH" "${KIOSK_PROD_DB_PATH}-wal" "${KIOSK_PROD_DB_PATH}-shm"
echo "[+] Deleted Kiosk database files successfully."

# Re-create and seed the database files immediately
echo "[*] Initializing and seeding Kiosk DB..."
cd "$ROOT_DIR/services/kiosk-ui/src/ND.KioskUi.Api"

echo "  [-] Seeding local dev database..."
dotnet run -- --seed-only

if [ -d "$ROOT_DIR/sqlite-databases" ]; then
    echo "  [-] Seeding production volume database..."
    SQLITE_KIOSK_PATH="$KIOSK_PROD_DB_PATH" dotnet run -- --seed-only
fi

echo "[+] Done. Kiosk DB has been re-created and seeded."
