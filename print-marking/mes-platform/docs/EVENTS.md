# MES Platform — Domain Events Registry

This document lists all domain events generated and processed by the MES Platform.

## 1. Naming Convention

- **Format**: `mes.<module_name>.<EventName>`
- **Exchanges**:
  - `mes.events` (Topic, durable) for all events.
- All events are generated inside a business transaction, written to the module's outbox table, and then published asynchronously to RabbitMQ.

---

## 2. Event Registry

### Identity Module

#### `mes.identity.UserRegistered`
Published when a new user is successfully registered or created.
- **Routing Key**: `mes.identity.UserRegistered`
- **Schema**:
```json
{
  "event_name": "mes.identity.UserRegistered",
  "occurred_at": "2026-06-30T16:00:00.000Z",
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "username": "johndoe",
  "email": "johndoe@example.com"
}
```

#### `mes.identity.UserLoggedIn`
Published upon successful user authentication.
- **Routing Key**: `mes.identity.UserLoggedIn`
- **Schema**:
```json
{
  "event_name": "mes.identity.UserLoggedIn",
  "occurred_at": "2026-06-30T16:05:00.000Z",
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "username": "johndoe",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0..."
}
```

#### `mes.identity.PasswordChanged`
Published when a user changes their password or resets it.
- **Routing Key**: `mes.identity.PasswordChanged`
- **Schema**:
```json
{
  "event_name": "mes.identity.PasswordChanged",
  "occurred_at": "2026-06-30T16:10:00.000Z",
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "reason": "self_change"
}
```

#### `mes.identity.UserStatusChanged`
Published when an administrator updates a user status.
- **Routing Key**: `mes.identity.UserStatusChanged`
- **Schema**:
```json
{
  "event_name": "mes.identity.UserStatusChanged",
  "occurred_at": "2026-06-30T16:15:00.000Z",
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "old_status": "active",
  "new_status": "suspended",
  "changed_by": "0a1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e"
}
```

### Workforce Module

#### `mes.workforce.WorkerCreated`
Published when a new worker is added to the system.
- **Routing Key**: `mes.workforce.WorkerCreated`
- **Schema**:
```json
{
  "event_name": "mes.workforce.WorkerCreated",
  "occurred_at": "2026-06-30T17:15:00.000Z",
  "worker_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "employee_code": "EMP001",
  "email": "alice.smith@example.com"
}
```

#### `mes.workforce.WorkerSkillsUpdated`
Published when a worker's skill matrix proficiency is modified.
- **Routing Key**: `mes.workforce.WorkerSkillsUpdated`
- **Schema**:
```json
{
  "event_name": "mes.workforce.WorkerSkillsUpdated",
  "occurred_at": "2026-06-30T17:20:00.000Z",
  "worker_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "skills": [
    {
      "skill_id": "522df142-b0e9-4e56-91b5-82ee123cb6d8",
      "proficiency_level": 3
    }
  ]
}
```

#### `mes.workforce.WorkerAvailabilityChanged`
Published when a worker's availability changes (e.g. goes on leave).
- **Routing Key**: `mes.workforce.WorkerAvailabilityChanged`
- **Schema**:
```json
{
  "event_name": "mes.workforce.WorkerAvailabilityChanged",
  "occurred_at": "2026-06-30T17:25:00.000Z",
  "worker_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "availability": "on_leave"
}
```

#### `mes.workforce.CertificateAdded`
Published when a new qualification certificate is uploaded for a worker.
- **Routing Key**: `mes.workforce.CertificateAdded`
- **Schema**:
```json
{
  "event_name": "mes.workforce.CertificateAdded",
  "occurred_at": "2026-06-30T17:30:00.000Z",
  "worker_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "certificate_id": "ae7b8d4f-3bfb-432d-94cb-16c429dcb6d2",
  "name": "Laser Safety",
  "expires_at": "2027-06-30T17:30:00.000Z"
}
```

### Planning Module

#### `mes.planning.ShiftCreated`
Published when a daily shift schedule is created.
- **Routing Key**: `mes.planning.ShiftCreated`
- **Schema**:
```json
{
  "event_name": "mes.planning.ShiftCreated",
  "occurred_at": "2026-07-01T00:15:00.000Z",
  "shift_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "shift_template_id": "522df142-b0e9-4e56-91b5-82ee123cb6d8",
  "date": "2026-07-01"
}
```

#### `mes.planning.TeamAssignedToShift`
Published when a workforce team is assigned to a shift.
- **Routing Key**: `mes.planning.TeamAssignedToShift`
- **Schema**:
```json
{
  "event_name": "mes.planning.TeamAssignedToShift",
  "occurred_at": "2026-07-01T00:20:00.000Z",
  "shift_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "team_id": "ae7b8d4f-3bfb-432d-94cb-16c429dcb6d2"
}
```

#### `mes.planning.WorkerAssignedToShift`
Published when an individual worker is assigned to a specific shift.
- **Routing Key**: `mes.planning.WorkerAssignedToShift`
- **Schema**:
```json
{
  "event_name": "mes.planning.WorkerAssignedToShift",
  "occurred_at": "2026-07-01T00:25:00.000Z",
  "shift_id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
  "worker_id": "8422c338-7602-43df-bd5e-302584748cd3",
  "role": "operator"
}
```

