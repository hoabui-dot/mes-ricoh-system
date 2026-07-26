# Assignment Module

## Purpose
The Assignment module implements the **Assignment Engine** — the intelligence layer that links workers to specific work order operations. It supports both **automatic scoring-based assignment** and a **human-in-the-loop review workflow**.

## Core Principles
- **Immutable history**: Assignments are never overwritten. Every override creates a new revision record.
- **Human-in-the-loop**: Auto-propose → Manager review (approve/reject) → Manual override if needed.
- **Scoring engine**: Weighted algorithm ranks workers by skill match, availability, certification, and order priority.

---

## Assignment Lifecycle

```
ProposeAssignment (revision 1)
        ↓
   [proposed]
     /     \
approve   reject
    ↓
[approved]     [rejected]

        OR

[proposed] → override → [overridden]  (new revision 2 created as [proposed])
```

**Key rule**: Overriding marks the existing revision as `overridden` and creates a **new** Assignment record with `revision + 1`. History is always preserved.

---

## Scoring Algorithm

Workers are ranked using a weighted formula:

| Factor | Weight | Logic |
|---|---|---|
| Skill Match | 40% | matching required skills / total required × 100 |
| Availability | 30% | 100 if available, 0 if on leave |
| Certification | 20% | proficiency level / max × 100 + bonus if certified |
| Priority | 10% | production order priority (1–100) |

The top `min_operators` workers are auto-selected. Managers can override with any workers.

---

## Directory Structure

```
modules/assignment/
├── domain/
│   ├── entity/         ← Assignment aggregate, AssignedWorker value object, events
│   └── repository/     ← Port interfaces
├── application/
│   ├── dto/            ← Request/response DTOs
│   └── service/
│       ├── assignment_service.go  ← Business orchestration
│       └── scoring/               ← Pure, stateless scoring engine
├── infrastructure/
│   ├── model/          ← GORM models
│   └── persistence/    ← GORM repositories (history-safe)
└── presentation/
    ├── handler/        ← Gin HTTP handlers
    └── route/          ← JWT-protected route registration
```

---

## Cross-Module Data Access

The assignment module does **not import** workforce or production packages directly.
Instead, bootstrap wires two adapter types that implement abstract ports:

| Port | Adapter (in bootstrap) | Source Module |
|---|---|---|
| `WorkerQuery` | `WorkerQueryAdapter` | Workforce — workers + skills |
| `OperationQuery` | `OperationQueryAdapter` | Production — operation required skills |

---

## API Endpoints

All endpoints JWT-protected under `/api/v1/`:

| Method | Path | Description |
|---|---|---|
| POST | `/assignments/propose` | Auto-score and propose assignment |
| GET | `/assignments` | List assignments (filter: status, work_order_id, operation_id) |
| GET | `/assignments/history` | Full revision history for a work order + operation |
| GET | `/assignments/:id` | Get single assignment with workers |
| PATCH | `/assignments/:id/approve` | Manager approves assignment |
| PATCH | `/assignments/:id/reject` | Manager rejects assignment |
| POST | `/assignments/:id/override` | Manager creates new revision with manual worker selection |

---

## Domain Events Published

| Event | Trigger |
|---|---|
| `mes.assignment.AssignmentProposed` | New assignment proposed (any revision) |
| `mes.assignment.AssignmentApproved` | Manager approved |
| `mes.assignment.AssignmentRejected` | Manager rejected |
| `mes.assignment.AssignmentOverridden` | New revision created via override |
