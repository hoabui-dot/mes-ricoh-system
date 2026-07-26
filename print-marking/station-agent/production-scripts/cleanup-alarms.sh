#!/bin/bash

# ============================================================
# cleanup-alarms.sh — ND Station Agent (production-scripts/)
#
# Cleans projection_alarms rows from the SQLite database.
# Temporarily stops only the projection-service container to
# release the SQLite WAL lock, runs the DELETE, then restarts.
#
# Compose file : docker-compose.prod.yml
# Container    : station-projection-service
# DB bind-mount: ./sqlite-databases/projection.db
# ============================================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

CONTAINER="station-projection-service"
DB_FILE="$ROOT_DIR/sqlite-databases/projection.db"

echo "=== ND Station Agent — Alarm Data Cleanup ==="
echo ""

# ── Check sqlite3 ────────────────────────────────────────────────────────────
if ! command -v sqlite3 &>/dev/null; then
    echo "[!] 'sqlite3' is not installed."
    echo "    Install: brew install sqlite  (macOS) | apt install sqlite3 (Linux)"
    exit 1
fi

# ── Check DB exists ───────────────────────────────────────────────────────────
if [ ! -f "$DB_FILE" ]; then
    echo "[!] Database not found at: $DB_FILE"
    echo "    Start the stack first: docker compose -f docker-compose.prod.yml up -d"
    exit 1
fi

echo "[*] Database  : $DB_FILE"
echo "[*] Container : $CONTAINER"
echo ""

# ── Parse flags ───────────────────────────────────────────────────────────────
MODE="all"
DAYS=0
FORCE=false

for arg in "$@"; do
    case "$arg" in
        --active-only)   MODE="active" ;;
        --days=*)        MODE="older-than"; DAYS="${arg#--days=}" ;;
        --force|-f)      FORCE=true ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "  (no flags)        Delete ALL alarms"
            echo "  --active-only     Delete only Active (unacknowledged) alarms"
            echo "  --days=N          Delete alarms older than N days"
            echo "  --force, -f       Skip confirmation prompt"
            echo ""
            exit 0
            ;;
    esac
done

# ── Stop container to release WAL lock ───────────────────────────────────────
CONTAINER_WAS_RUNNING=false
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    CONTAINER_WAS_RUNNING=true
    echo "[*] Stopping $CONTAINER to release SQLite WAL lock..."
    docker stop "$CONTAINER" >/dev/null
    sleep 1
fi

# ── Integrity check ───────────────────────────────────────────────────────────
echo "[*] Checking database integrity..."
INTEGRITY=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
    echo "[!] Database is CORRUPTED: $INTEGRITY"
    echo ""
    echo "    To recover, delete the corrupted file and restart the container:"
    echo "      rm -f $DB_FILE ${DB_FILE}-shm ${DB_FILE}-wal"
    if [ "$CONTAINER_WAS_RUNNING" = true ]; then
        echo "[*] Restarting $CONTAINER..."
        docker start "$CONTAINER" >/dev/null
    fi
    exit 1
fi
echo "[+] Integrity OK."
echo ""

# ── Show counts ───────────────────────────────────────────────────────────────
TOTAL=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM projection_alarms;" 2>/dev/null || echo "0")
ACTIVE=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM projection_alarms WHERE current_state = 'Active';" 2>/dev/null || echo "0")
ACKED=$(sqlite3  "$DB_FILE" "SELECT COUNT(*) FROM projection_alarms WHERE current_state = 'Acknowledged';" 2>/dev/null || echo "0")

echo "    Current alarm counts:"
echo "      Total       : $TOTAL"
echo "      Active      : $ACTIVE"
echo "      Acknowledged: $ACKED"
echo ""

# ── Build SQL ─────────────────────────────────────────────────────────────────
case "$MODE" in
    all)
        SQL="DELETE FROM projection_alarms;"
        DESCRIPTION="ALL alarms ($TOTAL rows)"
        ;;
    active)
        SQL="DELETE FROM projection_alarms WHERE current_state = 'Active';"
        DESCRIPTION="Active (unacknowledged) alarms ($ACTIVE rows)"
        ;;
    older-than)
        SQL="DELETE FROM projection_alarms WHERE created_at < datetime('now', '-${DAYS} days');"
        DESCRIPTION="Alarms older than $DAYS days"
        ;;
esac

echo "[!] About to delete: $DESCRIPTION"
echo ""

if [ "$FORCE" = false ]; then
    read -r -p "    Proceed? [y/N] " confirm
    case "$confirm" in
        [yY][eE][sS]|[yY]) ;;
        *)
            echo "[x] Aborted — no data was deleted."
            if [ "$CONTAINER_WAS_RUNNING" = true ]; then
                echo "[*] Restarting $CONTAINER..."
                docker start "$CONTAINER" >/dev/null
            fi
            exit 0
            ;;
    esac
fi

# ── Execute ───────────────────────────────────────────────────────────────────
echo ""
echo "[*] Running cleanup..."
sqlite3 "$DB_FILE" "$SQL"
EXIT_CODE=$?

AFTER=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM projection_alarms;" 2>/dev/null || echo "?")

# ── Restart container ─────────────────────────────────────────────────────────
if [ "$CONTAINER_WAS_RUNNING" = true ]; then
    echo "[*] Restarting $CONTAINER..."
    docker start "$CONTAINER" >/dev/null
    echo "[+] Container restarted."
fi

if [ $EXIT_CODE -ne 0 ]; then
    echo "[!] sqlite3 returned error code $EXIT_CODE."
    exit $EXIT_CODE
fi

echo "[+] Done. Remaining alarm rows: $AFTER"
echo ""
echo "    The Alarm Center UI will reflect the change on next page refresh."
