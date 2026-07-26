# MES Platform — Database Design

This document details the database architecture, schemas, naming conventions, and migration strategy for the MES Platform.

## 1. Database-per-Module Constraint

To ensure modules can be extracted into microservices without database-level refactoring, we enforce a strict logical **Database-per-Module** boundary.

### Key Rules
- **No physical Foreign Keys across schemas/modules**: References must use logical IDs (e.g. `user_id`, `worker_id`, `work_order_id`).
- **No JOIN queries across modules**: If a read model needs data from two modules, perform application-level stitching (e.g. query `workforce` for worker names, then map to assignments).
- **Separated Outbox Tables**: Every module owns its local outbox table (e.g. `identity_outbox_events`).

---

## 2. Table Schemas (PostgreSQL)

### Phase 1: Identity Module Tables

The Identity module schema covers user credentials, RBAC configuration, audit logs, and session refresh tokens.

```
                  +------------------------+
                  |     identity_users     |
                  +------------------------+
                              | 1
                              |
                              | 1..*
                  +------------------------+
                  |  identity_user_roles   |
                  +------------------------+
                              | *
                              |
                              | 1
                  +------------------------+
                  |     identity_roles     |
                  +------------------------+
                              | 1
                              |
                              | 1..*
                  +------------------------+
                  | identity_role_perms    |
                  +------------------------+
                              | *
                              |
                              | 1
                  +------------------------+
                  |  identity_permissions  |
                  +------------------------+
```

#### `identity_users`
Stores user authentication details and account state.
- `id` (UUID, PK)
- `username` (VARCHAR(50), Unique)
- `email` (VARCHAR(255), Unique)
- `password_hash` (VARCHAR(255))
- `full_name` (VARCHAR(100))
- `phone` (VARCHAR(20))
- `status` (VARCHAR(50)) - `active`, `inactive`, `suspended`
- `last_login_at` (TIMESTAMPTZ)
- `password_reset_token` (VARCHAR(255))
- `password_reset_expires_at` (TIMESTAMPTZ)
- `created_at`, `updated_at`, `deleted_at`

#### `identity_roles`
Defines roles assigned to users.
- `id` (UUID, PK)
- `name` (VARCHAR(50), Unique)
- `description` (VARCHAR(255))
- `created_at`, `updated_at`

#### `identity_permissions`
Defines granular capabilities (rules).
- `id` (UUID, PK)
- `name` (VARCHAR(100), Unique) - e.g. `worker.create`
- `description` (VARCHAR(255))
- `resource` (VARCHAR(50))
- `action` (VARCHAR(50))
- `created_at`, `updated_at`

#### `identity_user_roles`
Join table mapping users to roles.
- `user_id` (UUID, FK, PK)
- `role_id` (UUID, FK, PK)

#### `identity_role_permissions`
Join table mapping roles to permissions.
- `role_id` (UUID, FK, PK)
- `permission_id` (UUID, FK, PK)

#### `identity_refresh_tokens`
Tracks user sessions for secure JWT rotation.
- `id` (UUID, PK)
- `user_id` (UUID, FK)
- `token_hash` (VARCHAR(255), Unique)
- `expires_at` (TIMESTAMPTZ)
- `revoked_at` (TIMESTAMPTZ, Nullable)
- `user_agent` (TEXT)
- `ip_address` (VARCHAR(45))
- `created_at`, `updated_at`

#### `identity_audit_logs`
Immutable logging table for all identity actions.
- `id` (UUID, PK)
- `user_id` (UUID, Nullable)
- `action` (VARCHAR(100))
- `resource` (VARCHAR(100))
- `resource_id` (VARCHAR(255))
- `old_value` (JSONB)
- `new_value` (JSONB)
- `ip_address` (VARCHAR(45))
- `user_agent` (TEXT)
- `trace_id` (VARCHAR(255))
- `correlation_id` (VARCHAR(255))
- `created_at` (TIMESTAMPTZ)

