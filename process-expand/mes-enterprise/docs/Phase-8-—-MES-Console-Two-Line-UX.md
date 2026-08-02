# Phase 8 — Implement MES Console Two-Line Planning UX

## Objective

Expose backend-owned Production Line eligibility, selection, fallback and line-wide Resource Planning in MES Console.

## Work Order creation UI

Add:

- line selection mode: Auto or Manual when policy permits;
- eligible line preview;
- primary/backup identity;
- readiness summary;
- translated blockers;
- clear notice that one Work Order uses one line.

The browser must not independently calculate line readiness.

## Work Order detail UI

Display:

- selected Production Line;
- selection mode;
- primary line result;
- backup line result;
- fallback reason;
- line lock state;
- line-level readiness;
- operation-level readiness;
- current allocations;
- replan eligibility.

## Resource candidate UI

- show only candidates returned by backend;
- make selected line visible;
- disable or hide cross-line candidates;
- show backend blockers;
- never convert a blocked line or candidate to Ready.

## Replan UI

Before Release:

- allow authorized re-evaluation or line change.

After Release and before Start:

- require shared confirmation;
- require reason;
- display impact;
- call audited backend action.

After Start:

- do not expose in-place line remap;
- explain that partial transfer requires a separate workflow.

## i18n

Add VI, EN, JA and KO translations for:

- Production Line;
- Primary Line;
- Backup Line;
- Auto Selection;
- Manual Selection;
- Fallback;
- Resource Hold;
- Line Locked;
- Mixed Line Rejected;
- Replan Required;
- all new backend error codes.

## E2E coverage

Add browser tests for:

- primary selected;
- backup fallback;
- both lines blocked;
- manual line selection;
- unauthorized manual selection;
- replan before release;
- rejected line change after start;
- page refresh persistence;
- translated fallback and blockers;
- no raw UUIDs or raw error keys.

## Required report

Create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-8/mes-two-line-console-e2e-YYYYMMDD.md`