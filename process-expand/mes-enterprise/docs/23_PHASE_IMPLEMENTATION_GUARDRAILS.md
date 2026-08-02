# MES Phase Implementation Guardrails

## 1. Purpose

This document governs every implementation phase related to MES Resource Planning, Work Order planning, Production Line selection, two-line fallback, migrations, testing, cleanup and deterministic seed data.

These rules are mandatory.

No phase may bypass them.

---

## 2. Source of Truth

Use the following precedence:

1. Running source code.
2. Database migrations and schema.
3. Service manifests.
4. Docker Compose and runtime configuration.
5. Automated API tests.
6. Browser E2E tests.
7. Current API handlers, use cases, repositories, producers and consumers.
8. Approved architecture decision records.
9. AI_CONTEXT.md and UI_AI_CONTEXT.md.
10. AI_document.
11. Product documents.
12. Historical prompts.

When sources conflict, report the conflict.

Do not silently select the most convenient interpretation.

---

## 3. Phase Gate Rule

Every phase follows:

```text
Inspect
→ Document
→ Design
→ Implement
→ Migrate
→ Test
→ Verify
→ Fix
→ Retest
→ Report
→ Gate

A phase is not complete while:

a mandatory test fails;
a required scenario is skipped;
a migration is unverified;
an invariant is unproven;
cleanup leaves orphan rows;
documentation differs from implemented behavior;
a known defect is hidden as a limitation.

Do not start the next phase until the current phase passes.

4. Enterprise Service Ownership
A service owns its database.
Never read another service database.
Never create cross-database foreign keys.
Never introduce a distributed database transaction.
Use APIs, events, snapshots and projections across service boundaries.
Never create a second authority for an existing business concept.

Examples:

MES Master Data owns Resource Assignment.
MES Execution owns Work Order Resource Allocation.
WMS owns inventory truth.
QMS owns inspection and nonconformance.
Traceability owns labels and genealogy.
Print Station owns printer runtime.
5. Resource Model Invariants

The following concepts are different and must remain different:

Routing Operation
Work Center
Production Line
Workstation
Machine Requirement
Resource Assignment
Machine Definition
Physical Machine Unit
Work Order Resource Allocation
Capacity Reservation

Rules:

Routing defines what must be performed.
Production Line defines the selected execution scope.
Work Center defines logical capability/capacity.
Workstation defines the operator execution point.
Machine Requirement defines what is required.
Resource Assignment defines effective master-data availability.
Work Order Resource Allocation defines runtime commitment.
Capacity Reservation prevents conflicting commitments.

Never collapse these concepts into one table or field.

6. Two-Line Invariants

For the standard two-line flow:

One Work Order selects exactly one Production Line.
All mandatory Work Order Operations belong to that selected line.
Per-operation independent line selection is forbidden.
The primary line is evaluated first.
A backup line may be selected only when the complete backup line is feasible.
A line is Ready only when every mandatory operation is feasible.
A Work Order with no complete feasible line enters RESOURCE_HOLD.
A mixed-line allocation must be rejected by the backend.
The selected line is snapshotted.
Master-data changes must not rewrite an existing Work Order.
Post-start line transfer is not implemented unless a separate approved Execution Segment or Child Work Order design exists.
7. Product Definition Invariants
Item owns stable product identity.
Item Revision owns version, lifecycle, effectivity and UOM.
EBOM is an engineering baseline.
EBOM does not drive Work Order material requirements.
MBOM owns manufacturing material requirements.
Routing owns process operations and dependencies.
Production Version owns the released production configuration.
Work Order creation uses production_version_id.
The browser must not independently choose conflicting MBOM and Routing IDs.
Work Order snapshots are execution authority.

Do not create separate Routings only because physical lines or machines differ.

Create a new Routing only when the technical process differs.

8. Historical Integrity
Never rewrite Released master data in place when referenced.
Never rewrite Work Order snapshots.
Never delete allocation history.
Never overwrite Resource Assignment history.
End effective rows using effectivity.
Reallocation supersedes previous runtime allocation.
Cancellation preserves audit.
Create new versions or revisions for changed production definitions.
9. Migration Rules
Migrations are forward-only.
Never edit an applied migration.
Prefer additive schema changes.
Preserve backward compatibility.
Backfill only when relationships are unambiguous.
Report ambiguous rows for manual resolution.
Do not assign historical Work Centers to arbitrary Production Lines.
Do not drop legacy fields until every consumer is migrated and verified.
Every migration must have rollback or operational recovery instructions, even when SQL rollback is not supported.
10. API Rules
Backend validation is authoritative.
Candidate APIs are advisory.
Commit APIs must revalidate.
Mutations must preserve idempotency.
Reusing an idempotency key with a different payload must fail.
Capacity conflicts must return stable error codes.
Preserve correlation and trace IDs.
Do not trust browser-provided role headers outside a validated gateway boundary.
Return structured blockers for line, operation and resource readiness.
Do not invent an API without implementing and testing it.
11. Event Rules
Publish only implemented facts.
Use outbox for meaningful state transitions where required.
Consumers must be idempotent.
Consumers must tolerate redelivery.
Commit offsets only after safe persistence.
Do not assume global Kafka ordering.
Version event names.
Do not reuse an unrelated event for a new line-selection fact.
Do not claim DLQ behavior unless it is implemented and verified.
12. UI Rules
Backend state is authoritative.
Frontend must not independently calculate readiness.
Frontend must not change Blocked to Ready.
Use Base components.
Use TanStack Query for server state.
Invalidate and refetch after mutations.
Localized name is primary.
Business code is secondary.
UUIDs are not user-facing identities.
Translate statuses, roles and errors.
Never display raw enum values or [object Object].
Destructive and high-impact replan actions require confirmation.
Replan actions require impact explanation and reason where applicable.
13. Testing Rules

Every relevant phase must include:

unit tests;
API integration tests;
negative tests;
concurrency tests;
migration tests;
browser E2E;
persistence after refresh;
authorization tests;
exact cleanup verification.

A skipped test is not passed coverage.

Required test reports must include:

declared;
executed;
passed;
failed;
skipped;
skip reason;
command;
environment;
artifacts.
14. Seed and Cleanup Rules
Cleanup is allowed only in disposable environments.
Require ALLOW_DESTRUCTIVE_SEED=true.
Refuse production-like environments.
Print target environment and databases.
Audit row counts before deletion.
Delete child-first.
Use exact identifiers.
Never broaden cleanup based on loose code prefixes without additional guards.
Verify zero target orphans.
Seed data must be deterministic.
Seed data must be rerunnable.
Default seed must represent a valid Ready system.
Failure scenarios must use explicit scenario toggles or dedicated scripts.
Do not weaken validation to make seed pass.
15. Documentation Rules

After every phase, update:

architecture documentation;
database documentation;
API documentation;
event documentation;
testing coverage;
known limitations;
AI development rules when needed.

Use one of:

IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_NOT_FULLY_VERIFIED
PARTIALLY_IMPLEMENTED
DEMO_ONLY
DEPRECATED_COMPATIBILITY
NOT_IMPLEMENTED
UNKNOWN
REQUIRES_PRODUCT_DECISION

Never document planned behavior as implemented behavior.

16. Failure Handling

When a phase fails:

Stop the phase.
Preserve logs and test artifacts.
Identify root cause.
Determine whether the failure is:
code defect;
migration defect;
data defect;
test defect;
environment defect;
architecture conflict;
missing product decision.
Fix inside the same phase.
Rerun all phase tests.
Rerun affected regression tests.
Update the phase report.
Continue only when the gate passes.

Do not bypass or disable a failing test merely to continue.

17. Prohibited Actions

Never:

bypass strict Resource Planning;
hardcode Line 1 or Line 2 in business logic;
select fallback line in the frontend;
duplicate Routing for identical technical processes;
duplicate Equipment assignment ownership;
expose UUIDs;
mutate Released history;
edit applied migrations;
delete production data;
weaken security;
introduce direct cross-service database access;
add a demo flag as production policy;
silently ignore failed line operations;
allow a Work Order to mix Production Lines;
start execution with incomplete mandatory allocations;
claim successful verification without exact test evidence.
18. Final Definition of Done

The complete program is done only when:

current Resource Planning baseline is verified;
Product Definition and Work Order snapshots are verified;
Production Line master data is implemented;
Production Version supports multiple line eligibility;
one Work Order selects one complete line;
primary-to-backup fallback is deterministic;
mixed-line allocations are impossible;
API tests pass;
browser E2E tests pass;
concurrency tests pass;
migrations pass;
reset and seed pass;
seed verification passes;
documentation matches implementation;
all remaining limitations are explicitly accepted.