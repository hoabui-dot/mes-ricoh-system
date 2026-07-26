#!/bin/bash

# Get directory where script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
PID_FILE="$SCRIPT_DIR/services.pid"

echo "=== ND Station Agent Database Cleanup ==="

# Check if services are running
if [ -f "$PID_FILE" ]; then
    echo "[!] Services are currently running (PID file exists at $PID_FILE)."
    echo "[*] Please run kill-all.sh first before cleaning up databases."
    exit 1
fi

echo "Searching for SQLite database files to remove..."

# Find all database files in services and sqlite-databases directories
DB_FILES=$(find "$ROOT_DIR/services" "$ROOT_DIR/sqlite-databases" \( -name "*.db" -o -name "*.db-wal" -o -name "*.db-shm" \) 2>/dev/null)

if [ -z "$DB_FILES" ]; then
    echo "[+] No SQLite database files found."
    exit 0
fi

echo "[*] Deleting the following SQLite database files:"
echo "$DB_FILES"
echo ""

# Remove files
echo "$DB_FILES" | while read -r file; do
    if [ -n "$file" ] && [ -f "$file" ]; then
        rm -f "$file"
        echo "  [-] Deleted: $(basename "$file") at $(dirname "$file" | sed "s|$ROOT_DIR/||")"
    fi
done

echo "[+] Cleanup complete. Database tables will be re-created on next service startup."
