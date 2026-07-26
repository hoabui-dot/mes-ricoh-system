# ND Station Agent - Local Helper Scripts

This directory contains shell scripts to automate starting and stopping all 8 backend services locally for development and testing.

## Files

- **`run-all.sh`**: Checks if Redis is running locally, starts a Docker container for Redis if missing, launches all 8 backend .NET services in the background, and captures their process IDs (PIDs).
- **`kill-all.sh`**: Reads the captured PIDs and terminates the background processes cleanly. If the PID log is missing, it runs a fallback process name match to stop any remaining instances.
- **`cleanup-db.sh`**: Removes **all** SQLite database files (`.db`, `.db-wal`, `.db-shm`) so the entire data layer is reset on next startup. Requires services to be stopped first.
- **`cleanup-alarms.sh`**: **Alarm-only cleanup** — deletes rows from `projection_alarms` without touching any other data or requiring a service restart.
- **`logs/`**: Folder where logs from each background service are written (e.g. `logs/job-engine.log`).

---

## How to Use

### 1. Permissions
Make sure the scripts are executable:
```bash
chmod +x run-all.sh kill-all.sh cleanup-db.sh cleanup-alarms.sh
```

### 2. Start all services
Run the startup script:
```bash
./run-all.sh
```

### 3. Monitor logs
To view the output of a specific service:
```bash
tail -f logs/job-engine.log
```
Or to watch all logs in real-time:
```bash
tail -f logs/*.log
```

### 4. Stop all services
Run the shutdown script:
```bash
./kill-all.sh
```

---

## Alarm Cleanup (`cleanup-alarms.sh`)

Surgically clears alarm data while keeping services running. Supports three modes:

| Command | What it deletes |
|---------|----------------|
| `./cleanup-alarms.sh` | All alarm rows |
| `./cleanup-alarms.sh --active-only` | Only Active (unacknowledged) alarms |
| `./cleanup-alarms.sh --days=7` | Alarms older than 7 days |
| `./cleanup-alarms.sh --active-only --force` | Active alarms, skip confirmation |

The UI alarm banner and Alarm Center will reflect the change on the next poll (within 30 seconds) — no restart needed.
