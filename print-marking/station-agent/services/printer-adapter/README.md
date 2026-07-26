# Printer Adapter Service

The **Printer Adapter Service** controls industrial label printers (e.g. Zebra or Honeywell printers communicating over port 9100 using ZPL/TSPL protocols). It is exposed as an HTTP service listening on port **5003**.

## Purpose
- Manages local printers (failover pools, status checking, templates).
- Receives job requests from the **Job Engine** to format, compile, and send print commands (like raw ZPL commands) via raw socket/TCP connections to Zebra/Honeywell printers.
- Logs printer diagnostics and paper status.

## Database & Schema (`printer.db`)
- **`printer_printers`**: Registered printers, display names, IP addresses, vendor models, and online/offline state.
- **`printer_jobs`**: Contains the label rendering payload and status (`PENDING`, `SENT`, `SUCCESS`, `FAILED`).
- **`printer_events`**: Incidents like paper roll exhaustion, printing errors, or cover opens.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Running Redis instance (defaults to `localhost:6379` for caching and state management)

### Steps to Run
1. Navigate to the API folder:
   ```bash
   cd services/printer-adapter/src/ND.PrinterAdapter.Api
   ```
2. Run the application:
   ```bash
   ASPNETCORE_URLS=http://localhost:5003 dotnet run
   ```

### Configuration Variables
- `ASPNETCORE_URLS`: Configures the server listening endpoint (default: `http://localhost:5003`).
- `SQLITE_PRINTER_PATH`: Path override for the database file (default: `data/printer.db`).
- `REDIS_CONNECTION_STRING`: Connection properties for Redis (default: `localhost:6379`).