#### `mes.planning.LeaveRequested`
Published when a worker submits a leave request.
- **Routing Key**: `mes.planning.LeaveRequested`
- **Schema**:
```json
{
  "event_name": "mes.planning.LeaveRequested",
  "occurred_at": "2026-07-01T00:30:00.000Z",
  "leave_id": "5ca978b0-7a7a-44ac-8909-21c25296fbaf",
  "worker_id": "8422c338-7602-43df-bd5e-302584748cd3",
  "start_date": "2026-07-05",
  "end_date": "2026-07-10"
}
```

#### `mes.planning.LeaveApproved`
Published when a worker's leave request is approved.
- **Routing Key**: `mes.planning.LeaveApproved`
- **Schema**:
```json
{
  "event_name": "mes.planning.LeaveApproved",
  "occurred_at": "2026-07-01T00:35:00.000Z",
  "leave_id": "5ca978b0-7a7a-44ac-8909-21c25296fbaf",
  "worker_id": "8422c338-7602-43df-bd5e-302584748cd3",
  "approved_by": "0a1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e"
}
```

#### `mes.planning.OvertimeApproved`
Published when a worker's overtime request is approved.
- **Routing Key**: `mes.planning.OvertimeApproved`
- **Schema**:
```json
{
  "event_name": "mes.planning.OvertimeApproved",
  "occurred_at": "2026-07-01T00:40:00.000Z",
  "overtime_id": "2f6a711f-0e6b-4c5f-a65b-c2b3ddc85350",
  "worker_id": "8422c338-7602-43df-bd5e-302584748cd3",
  "approved_by": "0a1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e",
  "hours": 4.5
}
```

### Production Module

#### `mes.production.ProductionOrderCreated`
Published when a new production order is created in Draft status.
- **Routing Key**: `mes.production.ProductionOrderCreated`
- **Schema**:
```json
{
  "event_name": "mes.production.ProductionOrderCreated",
  "occurred_at": "2026-07-01T00:40:00.000Z",
  "production_order_id": "1fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "order_number": "PO-2026-0001",
  "quantity": 100
}
```

#### `mes.production.ProductionOrderReleased`
Published when a production order is transitioned to Released status.
- **Routing Key**: `mes.production.ProductionOrderReleased`
- **Schema**:
```json
{
  "event_name": "mes.production.ProductionOrderReleased",
  "occurred_at": "2026-07-01T00:41:00.000Z",
  "production_order_id": "1fa978b0-7a7a-44ac-8909-21c25296fbaf"
}
```

#### `mes.production.WorkOrderCreated`
Published when a work order is instantiated for a production order routing step.
- **Routing Key**: `mes.production.WorkOrderCreated`
- **Schema**:
```json
{
  "event_name": "mes.production.WorkOrderCreated",
  "occurred_at": "2026-07-01T00:42:00.000Z",
  "work_order_id": "2fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "production_order_id": "1fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "routing_id": "3fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "sequence": 1
}
```

#### `mes.production.WorkOrderStarted`
Published when a worker starts working on a work order.
- **Routing Key**: `mes.production.WorkOrderStarted`
- **Schema**:
```json
{
  "event_name": "mes.production.WorkOrderStarted",
  "occurred_at": "2026-07-01T00:43:00.000Z",
  "work_order_id": "2fa978b0-7a7a-44ac-8909-21c25296fbaf"
}
```

#### `mes.production.WorkOrderCompleted`
Published when a work order is successfully completed.
- **Routing Key**: `mes.production.WorkOrderCompleted`
- **Schema**:
```json
{
  "event_name": "mes.production.WorkOrderCompleted",
  "occurred_at": "2026-07-01T00:44:00.000Z",
  "work_order_id": "2fa978b0-7a7a-44ac-8909-21c25296fbaf"
}
```

### Assignment Module

#### `mes.assignment.AssignmentProposed`
Published when a worker assignment configuration is proposed.
- **Routing Key**: `mes.assignment.AssignmentProposed`
- **Schema**:
```json
{
  "event_name": "mes.assignment.AssignmentProposed",
  "occurred_at": "2026-07-01T00:45:00.000Z",
  "assignment_id": "4fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "work_order_id": "2fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "operation_id": "5fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "revision": 1,
  "score": 85.5
}
```

#### `mes.assignment.AssignmentApproved`
Published when a manager approves a proposed assignment.
- **Routing Key**: `mes.assignment.AssignmentApproved`
- **Schema**:
```json
{
  "event_name": "mes.assignment.AssignmentApproved",
  "occurred_at": "2026-07-01T00:46:00.000Z",
  "assignment_id": "4fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "work_order_id": "2fa978b0-7a7a-44ac-8909-21c25296fbaf",
  "reviewed_by": "0a1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e"
}
```

---

## 3. Subscription Matrix

| Event | Publisher | Consumer(s) | Description |
|---|---|---|---|
| `mes.identity.UserRegistered` | Identity Module | Notification Module | Trigger welcome email |
| `mes.identity.PasswordChanged` | Identity Module | Session Service | Invalidate active user tokens |
| `mes.identity.UserStatusChanged` | Identity Module | Security Service | Revoke all active sessions for suspended user |
| `mes.workforce.WorkerCreated` | Workforce Module | Notification Module | Setup default profile notification |
| `mes.workforce.WorkerAvailabilityChanged` | Workforce Module | Assignment Engine | Trigger assignment updates for unavailable workers |
| `mes.workforce.CertificateAdded` | Workforce Module | Planning Module | Recalculate scheduling eligibilities |
| `mes.planning.LeaveApproved` | Planning Module | Workforce Module | Set worker availability to 'on_leave' |
| `mes.planning.WorkerAssignedToShift` | Planning Module | Notification Module | Dispatch shift assignment SMS/email alert |
