# Projection Module

The Projection module generates and exposes denormalized read-models optimized for factory dashboards, statistics, and real-time operations telemetry. It computes dashboard snapshots and time-series statistics directly from module databases using an asynchronous read-model builder pattern and streams updates via Server-Sent Events (SSE).

## 1. Key Responsibilities
- **Dashboard snapshot calculations**: Rebuild factory-wide status snapshot totals (active work orders, order state distributions, worker availability stats, assignment counts, average assignment scores).
- **Time-series production order statistics**: Materialize daily, weekly, and monthly totals of created, completed, and cancelled orders, average cycle times, and units produced.
- **Worker utilization stats**: Maintain leaderboards of worker assignments, approval rates, and performance/assignment scores over selected intervals.
- **Real-time telemetry**: Stream dashboard snapshots immediately upon connection and push real-time updates over HTTP SSE channels.

---

## 2. Components
- `readmodel/`: Read-only view objects representing snapshots and statistics.
- `builder/`: An on-demand and background service querying active transaction schemas to compute fresh projections.
- `service/`: Exposes queries, coordinates periodic builder updates, and maintains a thread-safe registry of active SSE streaming subscribers.
- `presentation/`: Gin controllers handling dashboard GET queries, manual projection refreshes, and SSE streaming channels.

---

## 3. API Route Registry

All endpoints require JWT authorization:

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/v1/dashboard` | Fetch the current day's dashboard snapshot (materialized automatically if missing) |
| `POST` | `/api/v1/dashboard/refresh` | Force-trigger a rebuild of the dashboard snapshot |
| `GET` | `/api/v1/dashboard/stats/orders` | Fetch historic order statistics (optional filters: `period=daily/weekly/monthly`, `limit=N`) |
| `GET` | `/api/v1/dashboard/stats/workers` | Fetch worker utilization stats leaderboard (optional filters: `period=daily/weekly/monthly`, `limit=N`) |
| `GET` | `/api/v1/dashboard/stream` | Open a Server-Sent Events (SSE) stream returning snapshots and real-time updates |

---

## 4. SSE Stream Format
The `/dashboard/stream` endpoint returns real-time payloads under the event type `snapshot`:
```event-stream
event: snapshot
data: {"id":"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d","snapshot_date":"2026-07-01T00:00:00Z","total_orders":12,"draft_orders":2,"released_orders":5,"in_progress_orders":4,"completed_orders":1,"cancelled_orders":0,"total_work_orders":15,"pending_work_orders":5,"active_work_orders":7,"completed_work_orders":3,"total_workers":20,"available_workers":18,"on_leave_workers":2,"open_assignments":4,"approved_assignments":8,"avg_assignment_score":87.5,"computed_at":"2026-07-01T12:00:00Z"}
```
A lightweight keep-alive heartbeat (`: heartbeat\n\n`) is written every 30 seconds to keep load balancers and proxies from terminating idle connections.
