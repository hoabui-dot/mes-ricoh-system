# RBAC CRUD Implementation Prompt (MES Platform)

## Objective

Implement a complete **Role-Based Access Control (RBAC)** module for the MES Platform.

The implementation must follow enterprise best practices, integrate with the existing Go Modular Monolith architecture, and reuse the authentication infrastructure already implemented.

This module will become the authorization center of the MES system.

---

# Existing Architecture

The backend already contains:

- Identity Module
- JWT Authentication
- Redis Refresh Token
- Casbin (GORM Adapter)
- PostgreSQL
- GORM
- CQRS style service layer
- Audit Logging
- Outbox Pattern
- RabbitMQ
- Projection module

Do NOT redesign authentication.

Only implement Authorization (RBAC).

---

# RBAC Architecture

Implement RBAC using:

```
Identity Module
        │
        ▼
 Authentication (JWT)

        │
        ▼
 Authorization (Casbin)

        │
        ▼
 REST API

        │
        ▼
 React Frontend
```

Permission evaluation must happen inside middleware.

Business handlers must not manually verify permissions.

---

# Permission Model

Use Permission-Based Access Control.

Never use Role Name checks inside code.

Example

Wrong

```
if role == "Admin"
```

Correct

```
RequirePermission("worker.create")
```

---

# Core Entities

## User

Already exists.

Add relation

```
User

↓

Many Roles
```

---

## Role

Fields

```
Id
Name
Code
Description
IsSystem
CreatedAt
UpdatedAt
```

Examples

```
System Administrator

Production Manager

HR Manager

Supervisor

Operator

Viewer
```

---

## Permission

Fields

```
Id
Module
Code
DisplayName
Description
Category
```

Example

```
Module

Workforce

Planning

Production

Dashboard

Identity

Audit

Notification
```

Permission Codes

```
worker.read

worker.create

worker.update

worker.delete

department.read

department.create

department.update

department.delete

team.read

team.create

team.update

team.delete

skill.read

skill.create

skill.update

skill.delete

shift.read

shift.assign

shift.edit

production.read

production.release

production.cancel

dashboard.view

audit.view

user.manage

role.manage

permission.manage
```

Permission code must be globally unique.

---

## UserRole

Many-to-many

```
UserId

RoleId
```

---

## RolePermission

Many-to-many

```
RoleId

PermissionId
```

---

# Casbin Policy

Generate Casbin Policy automatically.

Example

```
role_admin

worker.create

allow
```

User assignment

```
alice

role_admin
```

Never edit Casbin rules manually.

Always synchronize through services.

---

# CRUD APIs

---

# Role APIs

## Get Roles

```
GET /api/v1/roles
```

Supports

- pagination
- search
- sorting

Response

```
Items

Total

Page

PageSize
```

---

## Get Role Detail

```
GET /api/v1/roles/{id}
```

Return

Role

Permissions

Users Count

Created Time

Updated Time

---

## Create Role

```
POST /api/v1/roles
```

Body

```
Name

Code

Description

PermissionIds[]
```

Validation

Unique Code

Unique Name

Minimum one permission

---

## Update Role

```
PUT /api/v1/roles/{id}
```

Editable

Name

Description

Permissions

Cannot modify

System Role Code

---

## Delete Role

```
DELETE /api/v1/roles/{id}
```

Rules

Cannot delete

System Administrator

Default Roles

Roles currently assigned to users

Soft delete preferred.

---

# Permission APIs

Permissions are managed centrally.

Normally read-only.

---

## Get Permissions

```
GET /api/v1/permissions
```

Group by Module

Example

```
Workforce

Planning

Production

Dashboard

Identity
```

Return

```
Module

Permissions[]
```

---

# User Assignment APIs

---

Assign Roles

```
POST

/users/{id}/roles
```

Replace roles

```
PUT

/users/{id}/roles
```

Remove role

```
DELETE

/users/{id}/roles/{roleId}
```

---

# Authorization Middleware

Every endpoint must declare required permission.

Example

```
RequirePermission(

worker.read
)
```

Never check permissions inside controllers.

---

# Frontend Pages

Implement using

React

TypeScript

Vite

TailwindCSS

shadcn/ui

TanStack Query

React Hook Form

Zod

---

# Page 1

Role Management

Data Table

Columns

```
Role

Description

Users Count

Permissions Count

Created

Updated

Actions
```

Toolbar

```
Search

Create Role

Refresh
```

Actions

```
View

Edit

Delete
```

---

# Create/Edit Role Dialog

Sections

General

```
Role Name

Role Code

Description
```

Permissions

Grouped

```
▼ Workforce

☑ Worker Read

☑ Worker Create

☑ Worker Update

☑ Worker Delete

▼ Planning

☑ Shift Read

☑ Shift Assign
```

Allow

Expand

Collapse

Select All

Clear

Search Permission

---

# Permission UX

Display as grouped checkbox tree.

Not flat list.

Module Header

↓

Permissions

Support

```
Collapse

Expand

Select All

```

---

# User Role Assignment

User Detail

Role Tab

Show

Assigned Roles

Assign Role

Remove Role

Display

Role Badge

Permission Count

---

# System Roles

Provide default immutable roles

```
System Administrator

Production Manager

HR Manager

Supervisor

Operator

Viewer
```

System roles

Cannot delete

Cannot change code

Can update description only.

---

# Audit Logging

Every RBAC operation must be logged.

Create Role

Update Role

Delete Role

Assign Role

Remove Role

Permission Changes

Record

```
User

Timestamp

IPAddress

TraceId

Before

After
```

---

# Events

Publish Outbox Events

```
RoleCreated

RoleUpdated

RoleDeleted

UserRoleAssigned

UserRoleRemoved

PermissionChanged
```

Projection module can consume later.

---

# Validation

Unique Role Name

Unique Role Code

Permission Exists

Cannot remove last System Administrator

Cannot assign deleted role

Cannot delete role used by users

---

# Error Responses

Standard API format

```
Success

Message

Errors[]

TraceId
```

Never expose internal exception.

---

# Security

Prevent privilege escalation.

Normal users cannot assign themselves higher permissions.

Only users with

```
role.manage
```

may manage roles.

Only users with

```
user.manage
```

may assign roles.

---

# Performance

Permission lookup should be cached.

Reload cache only when

Role

Permission

Assignment

changes.

Avoid querying Casbin every request from database.

Use in-memory cache with automatic invalidation.

---

# Testing

Implement

- Unit Tests
- Integration Tests
- Authorization Tests
- Casbin Policy Tests

Test scenarios include:

- Create/Edit/Delete Role
- Assign/Remove Role
- Duplicate Role Validation
- Permission Enforcement
- Unauthorized Access (403)
- Last System Administrator Protection
- Cache Invalidation After Policy Updates

Target coverage: **>90%** for the RBAC module.

---

# Documentation

Update the following documentation after implementation:

- `/docs/RBAC.md`
- `/docs/API_REFERENCE.md`
- `/docs/AUTHORIZATION.md`
- `/docs/PERMISSIONS.md`
- `README.md`

Documentation must include:

- RBAC architecture
- Entity relationship diagram
- Permission naming conventions
- Casbin integration flow
- API reference
- Frontend page flow
- Audit logging behavior
- Security considerations
- Future extensibility guidelines