# Laser Adapter Service

The **Laser Adapter Service** manages communication with industrial laser marking machines. It is exposed as an HTTP service listening on port **5004**.

## Purpose
- Registers laser marking machines and endpoint credentials.
- Compiles marking commands and templates to be sent via vendor SDKs, TCP sockets, or REST APIs.
- Coordinates marking starts and finishes, logging real-time laser device health to Redis and database tables.

## Database & Schema (`laser.db`)
- **`laser_lasers`**: Holds laser machine metadata, connection types (SDK/TCP/REST), endpoints, and health status.
- **`laser_jobs`**: Log of laser execution attempts, marking templates, and status (`PENDING`, `SENT`, `SUCCESS`, `FAILED`).
- **`laser_events`**: Hardware diagnostics like system temperature warnings, ready signals, or marking errors.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Running Redis instance (defaults to `localhost:6379`)

### Steps to Run
1. Navigate to the API folder:
   ```bash
   cd services/laser-adapter/src/ND.LaserAdapter.Api
   ```
2. Run the application:
   ```bash
   ASPNETCORE_URLS=http://localhost:5004 dotnet run
   ```

### Configuration Variables
- `ASPNETCORE_URLS`: Configures the server listening endpoint (default: `http://localhost:5004`).
- `SQLITE_LASER_PATH`: Overrides the path to the database file (default: `data/laser.db`).
- `REDIS_CONNECTION_STRING`: Connection properties for Redis (default: `localhost:6379`).
