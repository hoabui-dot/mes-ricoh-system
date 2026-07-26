#!/bin/bash

# Get directory where script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
PID_FILE="$SCRIPT_DIR/simulator.pid"
LOGS_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOGS_DIR"

usage() {
    echo "Usage: $0 {start|stop|status}"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

ACTION=$1

case "$ACTION" in
    start)
        echo "=== Starting Device Simulator Services ==="
        
        # Check if already running via PID file
        if [ -f "$PID_FILE" ]; then
            echo "[-] PID file already exists at $PID_FILE. Services might already be running."
            echo "[*] Please stop them first using: $0 stop"
            exit 1
        fi
        
        # Check if port 5111 (frontend) is already occupied
        FE_PORT_PID=$(lsof -t -i:5111 2>/dev/null)
        if [ -n "$FE_PORT_PID" ]; then
            echo "[-] Port 5111 is already in use by process PID $FE_PORT_PID."
            echo "[!] Cannot start frontend. Please clean up the port or run: $0 stop"
            exit 1
        fi

        # Check if backend (dotnet process) is already running
        SIM_BACKEND_PID=$(pgrep -f "ND.DeviceSimulator" | tr '\n' ' ' | xargs)
        if [ -n "$SIM_BACKEND_PID" ]; then
            echo "[-] Device Simulator backend (ND.DeviceSimulator) is already running (PID: $SIM_BACKEND_PID)."
            echo "[!] Please stop it first using: $0 stop"
            exit 1
        fi

        touch "$PID_FILE"

        # 1. Start backend API (Port 5000)
        echo "[*] Starting Device Simulator Backend API on port 5000..."
        (
            cd "$ROOT_DIR/services/device-simulator/src/ND.DeviceSimulator.Api" || exit 1
            export ASPNETCORE_ENVIRONMENT=Development
            dotnet run > "$LOGS_DIR/device-simulator-api.log" 2>&1
        ) &
        API_PID=$!
        echo "backend:$API_PID" >> "$PID_FILE"
        echo "[+] Started Backend API (PID: $API_PID). Logs: scripts/logs/device-simulator-api.log"

        # Wait a moment for backend to initialize
        sleep 3

        # 2. Start frontend dashboard (Port 5111)
        echo "[*] Starting Device Simulator React Dashboard on port 5111..."
        (
            cd "$ROOT_DIR/services/device-simulator/frontend" || exit 1
            npm run dev > "$LOGS_DIR/device-simulator-frontend.log" 2>&1
        ) &
        FE_PID=$!
        echo "frontend:$FE_PID" >> "$PID_FILE"
        echo "[+] Started React Dashboard (PID: $FE_PID). Logs: scripts/logs/device-simulator-frontend.log"

        echo ""
        echo "=== Device Simulator started! ==="
        echo "[*] Dashboard UI: http://localhost:5111"
        echo "[*] Backend API:  http://localhost:5000"
        echo "[*] To stop:      $0 stop"
        ;;
        
    stop)
        echo "=== Stopping Device Simulator Services ==="
        
        # Kill by PID file if exists
        if [ -f "$PID_FILE" ]; then
            while IFS=: read -r name pid; do
                if [ -n "$pid" ]; then
                    echo "[*] Stopping $name (PID: $pid)..."
                    if kill -0 "$pid" 2>/dev/null; then
                        kill "$pid"
                        sleep 0.5
                        if kill -0 "$pid" 2>/dev/null; then
                            kill -9 "$pid"
                        fi
                        echo "[+] Stopped $name."
                    else
                        echo "[?] $name (PID: $pid) was not running."
                    fi
                fi
            done < "$PID_FILE"
            rm -f "$PID_FILE"
        fi

        # Double check and release ports
        echo "[*] Releasing simulator ports..."
        
        # Terminate port 5111 (frontend)
        FE_PORT_PID=$(lsof -t -i:5111 2>/dev/null)
        if [ -n "$FE_PORT_PID" ]; then
            kill -9 $FE_PORT_PID 2>/dev/null
            echo "[+] Terminated orphaned process on port 5111 (PID: $FE_PORT_PID)."
        fi

        # Terminate port 5000 processes only if they are dotnet processes
        API_PORT_PIDS=$(lsof -t -i:5000 2>/dev/null)
        for p in $API_PORT_PIDS; do
            if ps -p "$p" -o comm= 2>/dev/null | grep -E -q "dotnet|ND.DeviceSimulator"; then
                kill -9 "$p" 2>/dev/null
                echo "[+] Terminated simulator backend process on port 5000 (PID: $p)."
            fi
        done

        # Kill by process name pattern
        pkill -f "ND.DeviceSimulator" 2>/dev/null
        
        echo "[+] Device Simulator services stopped."
        ;;
        
    status)
        echo "=== Device Simulator Status ==="
        API_RUNNING=0
        FE_RUNNING=0
        
        # Check port 5000 process
        API_PID=""
        API_PIDS=$(lsof -t -i:5000 2>/dev/null)
        for p in $API_PIDS; do
            if ps -p "$p" -o comm= 2>/dev/null | grep -E -q "dotnet|ND.DeviceSimulator"; then
                API_PID="$p"
            fi
        done
        
        # Fallback to checking via process name search
        if [ -z "$API_PID" ]; then
            API_PID=$(pgrep -f "ND.DeviceSimulator" | tr '\n' ' ' | xargs)
        fi

        if [ -n "$API_PID" ]; then
            echo "[+] Backend API: Running (PID: $API_PID)"
            API_RUNNING=1
        else
            echo "[-] Backend API: NOT running"
        fi

        FE_PID=$(lsof -t -i:5111 2>/dev/null | tr '\n' ' ' | xargs)
        if [ -n "$FE_PID" ]; then
            echo "[+] Dashboard UI: Running on port 5111 (PID: $FE_PID)"
            FE_RUNNING=1
        else
            echo "[-] Dashboard UI: NOT running"
        fi
        
        if [ $API_RUNNING -eq 1 ] && [ $FE_RUNNING -eq 1 ]; then
            echo "[*] Overall status: HEALTHY"
        elif [ $API_RUNNING -eq 0 ] && [ $FE_RUNNING -eq 0 ]; then
            echo "[*] Overall status: STOPPED"
        else
            echo "[!] Overall status: DEGRADED (one of the services is down)"
        fi
        ;;

        
    *)
        usage
        ;;
esac
