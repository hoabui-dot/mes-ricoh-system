# Phase 1 — Verify and Harden the Existing MES Resource Planning Domain

Do not implement Production Line selection in this phase.

## Objective

Prove that the current Work Center, Workstation, Equipment, Machine Unit, Resource Assignment, calendar, standard, candidate resolution and Work Order Resource Allocation flow is correct and production-safe.

## Required domain invariants

Verify that:

- Routing Operation owns the logical Work Center.
- Candidate Workstations belong to the Routing Work Center and Site.
- Machine Requirements describe required resource demand.
- Resource Assignments describe currently effective assigned resources.
- Machine Definitions are not treated as Physical Machine Units.
- Pending or unidentified Machine Units are not planning candidates.
- Required and Primary machine gaps block readiness.
- Optional supporting gaps only produce warnings when policy permits.
- Candidate responses are advisory.
- Allocation commit performs authoritative transactional revalidation.
- Exclusive overlapping reservations cannot coexist.
- Allocation history is preserved.
- Reallocation supersedes rather than rewrites history.
- Cancellation removes active reservations without deleting audit history.
- Approval revalidates committed resources.
- Execution does not use uncommitted resources.

## Required negative scenarios

Add or repair API-level tests for:

- missing Primary Machine Requirement;
- insufficient physical Machine Units;
- expired Resource Assignment;
- Workstation in another Work Center;
- Machine Unit in another Site;
- Machine Unit under maintenance;
- Machine Unit out of service;
- Machine Unit not planning eligible;
- unavailable Resource Calendar;
- invalid Shift;
- missing Production Standard;
- stale candidate;
- simultaneous allocation conflict;
- idempotent replay;
- reused idempotency key with a different request;
- reallocation;
- allocation cancellation;
- approval after resource state changed;
- execution start without valid allocation;
- unauthorized role.

## Implementation constraints

- Preserve service ownership.
- Do not add cross-database reads.
- Do not weaken strict validation to make tests pass.
- Do not edit historical migrations.
- Add forward-only migrations only when required.
- Reuse existing error codes when equivalent.
- Preserve current API compatibility where possible.

## Required report

Create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-1/mes-resource-planning-domain-verification-YYYYMMDD.md`

The report must include:

- defects found;
- root cause;
- code changes;
- migrations;
- tests added;
- commands executed;
- pass/fail results;
- remaining gaps.

## Phase completion gate

The phase is complete only when all required API scenarios pass repeatedly and no known resource invariant remains unverified.