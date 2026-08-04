MES Requirements for Continuing WMS Recovery and Completion Phases

Document Status

Status: IMPLEMENTATION-READY MES ACTION REPORT

Date: 2026-08-04

Target repository: MES system repository

Primary consumer: AI implementation agent working inside MES

Related WMS recovery scope:

SUPPORT_PHASE_07_MIGRATION_RUNTIME_AND_FAILURE_REHEARSAL.md

SUPPORT_PHASE_08_RETURN_TO_MAIN_PHASES_AND_FULL_REVERIFICATION.md

Main purpose: define the MES-owned work required so WMS can continue and close the remaining recovery, runtime, and full-flow verification phases.

1. Executive Summary

Kafka transport between MES Execution and WMS Outbound is live and runtime-verified.

The following path is already proven:

MES Execution
-> MES.Execution.MaterialStagingRequested.v1
-> Kafka
-> WMS Outbound inbox
-> WMS material request processing
-> WMS.Outbound.MaterialStaged.v1
   or WMS.Outbound.MaterialShortageDeclared.v1
-> Kafka
-> MES Execution result consumer

The remaining blocker is not Kafka connectivity.

The current MES execution database contains no Work Orders and no material requirements. Because no MES-owned aggregate exists, WMS result events cannot be verified against a real MES business row.

MES must now provide deterministic, disposable, API-owned business fixtures and run the actual MES stage-materials flow. MES must not expect WMS to insert directly into MES tables.

Redis is not required for this material-staging integration path. Do not add Redis to this flow unless a separate approved platform decision defines ownership and failure semantics.

2. Objectives

MES must deliver the following outcomes:

Create deterministic disposable MES business fixtures.

Create at least one released Work Order.

Create released material requirements attached to that Work Order.

Ensure the Work Center and item-revision references map to current WMS master and staging data.

Execute the real MES stage-materials API or application use case.

Verify WMS Staged and Shortage results update MES-owned records correctly.

Verify duplicate, stale, missing, and conflicting results safely.

Verify outbox, Kafka, inbox, consumer restart, and acknowledgement-loss behavior.

Provide runtime evidence artifacts for WMS Phase 07 and Phase 08.

Preserve MES ownership and prevent cross-database coupling.

3. Scope

3.1 In Scope

MES work in this report includes:

MES Work Order fixture creation;

Work Order release state;

material requirement fixture creation;

material requirement release/readiness state;

Work Center mapping;

item revision mapping;

stage-materials command execution;

MES outbox verification;

Kafka request publication;

WMS result consumption;

MES requirement-state update;

duplicate result handling;

stale result handling;

unknown aggregate handling;

consumer restart;

Kafka outage and recovery;

result reconciliation;

Schema Registry compatibility verification;

full runtime evidence capture.

3.2 Out of Scope

Do not implement the following as part of this report:

direct WMS writes into MES databases;

shared MES/WMS tables;

Redis coupling for material staging;

Wave Picking;

Quality Management;

ASN;

Cross Dock;

Cycle Count;

unrelated Print Station Redis changes;

production data creation outside an approved environment.

4. Confirmed Ownership

Domain

Owner

Work Order

MES

Material requirement

MES

Work Center execution context

MES

MES requirement status

MES

Warehouse stock sufficiency

WMS Inventory

Warehouse balances, reservations, lots, and movements

WMS Inventory

Material staging request state

WMS Outbound

Material staged/shortage result

WMS Outbound

Kafka transport

Platform

MES request outbox

MES

WMS result outbox

WMS

MES result inbox/consumer state

MES

Schema subjects and compatibility governance

Platform plus producing domain

MES must never read or write WMS databases directly.

WMS must never create or mutate MES Work Orders or material requirements directly.

5. Current Verified Integration Baseline

The AI must preserve the following already verified behavior:

shared Kafka broker connectivity works;

MES publishes MES.Execution.MaterialStagingRequested.v1;

WMS Outbound consumes the request;

WMS Outbound persists the event as PROCESSED;

WMS publishes WMS.Outbound.MaterialStaged.v1 or WMS.Outbound.MaterialShortageDeclared.v1;

MES result consumer receives WMS result events;

consumer lag can return to zero;

WMS result subjects are registered in Schema Registry;

no Redis dependency exists in this path.

Do not rewrite this working boundary without evidence of a defect.

6. Primary MES Blocker

The running MES database currently contains:

Work Orders: 0
Material requirements: 0

Therefore the MES result consumer has no matching aggregate to update.

This must be classified as:

