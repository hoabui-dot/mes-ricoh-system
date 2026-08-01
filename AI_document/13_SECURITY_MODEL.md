# Security Model

## Authentication

Keycloak realm `wonsealtech` is the identity provider. Portal, MES, WMS, and QMS use separate clients. Browser users authenticate through Keycloak; the shared browser session avoids repeated passwords across apps.

Kiosk gateway terminal login uses Keycloak password grant according to its service manifest.

## Authorization

Role-based access is based on realm roles and service/API checks. Resource scope/ABAC-style rules exist in master data through role permission and user resource scope concepts.

Implemented route evidence:

- MES execution resource allocation mutation allows `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`.
- Other role checks vary by service and must be verified before relying on them.

## Keycloak

Keycloak is the single login authority. Do not create independent browser login or store password credentials in application databases.

## RBAC and ABAC

RBAC: role codes such as `PROD_MANAGER`, `PLANNER`, `OPERATOR`, `EXECUTIVE`.

ABAC/resource scope: site, area, Work Center, Workstation, and resource-scope concepts are documented in product docs. Full enforcement coverage is not proven for every route.

## JWT

WMS and QMS Kong routes are documented as enforcing bearer-token signature, expiry, client (`azp`), and role checks. MES browser SSO is live, but legacy MES Kong routes still need equivalent enforcement according to `AI_CONTEXT.md`.

## Internal Service Authentication

Unknown: a uniform service-to-service authentication policy is not fully proven. Current manifests emphasize gateway forwarding, circuit breakers, and explicit dependencies.

## Gateway

Kong owns external routing, CORS, auth forwarding, and service path mapping. Services should not trust browser-provided `X-Role-Code` unless Kong validates/overwrites it.

## Audit Logging

Audit exists through DB triggers, app user context, outbox events, approval logs, allocation audit, print job events, QMS state changes, and service logs. Compliance-grade audit completeness requires service-by-service verification.

## Zero Trust

Required rule for future changes: treat every service boundary as untrusted unless authenticated/authorized explicitly. Do not add direct database access to bypass APIs/events.

## Security Boundaries

- Browser to Kong/Keycloak.
- Kong to backend services.
- Service to own DB.
- Service to Kafka.
- Remote Printer Adapter to Kafka/physical printer.

## Known Security Gaps

- MES legacy Kong bearer enforcement not fully equivalent to WMS/QMS.
- Complete negative authorization browser coverage is not implemented.
- Plain forwarded role headers are risky without gateway enforcement.
