1#!/bin/bash

# Get directory where script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
PID_FILE="$SCRIPT_DIR/services.pid"
LOGS_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOGS_DIR"

echo "=== ND Station Agent System Runner ==="

# 1. Check if Redis is running locally
if ! nc -z localhost 6379 &>/dev/null; then
    echo "[!] Redis is not running on localhost:6379."
    echo "[*] Attempting to start Redis via Docker..."
    docker run -d --name station-redis-local -p 6379:6379 redis:7.4-alpine &>/dev/null
    if [ $? -eq 0 ]; then
        echo "[+] Successfully started Redis in Docker container 'station-redis-local'."
    else
        echo "[-] Failed to start Redis. Please make sure Redis or Docker is running."
        exit 1
    fi
else
    echo "[+] Redis is already running on localhost:6379."
fi

# 2. Check if a run is already active
if [ -f "$PID_FILE" ]; then
    echo "[-] PID file already exists at $PID_FILE. Services might already be running."
    echo "[*] Please run kill-all.sh first."
    exit 1
fi

echo "Starting services in background..."
touch "$PID_FILE"

# Helper function to start a dotnet service
# Usage: start_dotnet_service <name> <relative-path> <port-description> [KEY=VALUE ...]
start_dotnet_service() {
    local name=$1
    local path=$2
    local port_desc=$3
    shift 3
    local env_pairs=("$@")

    echo "[*] Starting $name on port $port_desc..."
    local svc_dir="$ROOT_DIR/$path"

    (
        cd "$svc_dir" || exit 1
        # Export all passed env vars in this subshell
        for kv in "${env_pairs[@]}"; do
            export "$kv"
        done
        # Wait 10s then start tailing logs (shows startup output after 10s)
        dotnet run 2>&1 | (sleep 10 && cat > "$LOGS_DIR/$name.log") &
        # Also keep a direct log (no delay, captures everything from start)
        dotnet run 2>&1 > "$LOGS_DIR/$name.log" &
        echo $!
    ) &
    local pid=$!
    echo "$name:$pid" >> "$PID_FILE"
    echo "[+] Started $name (PID: $pid). Logs: scripts/logs/$name.log"
}

# Helper function to start a dotnet service (simple, reliable version)
start_service() {
    local name=$1
    local path=$2
    local port_desc=$3
    shift 3
    # Remaining args are KEY=VALUE environment variable pairs

    echo "[*] Starting $name on port $port_desc..."
    local svc_dir="$ROOT_DIR/$path"

    (
        cd "$svc_dir" || exit 1
        for kv in "$@"; do
            export "$kv"
        done
        dotnet run > "$LOGS_DIR/$name.log" 2>&1
    ) &
    local pid=$!
    echo "$name:$pid" >> "$PID_FILE"
    echo "[+] Started $name (PID: $pid). Log will appear after 10s: scripts/logs/$name.log"

    # Give this service a brief moment to start binding ports
    sleep 0.3
}

# Helper function to start a Node/NPM service
start_node_service() {
    local name=$1
    local path=$2
    local port=$3
    local cmd=$4

    echo "[*] Starting $name on port $port..."
    (
        cd "$ROOT_DIR/$path" || exit 1
        eval "$cmd" > "$LOGS_DIR/$name.log" 2>&1
    ) &
    local pid=$!
    echo "$name:$pid" >> "$PID_FILE"
    echo "[+] Started $name (PID: $pid). Logs: scripts/logs/$name.log"
}

# ── Start all backend services ─────────────────────────────────────────────────
start_service "station-gateway" "services/mqtt-adapter/src/ND.StationGateway.Api"         "5001" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "SQLITE_GATEWAY_PATH=data/gateway.db" \
    "ASPNETCORE_URLS=http://localhost:5001"

start_service "job-engine"      "services/job-engine/src/ND.JobEngine.Api"                 "5002" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "SIMULATOR_HOST=localhost" \
    "SIMULATOR_PORT=5000"

start_service "printer-adapter" "services/printer-adapter/src/ND.PrinterAdapter.Api"       "5003" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "ASPNETCORE_URLS=http://localhost:5003"

start_service "laser-adapter"   "services/laser-adapter/src/ND.LaserAdapter.Api"           "5004" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "ASPNETCORE_URLS=http://localhost:5004" \
    "Laser__Host=localhost" \
    "Laser__Port=8901"

start_service "vision-service"  "services/vision-service/src/ND.VisionService.Api"         "5005" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "ASPNETCORE_URLS=http://localhost:5005"

start_service "plc-adapter"     "services/plc-adapter/src/ND.PlcAdapter.Api"               "5006" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "ASPNETCORE_URLS=http://localhost:5006"

start_service "projection-service" "services/projection-service/src/ND.ProjectionService.Api" "5009" \
    "ASPNETCORE_ENVIRONMENT=Development" \
    "ASPNETCORE_URLS=http://localhost:5009"

# Kiosk UI backend API — port 5007 is defined in appsettings.json (Kestrel config)
start_service "kiosk-ui"        "services/kiosk-ui/src/ND.KioskUi.Api"                    "5007" \
    "ASPNETCORE_ENVIRONMENT=Development"

# Kiosk UI React frontend — proxies to kiosk-ui API on port 5007
start_node_service "kiosk-ui-frontend" "services/kiosk-ui/frontend" "5222" "npm run dev"

echo ""
echo "=== All services started! ==="
echo "[*] Frontend UI:     http://localhost:5222  (Kiosk UI)"
echo "[*] Kiosk API:       http://localhost:5007  (Backend API)"
echo "[*] Projection API:  http://localhost:5009  (SignalR + CQRS Queries)"
echo "[*] Job Engine:      http://localhost:5002"
echo "[*] To view logs:    tail -f scripts/logs/<service>.log"
echo "[*] To stop all:     scripts/kill-all.sh"

