# Phase UI-06 Report - Resource Foundation And Planning Constraint Alignment

Date: 2026-08-02

Status: PASSED

Gate: `PHASE_UI_06_PASSED_READY_FOR_UI_07`

## Scope Implemented

- Aligned Production Line list with Site / Area / Shopfloor context, lifecycle, effectivity, Work Center count, eligible Production Version count, and backend-authored readiness summary.
- Added Production Line detail tabs:
  - Overview
  - Work Centers
  - Eligibility
  - Readiness
  - Audit / History
- Extended master-data API detail payloads so Work Center and Workstation screens can show authoritative resource-planning evidence:
  - line memberships
  - operation capabilities
  - resource calendars
  - production standards
  - assignment history
- Kept Work Center as logical routing responsibility and Workstation as execution identity; Work Center detail does not become an execution candidate selector.
- Preserved the existing Machine Definition vs physical Machine Unit distinction through Machine list/detail and Machine Unit panels.
- Reworked planning constraint forms to use constrained selectors instead of free-form values where enums/source lists exist:
  - Resource Calendar resource type: `Equipment`, `WorkCenter`, `Workstation`
  - Resource Calendar availability status: `Available`, `PlannedDown`, `Holiday`
  - Production Standard source method: `Engineering`, `TimeStudy`, `Imported`, `ApprovedOverride`
- Added dependent reset behavior for Site / Work Center / resource type selectors.

## Changed Files

- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx`
- `services/mes-console/src/routes/master-data/PlanningConstraintsScreen.tsx`
- `services/mes-console/src/i18n.ts`
- `e2e/resource-planning/phase6-production-lines.spec.ts`

## Artifacts

Artifact run directory:

`artifacts/mes-console-remediation/phase-06/phase-06-20260802T165308Z/`

Required files produced:

- `manifest.json`
- `baseline.json`
- `changes.json`
- `build-results.json`
- `api-integration-results.json`
- `browser-e2e-results.json`
- `cleanup-results.json`
- `acceptance-results.json`
- `resource-hierarchy-before.json`
- `resource-hierarchy-after.json`
- `readiness-api-contract.json`
- `resource-form-option-matrix.json`
- `resource-e2e-screenshot-index.json`

## Verification

Passed:

- `npm run typecheck --workspace services/mes-console`
- `npm run build --workspace services/mes-master-data-service`
- `docker build -t mom-platform-mes-master-data-service -f services/mes-master-data-service/Dockerfile .`
- `docker build -t mom-platform-mes-console -f services/mes-console/Dockerfile --build-arg VITE_KEYCLOAK_URL=http://100.68.50.41:18080 --build-arg VITE_API_BASE_URL=http://100.68.50.41:18000 .`
- `MES_ENV=development ALLOW_TWO_LINE_MASTER_DATA_MUTATION=true npm run test:mes:two-line-master-data:phase6`
- `npm run test:e2e:resource-planning:phase6`
- `npm run test:mes:product-definition-ui:phase5`
- `npm run test:e2e:product-definition-ui:phase5`
- `npm run test:e2e:shared-ui:phase4`
- `npm run prepare:mes:two-line-uat`
- `npm run test:e2e:route-navigation:phase3`
- `npm run verify:mes:two-line-uat`
- `npm run cleanup:mes:two-line-uat`
- `npm run test:e2e:resource-planning:phase4`
- `npm run verify:mes:canonical-seed`

Note:

- An optional broader `npm run test:e2e:resource-planning:phase3` run stopped in the print-on-approval path while the Work Order stayed Draft after approval. This path is outside UI-06 and was skipped under the instruction to skip print station / third-party cases.
- The first route-navigation regression attempt failed because the UAT manifest referenced a cleaned-up Work Order. After `npm run prepare:mes:two-line-uat`, route-navigation passed.

## Deployment

Restarted local containers:

- `mes-master-data-service`
- `mes-console`

Console URL:

`http://100.68.50.41:13052`

## Final Gate

`PHASE_UI_06_PASSED_READY_FOR_UI_07`
