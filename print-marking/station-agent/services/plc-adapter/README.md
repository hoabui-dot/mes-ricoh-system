# PLC Adapter Service

The **PLC Adapter Service** communicates with Programmable Logic Controllers (PLCs) on the factory floor (such as Modbus TCP or OPC-UA systems). It is exposed as an HTTP service listening on port **5006**.

## Purpose
- Manages connection registry to PLC hardware.
- Processes control commands (e.g. trigger robotic reject arms, query barcode sensor triggers, command conveyor belt movement).
- Collects robotic pick-and-place success events and registers values from sensors.

## Database & Schema (`plc.db`)
- **`plc_devices`**: Metadata of connected PLCs, protocol (Modbus TCP/OPC UA), IP addresses, and state.
- **`plc_commands`**: Queue and history of control messages dispatched to the PLC.
- **`plc_events`**: Hardware signals triggered by the machinery (like pick start/stop, conveyor movement).
- **`plc_robot_pick_events`**: Feedback logs from pick-and-place systems verifying if product picking succeeded or failed.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Running Redis instance (defaults to `localhost:6379`)

### Steps to Run
1. Navigate to the API folder:
   ```bash
   cd services/plc-adapter/src/ND.PlcAdapter.Api
   ```
2. Run the application:
   ```bash
   ASPNETCORE_URLS=http://localhost:5006 dotnet run
   ```

### Configuration Variables
- `ASPNETCORE_URLS`: Configures the server listening endpoint (default: `http://localhost:5006`).
- `SQLITE_PLC_PATH`: Overrides the path to the database file (default: `data/plc.db`).
- `REDIS_CONNECTION_STRING`: Connection properties for Redis (default: `localhost:6379`).
