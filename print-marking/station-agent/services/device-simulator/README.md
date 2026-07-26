# Device Simulator Service

The **Device Simulator Service** is a simulation suite that mocks the physical hardware devices (industrial printer, laser marker, vision inspection camera, and PLC). It comprises a .NET Web API backend and a React + Vite dashboard.

## Simulated Devices & Ports
The simulator opens TCP/HTTP endpoints locally to match actual device connectivity:
- **Printer Server**: Listens on TCP port **9100** (ZPL/raw commands).
- **Laser Server**: Listens on TCP port **8901** (raw marking commands).
- **PLC Server**: Listens on Modbus TCP port **5020**.
- **Vision Server**: Exposed via Web API endpoints (`/api/vision/...`).
- **Simulator Web Dashboard & REST API**: Listens on port **5000** (or port **5008** mapping inside Docker Compose).

## Database (`device-simulator.db`)
- Manages local SQLite data regarding device states, register triggers, and telemetry logs.
- Automatically handles fallback to local folder `data/` if the target path is not write-accessible.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Node.js 20+ and npm
- Running Redis instance (defaults to `localhost:6379`)

### Steps to Run

#### 1. Start the Simulator Backend API
```bash
cd services/device-simulator/src/ND.DeviceSimulator.Api
dotnet run
```
By default, this launches under the `Development` profile setting port **5000** and using `device-simulator-dev.db` locally.

#### 2. Start the React Dashboard Client
```bash
cd services/device-simulator/frontend
npm install
npm run dev
```

---

## Key Configurations
Configure setting variables via `appsettings.json` or Environment Overrides:
- `ConnectionStrings__Sqlite`: Overrides the SQLite path (default: `device-simulator.db`).
- `ConnectionStrings__Redis`: Overrides the Redis connection string.
- `Simulator__PRINTER_FAILURE_RATE`: Probability (%) of printer failures.
- `Simulator__LASER_FAILURE_RATE`: Probability (%) of laser marking failures.
- `Simulator__VISION_PASS_RATE`: Pass probability (%) of camera checks.
