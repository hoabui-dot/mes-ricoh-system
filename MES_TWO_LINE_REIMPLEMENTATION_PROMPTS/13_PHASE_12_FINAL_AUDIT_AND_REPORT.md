# Phase 12 — Final Architecture Audit, Documentation Update, and Release Report

## Objective

Perform an independent final audit against `WO-2-LINE.md`, the approved Phase 1 contract, and the implemented source.

## Audit checklist

### Domain

- one Work Order selects one complete line,
- deterministic Primary/Backup priority,
- complete-line feasibility before selection,
- one bad candidate does not unnecessarily fail a line,
- zero candidates on one mandatory operation blocks a line,
- Backup fallback works,
- both blocked -> `RESOURCE_HOLD`,
- no post-start silent line hot-switch.

### Master Data

- Line -> Work Center manageable from supported API/UI,
- Line Resource Scope manageable from supported API/UI,
- hierarchy validation is enforced,
- release/readiness gate exists,
- Production Version eligibility is explicit.

### Execution

- line feasibility is side-effect-free,
- candidate generation is selected-line scoped,
- resource commit cannot cross lines,
- revalidation/approval/start guards are preserved,
- persisted diagnostics explain decisions.

### MES Console

- Production Line workspace is usable,
- no direct DB setup is needed for normal configuration,
- selected line/fallback/hold are visible,
- evaluated-line matrix is understandable,
- frontend does not duplicate backend decision logic,
- i18n and operator-facing business labels are correct.

### Architecture

- no cross-service DB access,
- no broken outbox/event contract,
- additive migrations only,
- no accidental route/API deletion,
- no regression in existing MES flows.

## Documentation updates

Update `WO-2-LINE.md` only where the implemented, approved behavior now differs from stale text. Preserve useful business explanations. Clearly distinguish current implemented behavior from future backlog.

Create a final developer/operator document that explains:

- how to configure LINE-1 and LINE-2,
- how to attach Work Centers,
- how to configure resource scopes,
- how to release lines,
- how to configure Production Version Primary/Backup eligibility,
- how automatic line selection works,
- how exact resource planning works,
- how fallback and `RESOURCE_HOLD` work,
- how to diagnose failures in MES Console.

## Final report

Create:

`AI_document/two-line/PHASE_12_FINAL_REPORT.md`

It must include:

- executive summary,
- architecture before/after,
- all schema/API/UI changes,
- all migrations,
- all tests executed,
- canonical scenario results,
- unresolved backlog,
- known non-blocking limitations,
- final status exactly one of:
  - `READY_FOR_RELEASE`
  - `NOT_READY_FOR_RELEASE`

Do not mark `READY_FOR_RELEASE` when any Phase 11 mandatory scenario is failing or skipped.
