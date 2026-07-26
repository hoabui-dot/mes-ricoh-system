#!/bin/bash

# Get directory where script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/services.pid"

echo "=== ND Station Agent System Stopper ==="

if [ ! -f "$PID_FILE" ]; then
    echo "[!] No PID file found at $PID_FILE."
    echo "[*] Attempting fallback: killing any ND.* processes..."
    
    # Fallback pattern matching
    pkill -f "ND.StationGateway"
    pkill -f "ND.JobEngine"
    pkill -f "ND.PrinterAdapter"
    pkill -f "ND.LaserAdapter"
    pkill -f "ND.VisionService"
    pkill -f "ND.PlcAdapter"
    pkill -f "ND.ProjectionService"
    pkill -f "ND.KioskUi"
    pkill -f "ND.DeviceSimulator"
    
    echo "[+] Done."
    exit 0
fi

# Read PID file and kill processes
while IFS=: read -r name pid; do
    if [ -n "$pid" ]; then
        echo "[*] Stopping $name (PID: $pid)..."
        # Check if process is still running
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            # Give it a moment to stop gracefully, then force kill if needed
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

# Clean up any orphaned processes by port
echo "[*] Releasing all service ports..."
for PORT in 5000 5002 5003 5004 5005 5006 5007 5008 5009 5222 5111; do
    PORT_PID=$(lsof -t -i:$PORT 2>/dev/null)
    if [ -n "$PORT_PID" ]; then
        kill -9 $PORT_PID 2>/dev/null
        echo "[+] Terminated orphaned process on port $PORT (PID: $PORT_PID)."
    fi
done

# Also kill any lingering dotnet/node processes by name
pkill -f "ND.DeviceSimulator" 2>/dev/null
pkill -f "ND.StationGateway" 2>/dev/null
pkill -f "ND.ProjectionService" 2>/dev/null

rm -f "$PID_FILE"
echo "[+] Cleaned up PID file. All services stopped."
