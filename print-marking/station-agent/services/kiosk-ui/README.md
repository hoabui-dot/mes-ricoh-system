# Kiosk UI Service

The **Kiosk UI Service** provides a real-time web dashboard and supervisor override interface for operators on the factory floor. It comprises an ASP.NET Core Web API backend with a SignalR hub and a React + Vite frontend.

## Architecture
1. **Backend API (`src/ND.KioskUi.Api`)**:
   - Exposes authentication endpoints (JWT token issue).
   - Hosts the SignalR `DashboardHub` (`/hubs/dashboard`) to push real-time printer, laser, and job updates to the screen.
   - Audits manual actions and user authentication in local SQLite tables.
   - Listens on port **5007**.
2. **Frontend client (`frontend`)**:
   - React + Vite SPA showing real-time logs, active job progress, device heartbeats, and supervisor command buttons (reprint, relaser, force pass, force complete).
   - Defaults to port **5222** during development.

## Database & Schema (`kiosk.db`)
- **`kiosk_users`** / **`kiosk_roles`** / **`kiosk_permissions`**: User identities, roles (ADMIN, SUPERVISOR, OPERATOR, QA), and granular security actions.
- **`kiosk_user_roles`** / **`kiosk_role_permissions`**: Many-to-many relationship mapping.
- **`kiosk_sessions`**: Live JWT session records.
- **`kiosk_access_logs`**: Full audit log tracking manual overrides and administrative activities.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Node.js 20+ and npm
- Running Redis instance (defaults to `localhost:6379`)

### Steps to Run

#### 1. Start the Backend API
```bash
cd services/kiosk-ui/src/ND.KioskUi.Api
ASPNETCORE_URLS=http://localhost:5007 dotnet run
```

#### 2. Start the React Frontend Client
```bash
cd services/kiosk-ui/frontend
npm install
npm run dev
```
Open your browser and navigate to `http://localhost:5222`.
- **Default Credentials**: `admin` / `Admin@123`

---

## Configuration Variables
- `ASPNETCORE_URLS`: Port configuration for the API backend (default: `http://localhost:5007`).
- `SQLITE_KIOSK_PATH`: SQLite database directory mapping (default: `data/kiosk.db`).
- `REDIS_CONNECTION_STRING`: Connection string for Redis.
- `Jwt__Secret`: Signing key for generating JWT tokens (minimum 256 bits recommended).
- `Jwt__Issuer` & `Jwt__Audience`: Token validator keys.
- `Jwt__ExpiryMinutes`: Token validity duration (default: `480`).