#### `identity_outbox_events`
Outbox queue for Identity domain events.
- `id` (UUID, PK)
- `event_name` (VARCHAR(255))
- `routing_key` (VARCHAR(255))
- `payload` (JSONB)
- `status` (VARCHAR(50)) - `pending`, `published`, `failed`
- `retry_count` (INTEGER)
- `error` (TEXT)
- `published_at` (TIMESTAMPTZ, Nullable)
- `created_at`, `updated_at`

### Phase 2: Workforce Module Tables

The Workforce module schema manages organizational groups (Departments, Workshops, Teams) and workers' records, their certificates, and their skill proficiency matrix mappings.

```
            +---------------------------+
            |   workforce_departments   |
            +---------------------------+
                          | 1
                          |
                          | 1..*
            +---------------------------+
            |    workforce_workshops    |
            +---------------------------+
                          | 1
                          |
                          | 1..*
            +---------------------------+
            |      workforce_teams      |
            +---------------------------+
                          | 1 (Optional)
                          |
                          | 1..*
            +---------------------------+     1..*     +-----------------------+
            |     workforce_workers     |-------------| workforce_skill_matrix|
            +---------------------------+              +-----------------------+
                          | 1                                      | 1..*
                          |                                        |
                          | 1..*                                   | 1
            +---------------------------+              +-----------------------+
            |   workforce_certificates  |              |    workforce_skills   |
            +---------------------------+              +-----------------------+
```

#### `workforce_departments`
Defines departments.
- `id` (UUID, PK)
- `name` (VARCHAR(100), Unique)
- `description` (VARCHAR(255))
- `created_at`, `updated_at`

#### `workforce_workshops`
Defines workshops within departments.
- `id` (UUID, PK)
- `department_id` (UUID, FK referencing `workforce_departments.id`)
- `name` (VARCHAR(100), Unique)
- `description` (VARCHAR(255))
- `created_at`, `updated_at`

#### `workforce_teams`
Defines teams working within workshops.
- `id` (UUID, PK)
- `workshop_id` (UUID, FK referencing `workforce_workshops.id`)
- `name` (VARCHAR(100), Unique)
- `description` (VARCHAR(255))
- `created_at`, `updated_at`

#### `workforce_workers`
Stores physical worker records.
- `id` (UUID, PK)
- `user_id` (UUID, Unique, Nullable) - logical link to `identity_users.id`
- `first_name` (VARCHAR(100))
- `last_name` (VARCHAR(100))
- `email` (VARCHAR(255), Unique)
- `phone` (VARCHAR(20))
- `employee_code` (VARCHAR(50), Unique)
- `department_id` (UUID, FK, Nullable)
- `workshop_id` (UUID, FK, Nullable)
- `team_id` (UUID, FK, Nullable)
- `status` (VARCHAR(50)) - `active`, `inactive`, `terminated`
- `availability` (VARCHAR(50)) - `available`, `on_leave`, `suspended`
- `created_at`, `updated_at`, `deleted_at`

#### `workforce_skills`
Global skill catalog.
- `id` (UUID, PK)
- `name` (VARCHAR(100), Unique)
- `code` (VARCHAR(50), Unique)
- `description` (VARCHAR(255))
- `created_at`, `updated_at`

#### `workforce_skill_matrix`
Maps workers to skills and proficiency levels.
- `worker_id` (UUID, FK, PK)
- `skill_id` (UUID, FK, PK)
- `proficiency_level` (INTEGER) - range 1 to 4
- `updated_at`

#### `workforce_certificates`
Tracks worker certificates and validities.
- `id` (UUID, PK)
- `worker_id` (UUID, FK)
- `name` (VARCHAR(100))
- `issuing_authority` (VARCHAR(100))
- `certificate_number` (VARCHAR(100), Unique)
- `issued_at` (TIMESTAMPTZ)
- `expires_at` (TIMESTAMPTZ)
- `document_url` (VARCHAR(255))
- `created_at`, `updated_at`

