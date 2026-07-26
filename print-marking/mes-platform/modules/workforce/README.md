# Workforce Module

## Purpose
The Workforce module is responsible for keeping track of physical factory workers, organizational groupings (departments, workshops, teams), skill catalogs, the proficiency mapping matrix, and worker certifications.

## Responsibilities
- Manage organizational structures hierarchy: Departments -> Workshops -> Teams.
- Register and maintain the factory's global Skills catalog.
- Manage Worker records, personal info, contact info, and status (Active, Inactive, Terminated).
- Record and manage the Skill Matrix (mapping worker to proficiency level 1-4 for specific skills).
- Record and track valid worker Certificates (issuing authority, validity dates, certificate numbers).
- Expose worker availability status updates (Available, On Leave, Suspended).
- Publish workforce domain events via the transactional outbox pattern.

## Directory Structure
- `/domain/entity/`: Workers, Skills, Certs, Departments, Workshops, Teams, and workforce events definitions.
- `/domain/repository/`: Abstract interfaces for data layers.
- `/application/dto/`: Input/Output payloads.
- `/application/service/`: Coordinates business transactions and validations.
- `/infrastructure/model/`: GORM physical models.
- `/infrastructure/persistence/`: GORM repository implementations.
- `/presentation/handler/`: Thin Gin request controllers.
- `/presentation/route/`: Gin routing registration.

## Routing Mapping
All endpoints are prefix-grouped under `/api/v1/`:
- `POST /api/v1/departments` — Create department.
- `GET /api/v1/departments` — List departments.
- `POST /api/v1/departments/:id/workshops` — Create workshop.
- `GET /api/v1/workshops` — List workshops.
- `POST /api/v1/workshops/:id/teams` — Create team.
- `GET /api/v1/teams` — List teams.
- `POST /api/v1/skills` — Create skill.
- `GET /api/v1/skills` — List skills.
- `POST /api/v1/workers` — Create worker.
- `GET /api/v1/workers` — List workers (supports search, status, availability, dept, workshop, team, skill filters and pagination).
- `GET /api/v1/workers/:id` — Get worker details.
- `PUT /api/v1/workers/:id` — Update worker information.
- `DELETE /api/v1/workers/:id` — Delete worker.
- `PATCH /api/v1/workers/:id/availability` — Update availability.
- `PUT /api/v1/workers/:id/skills` — Update worker skill matrix.
- `POST /api/v1/workers/:id/certificates` — Add certificate.
- `GET /api/v1/workers/:id/certificates` — List worker certificates.
