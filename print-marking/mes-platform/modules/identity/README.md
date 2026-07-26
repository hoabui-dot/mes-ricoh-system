# Identity Module

## Purpose
The Identity module manages user registration, authentication, token rotation, user profiles, audit logging, and Casbin-based RBAC permissions.

## Responsibilities
- User account creation, profile management, and state transitions (Active, Inactive, Suspended).
- Password validation against complexity policy and password reset flows.
- JWT Access token generation and refresh token rotation/revocation.
- Casbin policy configuration and permission evaluation.
- Transactional Outbox publishing for security events (UserRegistered, UserLoggedIn, PasswordChanged, StatusChanged).

## Dependencies
- `shared/domain`: Embedding BaseEntity, AggregateRoot, DomainEvent.
- `shared/outbox`: Storing events transactionally in `identity_outbox_events`.
- `pkg/jwt`: Token validation and generation.
- `pkg/logger`: Context-scoped logging.
- `pkg/redis`: Idempotency keys, refresh token session checks, rate limiting counter.
- `pkg/postgres` (GORM): Physical tables queries and migrations.

## Coding Rules
- Handlers in `/presentation/handler/` must not contain business rules; they must delegate to `service.IdentityService`.
- Permission checks must call Casbin enforcer methods (`EnforcePermission`) instead of hardcoding roles.
- Business validation (like email formatting or password policy checks) must reside in `/domain/entity/`.
