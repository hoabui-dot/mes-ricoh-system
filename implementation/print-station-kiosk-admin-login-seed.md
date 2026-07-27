# Print Station Kiosk Admin Login Seed

Date: 2026-07-26

## Finding

The Kiosk UI on port `5007` was healthy, but the requested `admin` account was absent. The existing `KioskDbSeeder` only created `admin123` / `admin123`, so `POST /api/auth/login` returned HTTP 401 for `admin` and HTTP 200 for `admin123`.

## Seed update

Updated `KioskDbSeeder` to idempotently ensure both super-admin accounts:

- `admin` / `admin123` is the canonical documented demo login.
- `admin123` / `admin123` remains as a legacy compatibility login.

For each account the seed ensures an active user, a valid BCrypt password hash, and the `SUPER_ADMIN` role. Existing unrelated users and data are preserved. The RBAC delete/toggle guards and frontend protected-admin constant now recognize the canonical account as protected; the legacy account remains protected as well.

## Runtime execution

The Kiosk UI image was rebuilt and restarted with:

```bash
docker compose -f print-marking/station-agent/docker-compose.yml up -d --build kiosk-ui
```

Because the service runs `EnsureCreatedAsync()` and `KioskDbSeeder.SeedAsync()` at startup, the current `sqlite-databases/kiosk.db` was enriched without deleting existing data.

## Verification

- `http://100.68.50.41:5007/health` returned HTTP 200.
- `admin` / `admin123` returned HTTP 200 and a token containing `SYSTEM_ADMIN`.
- `admin123` / `admin123` returned HTTP 200 for backward compatibility.
- Container `station-kiosk-ui` is running after rebuild.

