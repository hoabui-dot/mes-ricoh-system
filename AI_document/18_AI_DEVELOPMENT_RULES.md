# AI Development Rules

## Source Precedence

Use this order:

1. Running source code.
2. Service manifests.
3. Docker Compose and infrastructure configuration.
4. Database migrations and schemas.
5. Automated tests.
6. API handlers, domain logic, repositories, consumers, producers, frontend behavior.
7. Implementation records.
8. Existing AI context.
9. Product catalogs and design documents.
10. Historical prompts and planning documents.

## Hard Rules

- Never bypass business validation.
- Never duplicate ownership.
- Never modify historical/released records in place.
- Never invent APIs or events.
- Never expose UUIDs to users as primary labels.
- Never weaken lifecycle, effectivity, UOM, resource, traceability, material, quality, or security rules to make a demo pass.
- Never read another service database.
- Never make frontend filtering the authority.
- Never turn demo flags into production behavior.
- Never reintroduce direct HTTP production print commands when Kafka is the normal transport.

## Documentation Rules

If not proven, write:

```text
Not implemented
Unknown
Future work
Requires product decision
```

Do not fill gaps with generic MES knowledge.

## Implementation Rules

- Read the relevant product docs and source before editing.
- Keep changes scoped.
- Preserve existing UI and API patterns.
- Use existing shared components/helpers.
- Add migrations forward-only.
- Add tests proportional to risk.

## Resource Planning Rules

- Routing Operation owns Work Center.
- Resource Planning selects runtime Workstation/resources.
- `md_resource_assignment` is master-data assignment authority.
- `wo_resource_allocation` is execution runtime commitment.
- Machine Definition and Machine Unit are distinct.

## Work Order Rules

- Work Order uses Production Version authority.
- Snapshots must preserve historical configuration.
- Later master data changes must not rewrite existing WOs.
- Strict mode requires valid planning/readiness before execution.

## UI Rules

- Localized name first, code second.
- Translate statuses/errors.
- Do not show raw enum keys or `[object Object]`.
- Use confirmations for destructive actions.
- Hydrate edit forms from latest backend data.

## Security Rules

- Use Keycloak/Kong boundaries.
- Treat forwarded user/role headers as trusted only behind validated gateway paths.
- Never store secrets in code or plain-text config.
