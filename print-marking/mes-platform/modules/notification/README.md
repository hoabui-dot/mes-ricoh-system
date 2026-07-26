# Notification Module

The Notification module handles transactional and user-targeted notifications across multiple alerting channels (Email and In-App). It functions by consuming published domain events over RabbitMQ and exposing Alert Center REST endpoints.

## 1. Responsibilities
- **RabbitMQ Integration**: Listens on `mes.notification_queue` bound to:
  - `mes.identity.UserRegistered` -> dispatches a welcome email.
  - `mes.workforce.WorkerCreated` -> triggers an in-app alert for profile configurations.
  - `mes.planning.WorkerAssignedToShift` -> dispatches an email + in-app alert notifying the worker.
  - `mes.assignment.AssignmentProposed` -> triggers an in-app alert targeted at users with the `manager` role.
- **Alert Channels**: Supports `email`, `in_app`, or `both` channels. Email transmission is currently stubbed to print structured records in stdout.
- **Alert Center REST Endpoints**: Allows users to retrieve their targeted notifications, mark single alerts as read, and clear/read-all logs.

---

## 2. Components
- `domain/entity/`: The `Alert` aggregate root and associated domain events.
- `application/consumer/`: Background consumer routines mapping RabbitMQ deliveries to application service triggers.
- `application/service/`: Coordinates trigger saves, inbox state switches, and SMTP-stub dispatches.
- `infrastructure/persistence/`: GORM alert entities and outbox mappings.
- `presentation/`: Gin controllers exposing JWT-authorized REST APIs.

---

## 3. REST API Routes

All endpoints require JWT authorization:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/alerts` | List alerts targeted to the current user or their role (supports pagination and `is_read` filtering) |
| `PATCH` | `/api/v1/alerts/:id/read` | Mark a specific notification read |
| `POST` | `/api/v1/alerts/read-all` | Mark all notifications for the authenticated user read |
