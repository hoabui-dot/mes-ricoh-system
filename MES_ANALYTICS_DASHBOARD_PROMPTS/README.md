# MES Analytics Dashboard Prompt Package

This package implements an operational MES analytics dashboard directly from current owner-service databases.

No Data Warehouse is introduced.

## Optimized phase plan

```text
Phase 00 — Source audit + metric catalog + final dashboard contract
Phase 01 — Execution analytics backend
Phase 02 — Master Data + Traceability analytics backend
Phase 03 — Frontend foundation + Overview
Phase 04 — Deep-dive pages + report tables
Phase 05 — Performance + UX + i18n + accessibility
Phase 06 — Full E2E certification
```

This phase split is intentionally compact to save AI token/quota usage.

Phase 00 creates a source map and metric catalog. Later phases must reuse them instead of rescanning the whole repository.

## How to execute

For each phase, provide the implementation AI:

```text
AI_document/MES-Analytics/GLOBAL_RULES.md
AI_document/MES-Analytics/ANALYTICS_BASELINE_AND_METRIC_CATALOG.md  # after Phase 00
previous phase report
active PROMPT_PHASE_XX.md
```

Run one phase at a time.

Do not automatically execute the next phase.

Every phase must create a Vietnamese report.