#### `workforce_outbox_events`
Outbox queue for Workforce domain events.
- `id` (UUID, PK)
- `event_name` (VARCHAR(255))
- `routing_key` (VARCHAR(255))
- `payload` (JSONB)
- `status` (VARCHAR(50)) - `pending`, `published`, `failed`
- `retry_count` (INTEGER)
- `error` (TEXT)
- `published_at` (TIMESTAMPTZ, Nullable)
- `created_at`, `updated_at`


### Phase 3: Planning Module Tables

The Planning module schema governs work shift schedules, shift templates, holiday markers, worker leave requests, and overtime hours tracking.

```
          +-----------------------------+
          |   planning_shift_templates  |
          +-----------------------------+
                         | 1
                         |
                         | 1..*
          +-----------------------------+
          |       planning_shifts       |
          +-----------------------------+
              /                     \
             / 1..*                  \ 1..*
            v                         v
  +-------------------------+   +-----------------------------+
  |planning_team_assignments|   |planning_worker_assignments  |
  +-------------------------+   +-----------------------------+
               | *                           | *
               v (Logical)                   v (Logical)
         [workforce_teams]            [workforce_workers]

  +-------------------------+   +-----------------------------+
  |    planning_holidays    |   |       planning_leaves       |
  +-------------------------+   +-----------------------------+
                                             | *
                                             v (Logical)
                                      [workforce_workers]

                                +-----------------------------+
                                |      planning_overtimes     |
                                +-----------------------------+
                                             | *
                                             v (Logical)
                                      [workforce_workers]
```

#### `planning_shift_templates`
Stores template designs for shifts.
- `id` (UUID, PK)
- `name` (VARCHAR(100), Unique)
- `start_time` (VARCHAR(5)) - e.g. "06:00"
- `end_time` (VARCHAR(5)) - e.g. "14:00"
- `created_at`, `updated_at`

#### `planning_shifts`
Stores daily instantiated shifts.
- `id` (UUID, PK)
- `shift_template_id` (UUID, FK referencing `planning_shift_templates.id`)
- `date` (DATE) - calendar date of the shift
- `created_at`, `updated_at`

#### `planning_team_assignments`
Maps workforce teams to instantiated shifts.
- `id` (UUID, PK)
- `shift_id` (UUID, FK referencing `planning_shifts.id`)
- `team_id` (UUID) - logical reference to `workforce_teams.id`
- `created_at`, `updated_at`

#### `planning_worker_assignments`
Maps individual workers to instantiated shifts.
- `id` (UUID, PK)
- `shift_id` (UUID, FK referencing `planning_shifts.id`)
- `worker_id` (UUID) - logical reference to `workforce_workers.id`
- `role` (VARCHAR(50)) - role of the worker in this shift (e.g. operator, manager)
- `created_at`, `updated_at`

#### `planning_holidays`
Lists non-working factory dates.
- `id` (UUID, PK)
- `date` (DATE, Unique)
- `name` (VARCHAR(100))
- `description` (VARCHAR(255))
- `created_at`, `updated_at`

#### `planning_leaves`
Worker leave requests and status.
- `id` (UUID, PK)
- `worker_id` (UUID) - logical reference to `workforce_workers.id`
- `start_date` (DATE)
- `end_date` (DATE)
- `status` (VARCHAR(50)) - `pending`, `approved`, `rejected`
- `reason` (VARCHAR(255))
- `approved_by` (UUID, Nullable) - logical reference to `identity_users.id`
- `created_at`, `updated_at`

#### `planning_overtimes`
Worker overtime tracking.
- `id` (UUID, PK)
- `worker_id` (UUID) - logical reference to `workforce_workers.id`
- `date` (DATE)
- `hours` (NUMERIC(4,2))
- `status` (VARCHAR(50)) - `pending`, `approved`, `rejected`
- `reason` (VARCHAR(255))
- `approved_by` (UUID, Nullable) - logical reference to `identity_users.id`
- `created_at`, `updated_at`

