# Job Engine Service

The **Job Engine Service** is the central state orchestrator of the ND Station Agent platform. It is exposed as an ASP.NET Core Web API listening on port **5002**.

## Purpose
- Coordinates the execution steps (Print, Laser, Vision, PLC) of a job.
- Manages the state machine transitions (Created -> Queued -> Processing -> Completed/Failed/Wait Rework).
- Logs and processes manual supervisor override requests (Force-Pass, Reprint, Relaser, Force-Complete).
- Logs execution attempts and full audits.

## Database & Schema (`job_engine.db`)
- **`job_engine_jobs`**: Contains the job type, payload, priority, current status, and serial values.
- **`job_engine_job_attempts`**: Records of auto/manual run attempts.
- **`job_engine_job_steps`**: Progression details of Print, Laser, Vision, and PLC sub-activities.
- **`job_engine_job_history`**: Direct audit trail of user and system events.
- **`job_engine_state_transitions`**: Log of workflow transitions.
- **`job_engine_overwrite_requests`**: Approval state for supervisor manual commands.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Running Redis instance (defaults to `localhost:6379` for distributed locking and status updates)

### Steps to Run
1. Navigate to the API folder:
   ```bash
   cd services/job-engine/src/ND.JobEngine.Api
   ```
2. Run the application:
   ```bash
   dotnet run
   ```

### Configuration Variables
- `Kestrel__Endpoints__Http__Url`: Exposes the HTTP endpoint (default: `http://0.0.0.0:5002`).
- `ConnectionStrings__Sqlite`: Overrides the SQLite location (default: local `job_engine.db`).
- `ConnectionStrings__Redis`: Overrides the Redis connection string.
