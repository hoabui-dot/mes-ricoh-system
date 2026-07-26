# Planning Module

## Purpose
The Planning module is responsible for defining work shift templates, scheduling daily shifts, assigning teams and individual workers to shifts, managing leaves, and tracking overtime approvals.

## Responsibilities
- Create and manage factory Work Shift Templates (Day, Evening, Night shifts, start and end times).
- Instantiated Daily Shifts scheduling on the calendar.
- Assign Workforce Teams to daily shifts (Team Assignments).
- Assign individual Workers to daily shifts with role specifications (Worker Assignments).
- Prevent scheduling overlapping worker assignments (validation checks).
- Maintain factory Holidays catalog.
- Request, Approve, or Reject Worker Leaves requests (validating against pending or approved leave dates overlap).
- Request, Approve, or Reject Worker Overtime hours logs.
- Publish planning events to RabbitMQ via transactional outbox worker.

## Directory Structure
- `/domain/entity/`: ShiftTemplate, Shift, Holiday, Leave, Overtime entities, and planning events definitions.
- `/domain/repository/`: Abstract ports interfaces for GORM repositories.
- `/application/dto/`: Input/Output API payload structures.
- `/application/service/`: Coordinates daily schedule rules, validation constraints and transactions.
- `/infrastructure/model/`: GORM database schemas.
- `/infrastructure/persistence/`: GORM repository concrete adapters.
- `/presentation/handler/`: Gin HTTP REST controller actions.
- `/presentation/route/`: Gin routing registration.

## Routing Mapping
All endpoints are prefix-grouped under `/api/v1/`:
- `POST /api/v1/shift-templates` — Create shift template.
- `GET /api/v1/shift-templates` — List shift templates.
- `POST /api/v1/shifts` — Create daily shift calendar entry.
- `GET /api/v1/shifts` — List shifts within date ranges.
- `POST /api/v1/shifts/:id/teams` — Assign team to shift.
- `POST /api/v1/shifts/:id/workers` — Assign worker to shift.
- `POST /api/v1/holidays` — Add public holiday.
- `GET /api/v1/holidays` — List holidays within date ranges.
- `POST /api/v1/leaves` — Request leave.
- `PATCH /api/v1/leaves/:id/approve` — Approve leave request.
- `PATCH /api/v1/leaves/:id/reject` — Reject leave request.
- `GET /api/v1/leaves` — List leave requests (filters: worker_id, status).
- `POST /api/v1/overtimes` — Log overtime hours request.
- `PATCH /api/v1/overtimes/:id/approve` — Approve overtime request.
- `PATCH /api/v1/overtimes/:id/reject` — Reject overtime request.
- `GET /api/v1/overtimes` — List overtime requests (filters: worker_id, status).
