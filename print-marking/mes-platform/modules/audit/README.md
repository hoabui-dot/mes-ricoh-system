# Audit Logging Module

The Audit Logging module provides automated database mutation auditing (inserts, updates, and deletes) across all schemas and modules using a GORM callback plugin, capturing details about who changed what, when, and under which request tracking parameters.

## 1. Key Features
- **Automatic GORM callbacks**: Intercepts `gorm:create`, `gorm:update`, and `gorm:delete` statements to capture changes.
- **Trace Context Propagation**: Reads request trace variables (`trace_id`, `correlation_id`, `user_id`) from Go contexts, populated from HTTP headers via Gin middlewares.
- **Diff capture**: Records maps of property values before (`old_values`) and after (`new_values`) updates.
- **Recursion protection**: Safely ignores mutations on the `audit_logs` table itself.
- **Query APIs**: Secures history retrieval REST endpoints behind standard JWT authentication.

---

## 2. Components
- `domain/entity/`: The `AuditLog` aggregate root representing a single recorded mutation.
- `application/context/`: Context utilities converting Gin request variables to standard Go context keys.
- `application/service/`: Coordinates audit logs writing, detail queries, and filtered lists.
- `infrastructure/plugin/`: Custom GORM plugin registering database callbacks.
- `infrastructure/persistence/`: GORM persistence models and mapping adapters.
- `presentation/`: Gin controllers exposing search and details retrieval APIs.

---

## 3. REST API Routes

All endpoints require JWT authorization:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/audit/logs` | Fetch paginated list of audit records (supports filters: `entity_name`, `entity_id`, `user_id`, `trace_id`, `action`) |
| `GET` | `/api/v1/audit/logs/:id` | Fetch details of a single audit log entry |