#### `planning_outbox_events`
Outbox queue for Planning domain events.
- `id` (UUID, PK)
- `event_name` (VARCHAR(255))
- `routing_key` (VARCHAR(255))
- `payload` (JSONB)
- `status` (VARCHAR(50)) - `pending`, `published`, `failed`
- `retry_count` (INTEGER)
- `error` (TEXT)
- `published_at` (TIMESTAMPTZ, Nullable)
- `created_at`, `updated_at`

### Phase 4: Production Module Tables

The Production module schema covers production orders, work orders, routing configurations, and operations.

#### `production_orders`
Tracks customer orders scheduled for production.
- `id` (UUID, PK)
- `order_number` (VARCHAR(100), Unique)
- `product_name` (VARCHAR(255))
- `quantity` (INTEGER)
- `priority` (INTEGER)
- `status` (VARCHAR(50)) - `draft`, `released`, `in_progress`, `completed`, `cancelled`
- `due_date` (DATE, Nullable)
- `notes` (TEXT)
- `created_at`, `updated_at`

#### `production_routings`
Defines production templates/workflows.
- `id` (UUID, PK)
- `name` (VARCHAR(255), Unique)
- `description` (TEXT)
- `total_estimated_minutes` (INTEGER)
- `created_at`, `updated_at`

#### `production_operations`
Granular production tasks belonging to a routing template.
- `id` (UUID, PK)
- `routing_id` (UUID, FK referencing `production_routings.id`)
- `sequence` (INTEGER)
- `name` (VARCHAR(255))
- `machine_type` (VARCHAR(100))
- `estimated_minutes` (INTEGER)
- `min_operators` (INTEGER)
- `max_operators` (INTEGER)
- `required_skills_json` (TEXT) - JSON-encoded skill requirements
- `created_at`, `updated_at`

#### `production_work_orders`
Instantiated operations for production orders.
- `id` (UUID, PK)
- `production_order_id` (UUID, index) - logical reference to `production_orders.id`
- `routing_id` (UUID) - logical reference to `production_routings.id`
- `sequence` (INTEGER)
- `status` (VARCHAR(50)) - `pending`, `in_progress`, `completed`, `cancelled`
- `started_at` (TIMESTAMPTZ, Nullable)
- `completed_at` (TIMESTAMPTZ, Nullable)
- `created_at`, `updated_at`

#### `production_outbox_events`
Outbox queue for Production domain events.
- `id` (UUID, PK)
- `event_name` (VARCHAR(255))
- `routing_key` (VARCHAR(255))
- `payload` (JSONB)
- `status` (VARCHAR(50)) - `pending`, `published`, `failed`
- `retry_count` (INTEGER)
- `error` (TEXT)
- `published_at` (TIMESTAMPTZ, Nullable)
- `created_at`, `updated_at`

---

### Phase 5: Assignment Module Tables

The Assignment module schema tracks historical and current worker-to-work-order assignments.

#### `assignment_assignments`
Tracks assignment sets.
- `id` (UUID, PK)
- `work_order_id` (UUID, index) - logical reference to `production_work_orders.id`
- `operation_id` (UUID, index) - logical reference to `production_operations.id`
- `revision` (INTEGER) - incremented on override
- `status` (VARCHAR(50)) - `proposed`, `approved`, `rejected`, `overridden`
- `proposed_by` (VARCHAR(255)) - `system` or user ID
- `reviewed_by` (UUID, Nullable) - logical reference to `identity_users.id`
- `score` (NUMERIC(6,2))
- `notes` (TEXT)
- `created_at`, `updated_at`