BLOCKED_BY_MES_BUSINESS_FIXTURE

It must not be classified as:

KAFKA_FAILURE
WMS_FAILURE
REDIS_FAILURE

7. Required MES Business Fixtures

MES must provide a deterministic and disposable seed or API-driven fixture flow.

7.1 Required master references

Create or reuse valid MES-owned references for:

site or plant;

Work Center;

item revision;

UOM;

production routing or operation context where required;

operator/service identity required by MES authorization.

7.2 Required Work Order

Create one Work Order with at least:

workOrderId
workOrderCode
siteId
workCenterRef
status = RELEASED or equivalent executable state
itemRevisionId
plannedQuantity
uomCode
version
createdAt
releasedAt

7.3 Required material requirements

Create at least two material requirements:

Requirement A — Shortage scenario

requiredQuantity > available WMS storage stock
expected WMS result = Shortage

Requirement B — Staged scenario

requiredQuantity <= available WMS storage stock
expected WMS result = Staged

Each requirement must include:

requirementId
workOrderId
workCenterRef
itemRevisionId
requiredQuantity
uomCode
status
version

7.4 Mapping requirements

MES fixture values must match WMS data for:

work_center_ref;

item_revision_id;

uom_code;

Work Center staging location;

warehouse/site context.

Do not create mismatched random identifiers and then treat the resulting rejection as integration failure.

8. Fixture Creation Rules

MES must create fixtures through one of these approved paths, in order of preference:

Existing MES public API.

Existing MES application service/use case.

Existing MES deterministic seed framework.

A new MES-owned recovery seed command.

Direct database fixture only inside a disposable automated test environment and only when no supported domain path exists.

WMS must not insert rows into MES tables.

Fixture creation must be:

repeatable;

isolated by recovery scope;

safe to rerun;

easy to clean up;

version-aware;

deterministic;

documented.

Recommended scope identifier:

recovery-YYYYMMDD-<unique-suffix>

9. Required MES Stage-Materials Flow

The AI must execute the real MES flow:

create/reuse released Work Order
-> create/reuse material requirement
-> invoke MES stage-materials API/use case
-> write MES outbox event
-> publish MES.Execution.MaterialStagingRequested.v1
-> WMS Outbound consumes request
-> WMS evaluates stock/staging
-> WMS publishes Staged or Shortage
-> MES consumes result
-> MES updates material requirement
-> MES exposes updated status through API/read model

Do not publish a hand-crafted Kafka event as the only evidence.

A hand-crafted event may be used for transport smoke, but it does not satisfy the full business-flow requirement.

10. Required MES State Transitions

MES must define and implement explicit transitions for material requirements.

Recommended conceptual states:

PENDING_STAGING
STAGING_REQUESTED
STAGED
SHORTAGE
REJECTED
RETRY_PENDING
CONFLICT
CANCELLED

Use existing MES status names where they already exist. Do not introduce duplicate status vocabularies without migration and compatibility analysis.

10.1 Staged result

On WMS.Outbound.MaterialStaged.v1, MES must persist:

WMS material request ID;

WMS transaction/result event ID;

staged quantity;

staging location;

accepted requirement IDs;

result timestamp;

source version where available;

correlation ID;

trace ID;

final MES requirement status.

10.2 Shortage result

On WMS.Outbound.MaterialShortageDeclared.v1, MES must persist:

WMS material request ID;

requested quantity;

available quantity;

shortage quantity where derivable;

business error/status;

result timestamp;

correlation ID;

trace ID;

retryability or operator-action requirement;

final MES requirement status.

11. Idempotency Requirements

MES must process each WMS result exactly once in business effect.

Required behavior:

same event ID and same payload: successful no-op;

same event ID and different payload: durable conflict;

duplicate result after restart: no second state transition;

duplicate Staged result: no duplicate MES completion;

duplicate Shortage result: no duplicate alert or workflow mutation;

retry after timeout: return current authoritative state;

unknown requirement ID: preserve evidence and route to reconciliation/DLQ policy.

The AI must verify database constraints and consumer logic, not only unit tests.

12. Version and Ordering Requirements

MES must not allow an older result to overwrite newer state.

At minimum define:

receivedResultVersion
currentRequirementVersion
currentWmsResultVersion

Required behavior:

Condition

Action

Exact duplicate

Ignore as successful no-op

New expected version

Apply

Older version

Ignore stale and record metric

Future version gap

Park and request reconciliation

Result before requirement exists

Park or DLQ according to contract

Shortage after confirmed Staged

