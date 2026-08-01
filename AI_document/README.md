# AI Documentation Library

This folder is the AI onboarding library requested by `process-fix/AI-Documentation-Expansion-Task.md`.

Use it together with:

- `AI_CONTEXT.md`: compact canonical implementation context.
- `UI_AI_CONTEXT.md`: MES Console UI rules.
- `product-doc/`: product and business catalogs.

## Reading Order

1. `00_PROJECT_OVERVIEW.md`
2. `01_BUSINESS_DOMAIN.md`
3. `02_BUSINESS_GLOSSARY.md`
4. `03_SYSTEM_ARCHITECTURE.md`
5. `06_SERVICE_BOUNDARIES.md`
6. `14_WORKFLOW_AND_USECASES.md`
7. `18_AI_DEVELOPMENT_RULES.md`
8. Relevant detailed topic files from `07` through `17`

## Source-Truth Rule

When this library conflicts with code, migrations, manifests, or tests, the implementation wins. Product documents explain intent and business vocabulary, but they do not prove behavior is implemented.

## Evidence Map

| Topic | Primary evidence |
|---|---|
| System overview and ownership | `AI_CONTEXT.md`, `services/*/service.manifest.yaml`, `infra/docker-compose*.yml` |
| MES UI rules | `UI_AI_CONTEXT.md`, `services/mes-console/src/App.tsx`, `services/mes-console/src/routes` |
| MES execution APIs | `services/mes-execution-service/internal/infrastructure/http/router.go` |
| MES master-data APIs | `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts` |
| MES traceability APIs | `services/mes-traceability-service/internal/infrastructure/http/router.go` |
| MES kiosk gateway APIs | `services/mes-kiosk-gateway-service/internal/infrastructure/http/router.go`, service manifest |
| QMS APIs | `services/qms-inspection-service/src/infrastructure/http/inspection.router.ts`, `services/qms-nonconformance-service/src/infrastructure/http/nonconformance.router.ts` |
| QMS UI routes | `services/qms-console/src/routes.tsx` |
| Event contracts | `services/*/service.manifest.yaml`, `infra/schemas`, event consumers/producers |
| Database design | `services/*/migrations`, `infra/postgres`, `product-doc/MES-DATABASE-ERD-AND-RELATIONSHIPS.md` |
| Business process | `product-doc/product-doc.md`, numbered product catalogs |
| Verification | `docs/testing`, `scripts`, `AI_CONTEXT.md` |

## Important Scope Note

This checkout contains MES, QMS, Portal, Kiosk, and Print Station source. It does not currently contain WMS service source under `services/`. WMS behavior in this library is therefore documented from canonical context, product docs, and MES/WMS integration references unless a local WMS source file is later added.