#### `assignment_assigned_workers`
Detail table mapping individual workers within a specific assignment revision.
- `id` (UUID, PK)
- `assignment_id` (UUID, FK referencing `assignment_assignments.id`)
- `worker_id` (UUID) - logical reference to `workforce_workers.id`
- `worker_name` (VARCHAR(255)) - denormalized worker name for history immutability
- `skill_matched` (TEXT) - JSON array of matching skill codes
- `score` (NUMERIC(6,2))
- `created_at`

#### `assignment_outbox_events`
Outbox queue for Assignment domain events.
- `id` (UUID, PK)
- `event_name` (VARCHAR(255))
- `routing_key` (VARCHAR(255))
- `payload` (JSONB)
- `status` (VARCHAR(50)) - `pending`, `published`, `failed`
- `retry_count` (INTEGER)
- `error` (TEXT)
- `published_at` (TIMESTAMPTZ, Nullable)
- `created_at`, `updated_at`

---

### Phase 6: Projection Module Tables

The Projection module uses denormalized read-models for analytics and real-time dashboard display.

#### `projection_dashboard_snapshots`
Daily materialized summary state.
- `id` (UUID, PK)
- `snapshot_date` (DATE, Unique)
- `total_orders` (INTEGER)
- `draft_orders` (INTEGER)
- `released_orders` (INTEGER)
- `in_progress_orders` (INTEGER)
- `completed_orders` (INTEGER)
- `cancelled_orders` (INTEGER)
- `total_work_orders` (INTEGER)
- `pending_work_orders` (INTEGER)
- `active_work_orders` (INTEGER)
- `completed_work_orders` (INTEGER)
- `total_workers` (INTEGER)
- `available_workers` (INTEGER)
- `on_leave_workers` (INTEGER)
- `open_assignments` (INTEGER)
- `approved_assignments` (INTEGER)
- `avg_assignment_score` (NUMERIC(6,2))
- `computed_at` (TIMESTAMPTZ)
- `created_at`, `updated_at`

#### `projection_order_stats`
Time-series production order analytics.
- `id` (UUID, PK)
- `period` (VARCHAR(20)) - `daily`, `weekly`, `monthly`
- `period_start` (DATE)
- `period_end` (DATE)
- `orders_created` (INTEGER)
- `orders_completed` (INTEGER)
- `orders_cancelled` (INTEGER)
- `avg_completion_days` (NUMERIC(6,2))
- `total_units_produced` (INTEGER)
- `created_at`, `updated_at`

#### `projection_worker_stats`
Per-worker utilization leaderboard.
- `id` (UUID, PK)
- `worker_id` (UUID) - logical reference to `workforce_workers.id`
- `worker_name` (VARCHAR(255))
- `period` (VARCHAR(20))
- `period_start` (DATE)
- `assignments_count` (INTEGER)
- `approved_count` (INTEGER)
- `overridden_count` (INTEGER)
- `avg_score` (NUMERIC(6,2))
- `created_at`, `updated_at`

---

### Phase 8: Audit Logging Module Tables

The Audit Logging module table records every user-initiated request change and database field-level mutation.

#### `audit_logs`
- `id` (UUID, PK)
- `trace_id` (VARCHAR(255), Index)
- `correlation_id` (VARCHAR(255), Index)
- `user_id` (UUID, Nullable, Index) - logical reference to `identity_users.id`
- `action` (VARCHAR(255)) - e.g., `CREATE`, `UPDATE`, `DELETE`
- `entity_name` (VARCHAR(255), Index) - e.g., `workforce_workers`
- `entity_id` (VARCHAR(255), Index) - Primary key ID of the mutated record
- `old_values` (TEXT) - JSON string of old fields
- `new_values` (TEXT) - JSON string of new fields
- `created_at` (TIMESTAMPTZ)

---

## 3. Migration Strategy


- We use **golang-migrate** for versioning.
- Migration files are stored in the `/migrations/` folder.
- Format: `00000X_description.up.sql` and `00000X_description.down.sql`.
- At server startup, the app automatically executes pending migrations using the GORM PostgreSQL adapter.
- In dev, you can use `make migrate-up` and `make migrate-down`.
