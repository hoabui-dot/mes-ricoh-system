# MES Platform — API Style Guide

This document defines the REST API design guidelines, versioning, status codes, and security rules for the MES Platform.

## 1. URI Paths and Versioning

- All REST endpoints are versioned with a prefix of `/api/v1/`.
- Paths must use lowercase plural nouns for resource names:
  - Good: `/api/v1/users`, `/api/v1/workers`
  - Bad: `/api/v1/getUser`, `/api/v1/all-workers`
- Use nested paths for hierarchical resources:
  - `/api/v1/users/{id}/roles` (roles associated with a user)
- Non-CRUD actions use verb endpoints under their resource namespace:
  - `/api/v1/auth/login`
  - `/api/v1/auth/logout`

---

## 2. HTTP Methods

We strictly adhere to HTTP verb semantics:

| Method | Description | Idempotent | Safe |
|---|---|---|---|
| `GET` | Retrieve a resource or list | Yes | Yes |
| `POST` | Create a new resource / perform action | No | No |
| `PUT` | Replace an existing resource | Yes | No |
| `PATCH` | Partially update a resource | No | No |
| `DELETE` | Delete a resource | Yes | No |

---

## 3. JSON Envelope and Error Format

All API responses must follow the unified JSON structure provided by the `/shared/response` package.

### Success Response (Single Resource)
```json
{
  "success": true,
  "data": {
    "id": "c1a938b8-fcfa-48ef-97b7-68b375b43638",
    "username": "johndoe"
  },
  "trace_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "request_id": "ea7b8d4f-3bfb-432d-94cb-16c429dcb6d2"
}
```

### Success Response (List with Pagination)
```json
{
  "success": true,
  "data": [
    { "id": "c1a9..." }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 120,
    "total_pages": 6
  },
  "trace_id": "9b1deb4d...",
  "request_id": "ea7b8d4f..."
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request has invalid fields",
    "details": [
      {
        "field": "email",
        "message": "invalid email format"
      }
    ]
  },
  "trace_id": "9b1deb4d...",
  "request_id": "ea7b8d4f..."
}
```

---

## 4. Status Codes

- `200 OK`: Successful read or update.
- `201 Created`: Successful creation.
- `204 No Content`: Successful action with no return payload (e.g. Logout, Delete).
- `400 Bad Request`: Input validation failed.
- `401 Unauthorized`: Authentication failed or missing token.
- `403 Forbidden`: Authenticated, but user lacks permissions.
- `404 Not Found`: Resource does not exist.
- `409 Conflict`: Duplicate entry or concurrent state update conflict.
- `422 Unprocessable Entity`: Business logic or state machine violation.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Generic unhandled system failure.

---

## 5. Security & Authentication

- Protect endpoints with `middleware.Authenticate(jwtManager)`.
- Access tokens must be supplied in the `Authorization` header as a Bearer token:
  `Authorization: Bearer <token>`
- Enforce rate-limiting on sensitive auth endpoints using the sliding window Redis rate-limiter middleware.
- Configure proper CORS settings (restricting origins to frontend ports, allowing specific headers).
- Leverage Casbin enforcer rules within controller actions before performing CRUD logic.