Reject stale/conflicting transition

Staged after cancelled Work Order

Reject and reconcile

Do not silently overwrite state.

13. MES Outbox Requirements

When the real MES stage-materials flow is invoked:

business state and outbox record must commit atomically;

outbox publication must be retryable;

event key must be stable;

correlation and causation IDs must be preserved;

duplicate command must not create duplicate logical requests;

publication failure must not erase the request state;

outbox backlog must be observable.

The report must include:

outbox row before publish;

outbox row after publish;

retry count;

last error;

Kafka topic;

event ID;

aggregate ID;

correlation ID.

14. MES Result Consumer Requirements

The MES result consumer must provide:

schema validation;

event-type validation;

inbox or equivalent idempotency;

transaction-safe state update;

payload conflict detection;

unknown aggregate handling;

stale-result protection;

version-gap handling;

DLQ or parked-event handling;

offset commit only after durable processing;

restart recovery;

lag metrics;

traceable logs.

A zero-lag consumer is not sufficient evidence unless the MES requirement row is also updated correctly.

15. Schema Registry Requirements

The following WMS result subjects are runtime-registered:

WMS.Outbound.MaterialStaged.v1-value
WMS.Outbound.MaterialShortageDeclared.v1-value

MES and platform owners must define:

subject owner;

compatibility mode;

allowed additive changes;

required and optional fields;

enum evolution;

deprecation policy;

producer/consumer deployment order;

contract-test ownership;

invalid-schema handling.

Recommended default:

Backward-compatible additive evolution

Do not change an existing event's semantics incompatibly under the same event version.

16. Redis Decision

Redis is not required for the current MES/WMS material-staging path.

Current known Redis instances are separately owned:

Print Station Redis;

legacy MES Redis.

The AI must not:

connect WMS to Print Station Redis;

use legacy mes-redis as an undocumented shared dependency;

add Redis merely to satisfy a generic recovery checklist.

If MES itself uses Redis for a local cache in the affected read path, test that local cache behavior separately. Redis failure must not be used as a blocker for Kafka material staging unless the actual code path depends on it.

A future shared Redis platform requires a separate approved architecture decision covering:

owner;

network;

credentials;

namespaces;

TTL;

persistence;

HA;

outage behavior;

data sensitivity.

17. Required Runtime Scenarios

Scenario 1 — Shortage full flow

MES released Work Order
-> released material requirement
-> MES stage-materials API
-> MES outbox publish
-> WMS request PROCESSED
-> WMS shortage result
-> MES result PROCESSED
-> MES requirement status updated to shortage state

Verify:

one request;

one WMS result;

one MES business update;

zero unexplained lag;

no duplicate row;

correct quantities;

correct correlation.

Scenario 2 — Staged full flow

Seed sufficient WMS stock.

MES released Work Order
-> material requirement
-> MES stage-materials API
-> WMS FEFO transfer
-> Work Center staging balance updated
-> WMS staged result
-> MES requirement updated to staged state

Verify:

WMS source balance decreases correctly;

staging balance increases correctly;

movement ledger exists;

MES row changes correctly;

result is idempotent.

Scenario 3 — Duplicate MES request

Invoke the same logical stage-materials request twice.

Verify:

no duplicate WMS transfer;

existing material-request result is reused;

MES state remains correct.

Scenario 4 — Duplicate WMS result

Replay the same result.

Verify:

no duplicate MES update;

duplicate counted as no-op;

lag returns to zero.

Scenario 5 — Kafka outage and recovery

Disconnect the MES producer or result consumer from Kafka.

Verify:

MES outbox retains unpublished request;

request publishes after recovery;

result consumer catches up;

business state converges.

Scenario 6 — Consumer restart

Stop MES result consumer, publish result, restart consumer.

Verify:

lag rises then returns to zero;

requirement updates exactly once.

Scenario 7 — Unknown requirement

Publish a valid result for an unknown requirement ID.

Verify:

no fabricated requirement;

durable reconciliation or DLQ evidence;

no cross-database lookup.

Scenario 8 — Stale/conflicting result

Deliver an older or logically conflicting result.

Verify:

newer MES state is not overwritten;

conflict evidence is retained.

18. Migration Requirements

If MES schema changes are needed for:

WMS transaction ID;

result event ID;

source version;

correlation ID;

shortage quantity;

staged quantity;

result status;

reconciliation metadata;

then use additive safe migration.

Required sequence:

add nullable columns
-> deploy backward-compatible code
-> backfill where possible
-> verify old rows
-> run full affected flow
-> enforce constraints later

