# Phase 08 MES Fixture And WMS Reverification

Date: 2026-08-04
Requirement: `/home/neurosus/recoh-system/ricoh-wms/docs/enteprise-wms/SUPPORT_PHASE_08_MES_FIXTURE_AND_FULL_REVERIFICATION/`.

## Result

`RUNTIME_VERIFIED` for released MES fixture, resource planning, approval, WMS staged material flow, and WMS shortage flow. Physical print was not re-exercised.

## Changes

- Added guarded MES fixture projection for line eligibility, resource capabilities, and production standards.
- Set fixture eligibility effective from the target planning date, preventing false `ResourceHold` outcomes.
- Passed MES component revision and work-center IDs to the separate WMS demo seed so WMS Outbound resolves MES event identity and staging locations.
- Fixed approval transaction ordering so material requirement rows are fully read and closed before writing `MaterialRequirementPublished` outbox events.
- Applied/redeployed additive master-data migrations `0066` and `0067`.

## Evidence

- `WO-20260804-0015`: WMS request `MR-F87F36B1`, `Staged`, `shortfall_qty=0`; MES requirement updated to `Staged`.
- `WO-20260804-0016`: WMS request `MR-01EDA5EF`, `Shortage`, `shortfall_qty=2`; MES requirement updated to `Shortage`.
- `go test ./...`, master-data build, syntax checks, and Docker redeploy passed.

## Risks

Schema Registry compatibility warnings remain non-blocking runtime warnings. Physical print and the broader remaining release matrix are still open.
