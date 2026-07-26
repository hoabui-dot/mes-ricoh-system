# MES Platform — Product Document

## 1. Business Goals

The **Manufacturing Execution System (MES) Platform** bridges the gap between factory-floor equipment (controlled by the Station Agent) and enterprise-level factory management. It enables:

- **Visibility**: Real-time production status across all stations and shifts.
- **Workforce Optimization**: Match the right worker with the right skill to the right task.
- **Planning Precision**: Shift scheduling, calendar management, and leave tracking.
- **Traceability**: Every action, every assignment, every change is audited.
- **Human Control**: Managers can review and override any system decision.

---

## 2. Factory Workflow Overview

```
Production Order (ERP/Manager)
        ↓
  Work Orders created
        ↓
  Routing defined (operation steps, skills, operator count)
        ↓
  Assignment Engine matches workers to operations
        ↓
  Manager reviews → approves or overrides
        ↓
  Workers notified (in-app + email)
        ↓
  Shift starts → Station Agent executes jobs
        ↓
  Results fed back to MES (job events via RabbitMQ)
        ↓
  Dashboard updated in realtime
        ↓
  Audit trail recorded
```

---

## 3. Production Planning

### Production Order Lifecycle
```
Draft → Released → In Progress → Completed → Closed
```

- **Draft**: Created by manager, not yet released to production.
- **Released**: Approved and visible to the assignment engine.
- **In Progress**: At least one work order is being executed.
- **Completed**: All work orders finished.
- **Closed**: Archived after review.

### Work Orders
Each Production Order contains one or more Work Orders. A Work Order represents a specific task at a specific station with:
- Required skill(s)
- Required operator count
- Priority level
- Estimated duration

---

## 4. Worker Assignment

### Automatic Assignment Engine
The engine scores workers for each operation based on:

| Factor | Weight |
|---|---|
| Skill match (exact) | 40% |
| Skill proficiency level | 25% |
| Availability (shift + leave) | 20% |
| Certification validity | 10% |
| Historical workload balance | 5% |

### Human-in-the-Loop (HITL)
1. Engine generates a ranked candidate list.
2. Manager reviews via dashboard.
3. Manager can accept the recommendation or override with any other worker.
4. Override reason is recorded.
5. Assignment revision is created (old assignment is never overwritten).

**Rule**: No assignment history is ever deleted. New revisions are always created.

---

## 5. Skill Matrix

The Skill Matrix maps every worker to their skills with proficiency levels:

| Proficiency | Description |
|---|---|
| 1 - Beginner | Can perform with supervision |
| 2 - Intermediate | Can perform independently |
| 3 - Advanced | Can perform and train others |
| 4 - Expert | Domain authority |

Certifications (with expiry dates) are tracked separately and are a hard requirement for certain operations.

---

## 6. Shift Planning

- **Shift Templates**: Reusable shift definitions (day/evening/night with start/end times).
- **Monthly Calendar**: Calendar view showing planned shifts for each team.
- **Team Assignment**: Assign a team to a shift.
- **Worker Assignment**: Override team assignment for individual workers.
- **Holiday Management**: Block dates from planning.
- **Leave Management**: Workers request leave; managers approve.
- **Overtime**: Tracked separately with approval flow.

---

## 7. Assignment Lifecycle

```
PENDING → AUTO_ASSIGNED → UNDER_REVIEW → APPROVED
                                       ↘ OVERRIDDEN → NEW_REVISION_CREATED
```

---

## 8. Audit

Every action in the MES generates an audit log entry containing:
- Who performed the action (UserID, Username)
- What was changed (resource type + ID)
- When (UTC timestamp)
- Old value (JSON snapshot)
- New value (JSON snapshot)
- TraceID / CorrelationID for distributed tracing

Audit logs are immutable and append-only.

---

## 9. Permissions

The MES uses permission-based RBAC (Casbin). Permissions follow the `<resource>.<action>` convention:

| Permission | Description |
|---|---|
| user.create | Create user accounts |
| user.view | View user profiles |
| user.update | Update user information |
| user.delete | Delete users |
| role.manage | Create/edit/delete roles |
| worker.create | Add workers |
| worker.view | View worker profiles |
| worker.update | Update worker data |
| planning.publish | Publish shift plans |
| planning.override | Override published plans |
| production.release | Release production orders |
| assignment.override | Override system assignments |
| audit.view | View audit trail |
| dashboard.view | Access MES dashboard |

Default roles: `super_admin`, `admin`, `manager`, `operator`

---

## 10. Realtime Dashboard

The MES dashboard provides live visibility into:
- Active production orders and their progress
- Worker availability and assignment status
- Shift coverage gaps
- Station activity (consuming events from Station Agent via RabbitMQ)
- Recent audit events

Realtime updates delivered via WebSocket connections.

---

## 11. Future Expansion

- **Machine Learning**: AI-powered assignment scoring improvements
- **OEE Tracking**: Overall Equipment Effectiveness metrics per station
- **Quality Management**: Defect tracking and root cause analysis
- **Material Management**: Bill of materials and inventory integration
- **ERP Integration**: SAP/Oracle connector via REST or EDI
- **Mobile App**: React Native app for floor workers
- **Multi-Factory**: Support for multiple factory sites