Required migration rehearsal:

previous MES schema
-> legacy Work Order and requirement seed
-> apply migration
-> verify row/reference integrity
-> start updated MES
-> invoke stage-materials
-> consume WMS result
-> verify migrated row update

A migration is not complete because SQL succeeded.

19. Evidence Artifacts

MES must create machine-readable evidence under:

.artifacts/recovery/<scope>/mes-wms/

Required artifacts:

fixture.json
work-order-before.json
material-requirement-before.json
stage-materials-request.json
mes-outbox-before.json
mes-outbox-after.json
wms-material-request.json
wms-result-event.json
mes-inbox-result.json
material-requirement-after.json
kafka-lag-before.json
kafka-lag-after.json
database-verification.json
reconciliation.json
summary.json

The summary must classify every scenario:

PASS_RUNTIME_VERIFIED
FAIL
BLOCKED_BY_FIXTURE
BLOCKED_EXTERNAL
NOT_APPLICABLE

20. Required MES APIs or Commands

The AI must identify and use existing MES-owned interfaces for:

create Work Order;

release Work Order;

create material requirement;

release or activate material requirement;

stage materials;

read Work Order;

read material requirement;

read stage-materials command/result status;

run reconciliation where available.

If an interface is missing, implement the smallest MES-owned recovery seed or test command required. Do not bypass domain rules with undocumented production SQL.

21. Observability Requirements

Required logs and traces:

MES Work Order ID;

material requirement ID;

WMS material request ID;

event ID;

event type;

event version;

topic;

partition;

offset;

correlation ID;

causation ID;

trace ID;

safe error code.

Required metrics:

MES staging requests total;

MES staging request failures;

MES outbox backlog;

oldest MES outbox age;

WMS result consumer lag;

WMS result processing failures;

duplicate WMS results;

stale WMS results;

unknown requirement results;

MES/WMS reconciliation mismatches.

Do not log tokens, secrets, or sensitive operator data.

22. Required Tests

Unit

result mapping;

status transition;

duplicate handling;

stale result;

version gap;

quantity mapping;

error classification.

Contract

staging-request schema;

staged-result schema;

shortage-result schema;

required fields;

event keys;

correlation IDs;

compatibility.

Database integration

Work Order fixture;

material requirement fixture;

outbox atomicity;

result update;

duplicate no-op;

migration rehearsal.

Kafka integration

publish request;

consume result;

restart;

outage/recovery;

duplicate;

stale/conflict;

zero-lag recovery.

Full business flow

shortage;

staged;

duplicate request;

duplicate result;

unknown requirement;

migrated legacy requirement.

23. Acceptance Criteria

MES work is complete only when all of the following pass:

a disposable released Work Order is created through a MES-owned flow;

disposable material requirements are created;

MES stage-materials API/use case is executed;

MES outbox publishes the staging request;

WMS Outbound processes the request;

both Shortage and Staged scenarios are demonstrated;

MES result consumer updates the matching MES requirement;

duplicate request does not create duplicate staging;

duplicate result does not update MES twice;

stale result does not regress state;

unknown requirement creates durable evidence;

Kafka outage/recovery converges;

consumer restart converges;

required schemas are governed and contract-tested;

any MES migration is rehearsed against legacy data;

evidence artifacts are generated;

no Redis or cross-database dependency is introduced.

24. Required Output Report

After implementation, create:

docs/integration/MES_WMS_MATERIAL_STAGING_RUNTIME_VERIFICATION_REPORT.md

The report must contain:

files changed;

APIs and use cases used;

fixture IDs;

Work Order and requirement states;

Kafka topics and event IDs;

Schema Registry subjects;

database before/after evidence;

outbox/inbox evidence;

lag evidence;

shortage result;

staged result;

duplicate and stale behavior;

migration evidence;

failure/recovery evidence;

unresolved blockers;

final readiness classification.

25. Final Instruction to the MES AI

Proceed inside the MES repository.

First inspect the existing MES Work Order, material-requirement, stage-materials, outbox, result-consumer, migration, seed, and test implementations.

Do not begin by changing Kafka transport that is already runtime-verified.

Begin by creating or identifying a deterministic MES-owned fixture flow.

Then execute the actual MES stage-materials business path and prove that WMS results update MES-owned material requirements correctly.

Do not use WMS database writes, undocumented shared Redis, or manual production-data insertion.

Do not claim full MES/WMS completion until both the Shortage and Staged business scenarios update real MES requirement rows and all required evidence is captured.