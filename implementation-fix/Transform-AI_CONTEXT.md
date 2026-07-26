# Mission: Transform AI_CONTEXT.md into the Exhaustive Operational and Business Knowledge Base of the Entire MOM Platform

Act as all of the following at the same time:

- a principal manufacturing domain architect
- a senior MES/WMS/QMS business analyst
- a principal backend engineer
- a principal frontend engineer
- a distributed-systems architect
- a database and event-contract specialist
- a QA and validation specialist
- a technical writer for AI agents
- an extremely careful repository investigator

Your task is to inspect the entire repository and update the existing `AI_CONTEXT.md` into the canonical, exhaustive, implementation-grounded knowledge base for the Won Seal Tech MOM Platform.

The final document must allow a new AI agent, even one with weak reasoning ability and no prior knowledge of manufacturing systems, to understand the complete system without rediscovering the repository.

There is no practical length limit.

Do not optimize for brevity.

Do not remove necessary detail because the file becomes large.

A document of tens of thousands or even hundreds of thousands of lines is acceptable when the information is real, useful, non-duplicative, and traceable to the repository.

The objective is completeness, correctness, traceability, and explicitness—not elegance through compression.

---

# 1. Non-negotiable source-of-truth policy

Preserve and strictly enforce the existing source precedence in `AI_CONTEXT.md`.

Use the following precedence:

1. Running source code
2. Service manifests
3. Docker Compose and infrastructure configuration
4. Database migrations and schemas
5. Automated tests
6. API handlers, domain logic, repositories, consumers, producers, and frontend behavior
7. Implementation records under `implementation/` and `implementation-fix/`
8. The current progress tracker
9. Existing `AI_CONTEXT.md`
10. Product catalogs and design documents
11. Historical prompts and planning documents

Never convert an intended rule into an implemented fact.

For every business behavior, classify it explicitly as one of:

- `IMPLEMENTED_AND_VERIFIED`
- `IMPLEMENTED_BUT_NOT_TESTED`
- `PARTIALLY_IMPLEMENTED`
- `DOCUMENTED_INTENT_ONLY`
- `PLANNED`
- `MISSING`
- `AMBIGUOUS`
- `CONFLICTING_SOURCES`
- `DEPRECATED`
- `DEMO_ONLY`

Where relevant, state:

- evidence file paths
- function, component, handler, schema, migration, or test names
- owning service
- confidence level
- discrepancies between code and documentation

Do not invent missing rules.

When a rule cannot be proven from the repository, write:

```text
Status: MISSING_OR_UNVERIFIED
Expected behavior: ...
Evidence searched: ...
Gap: ...
Recommended clarification: ...

Never silently fill a gap with generic MES knowledge.

You may describe industry-standard recommendations, but they must be clearly separated under:

Recommended future behavior — not currently implemented
2. Primary outcome

Expand AI_CONTEXT.md from a high-level context document into a complete operational specification containing:

System purpose and business context
Full feature catalog
Full page and screen catalog
Full API catalog
Full database entity catalog
Full validation-rule catalog
Full workflow and state-machine catalog
Full event and integration catalog
Full role and permission catalog
Full error and failure-behavior catalog
Full cross-cluster relationship catalog
Full implementation status and known-gap catalog
Full diagrams for architecture, entities, workflows, states, and events
Full traceability from UI action to backend behavior and resulting side effects
Full examples using the seeded demo data where available

The completed file must answer not only “what exists?” but also:

Why does it exist?
Who uses it?
When is it used?
What information must the user provide?
Where do selectable values come from?
What rules apply?
What other records must exist first?
What happens after submission?
What can block the action?
What error is returned?
What state changes?
What records are created?
Which service owns the transaction?
Which events are emitted?
Which consumers react?
What is synchronous?
What is asynchronous?
What is eventually consistent?
What happens on partial failure?
Can the operation be retried safely?
Is the operation idempotent?
What permissions are required?
What audit data is recorded?
What remains unimplemented?
3. Repository investigation requirements

Before editing the document, inspect the complete repository.

Do not rely only on the current AI_CONTEXT.md.

At minimum, inspect:

services/
apps/
libs/
infra/
docs/
product-doc/
process/
process-fix/
implementation/
implementation-fix/
tests/
scripts/
migrations/
Dockerfiles
docker-compose files
Kong configuration
Keycloak realm exports
environment examples
package manifests
Go modules
TypeScript configuration
frontend routes
frontend page components
frontend forms
frontend schemas
API clients
query hooks
backend routers
handlers
controllers
domain services
repositories
SQL queries
database migrations
event producers
event consumers
outbox implementations
circuit breakers
retry logic
idempotency logic
error mappers
i18n resources
seed data

Search for every active route, page, endpoint, entity, command, event, and state.

Do not assume a folder name represents implemented behavior. Open and inspect the code.

Do not stop after inspecting happy paths.

Search for:

validation failures
rejected states
error constants
HTTP status codes
unique constraints
foreign keys
check constraints
database transactions
rollback paths
retry behavior
timeouts
circuit breakers
fallback behavior
duplicate handling
idempotency keys
event deduplication
stale data handling
concurrency guards
optimistic or pessimistic locking
disabled UI actions
confirmation dialogs
loading states
empty states
permissions
role checks
client-token checks
service-token checks
4. Required investigation report before modification

Before changing AI_CONTEXT.md, produce a temporary internal audit report containing:

Repository areas inspected
Active applications and services found
Active frontend routes found
Active API endpoints found
Database schemas and migrations found
Event producers and consumers found
Business state enums found
Validation layers found
Existing tests found
Existing implementation documents found
Conflicts between documentation and code
Major information gaps
Dead, deprecated, or historical modules
Demo-only behavior
Security gaps
Cross-service dependencies
Features whose implementation cannot be proven

Do not begin rewriting the canonical file until this audit is complete.

The audit report may be temporary, but its findings must be reflected in the final document.

5. Required documentation model for every feature

Create a comprehensive section for every feature.

Use the following structure consistently.

Feature: <Feature Name>
1. Business purpose

Explain:

why the feature exists
which manufacturing problem it solves
where it belongs in MES, WMS, QMS, Portal, or Platform
what upstream and downstream processes depend on it
2. Primary users and permissions

Document:

allowed roles
denied roles
site/area/work-center scope
ownership restrictions
approval separation
UI visibility rules
backend enforcement
whether UI and backend enforcement differ
exact Keycloak roles or internal permissions
3. Entry points

Document:

frontend application
route
menu location
deep link
API route
owning service
related background consumer or scheduled job
4. Preconditions

List every required precondition.

Examples:

master data must exist
revision must be released
production version must be effective
site must be active
role must be allowed
token client must be correct
work center must be active
warehouse staging location must exist
resource calendar must cover the requested period
traceability policy must exist
required label template must be released

For each precondition, specify:

where it is checked
whether the frontend pre-checks it
whether the backend enforces it
whether the database enforces it
failure status/code/message
whether the action is recoverable
5. UI form specification

For every form, document every field in a table:

Field	UI label	Data type	Required	Editable when	Default	Source	Validation	Dependency	Stored as	Notes

For selectable fields, document:

endpoint/query used to load options
filtering conditions
ordering
pagination
disabled options
effective-date filtering
site filtering
role filtering
dependencies on prior field selections
empty-option behavior
loading behavior
failure behavior

For numeric fields, document:

minimum
maximum
decimal precision
UOM
rounding
tolerance
whether zero is allowed
whether negatives are allowed

For date fields, document:

timezone
inclusive/exclusive semantics
past-date rules
future-date rules
effective-period checks

For text fields, document:

maximum length
trimming
normalization
uniqueness
supported character rules
localization behavior
6. User actions

Document every action:

create
save draft
edit
release
approve
reject
cancel
delete
archive
calculate
validate
allocate
confirm
start
pause
resume
finish
pass
fail
rework
scrap
print
reprint
retry
refresh

For every button or action, explain:

when it is visible
when it is enabled
required confirmation
API invoked
request payload
backend command
validation sequence
transactional changes
side effects
event publication
frontend success behavior
frontend failure behavior
whether repeated invocation is safe
7. Validation layers

Separate validations into:

UI validation
API request validation
Domain/business validation
Cross-service validation
Database validation
Authorization validation
State-transition validation
Integration validation

For each validation, include:

rule identifier
condition
source of truth
implementation location
error code
HTTP status
user-facing message
localization key
remediation
implementation status
8. Happy path

Write a numbered, exact sequence beginning with the user action and ending with all synchronous and asynchronous effects.

9. Alternative paths

Document all valid variants, such as:

alternate production version
substitute material
partial completion
partial receipt
split lot
rework routing
manual issue versus backflush
different work center
different equipment
pass versus fail
use-as-is versus scrap disposition
10. Failure paths

Document every observed or required failure scenario.

Use this structure:

Failure scenario:
Trigger:
Detected by:
Synchronous result:
HTTP status:
Error code:
User-facing message:
Database changes:
Events emitted:
Retry allowed:
Recovery procedure:
Current implementation status:
Evidence:
11. State machine

Document:

all states
allowed transitions
forbidden transitions
actor allowed to transition
guards
side effects
terminal states
reopen behavior
cancellation behavior

Add a Mermaid state diagram.

12. Database effects

List:

tables read
tables inserted
tables updated
tables logically deleted
transactional boundary
outbox writes
audit fields
immutable data
derived data
projections
unique constraints
concurrency controls
13. API and contract details

Document:

method
route
authentication
authorization
headers
path parameters
query parameters
request body
response body
errors
idempotency
timeout
retry policy
owning service
downstream dependencies
14. Events

Document:

event name
event version
producer
trigger
transactional outbox behavior
payload
consumers
idempotency strategy
ordering assumptions
retry behavior
dead-letter behavior
effects on local read models
compensation behavior
15. Cross-feature relationships

Explain:

what this feature requires
what requires this feature
direct synchronous dependencies
asynchronous dependencies
shared identifiers
consistency model
business consequences when downstream systems are unavailable
16. Security and audit

Document:

authentication flow
role checks
resource scope checks
sensitive fields
audit metadata
actor identity
correlation ID
trace ID
approval separation
known security gaps
17. Tests

List:

unit tests
integration tests
contract tests
end-to-end tests
missing test cases
important boundary cases
18. Implementation status and gaps

Finish every feature with:

current implementation status
verified behavior
unverified behavior
documented-only behavior
missing behavior
technical debt
security gaps
recommended next actions
6. Mandatory Work Order documentation

The Work Order feature must be documented at exceptional depth.

Do not produce only a summary.

Document the complete lifecycle from planning through execution and completion.

At minimum, answer every question below from repository evidence.

6.1 Work Order creation form

Document every input field actually present in the MES Console and API.

Investigate fields such as, but not limited to:

work order number
site
product/item
item revision
production version
MBOM
routing
order quantity
UOM
planned start
planned finish
priority
order type
lot/batch information
assigned work center
planner
notes
customer/order reference
status

Do not include a field as implemented unless it exists in code, schema, migration, or active contract.

For every field, explain:

whether the user enters it manually
whether it is generated
whether it is inferred
whether it becomes locked after creation
source of dropdown values
cross-field rules
validation message
persistence location
6.2 Work Order creation sequence

Document the exact execution sequence.

Investigate whether creation performs any of the following:

Authenticates the caller
Authorizes WO creation
Validates site and user scope
Validates product revision
Resolves the production version
Validates the MBOM
Validates the routing
Validates effective dates
Validates lot-size range
Creates a draft WO header
Copies or references production configuration
Explodes routing operations
Calculates material demand
Resolves issue operations
Applies scrap factors
Resolves phantom components
Calculates durations
Resolves standards
Resolves work centers
Checks capabilities
Checks resource calendars
Checks equipment availability
Checks labor and skill requirements
Checks warehouse stock
Requests WMS allocation
Detects shortage
Creates reservations
Creates staging requests
Creates traceability lot/labels
Writes an outbox event
Returns a response

For each step, state exactly:

implemented
partially implemented
planned
missing
not applicable
located in another action such as Determine Demand or Compute and Check

Do not merge separate commands into “Create Work Order” when the code implements them as distinct user actions.

6.3 Separate commands

Inspect and document separately:

Create Work Order
Determine Demand
Compute and Check
Approve
Reject
Release, if present
Cancel
Start execution
Complete operation
Complete Work Order

For each command, include its own:

preconditions
request
validation chain
data changes
side effects
errors
resulting state
events
6.4 Inventory availability

Determine from code whether WO creation, demand determination, compute/check, approval, release, or execution checks inventory.

Answer explicitly:

Is inventory checked synchronously?
Which WMS service is called?
Is inventory checked by total stock, available stock, lot, expiry, location, or staging location?
Is FEFO used?
Is stock reserved?
Is stock allocated?
Is stock physically moved?
Is a material request created?
Are shortages represented as errors, warnings, or business records?
Can the WO still be saved as Draft during shortage?
Can it be approved during shortage?
Can execution start during shortage?
Can substitute materials be used?
Is partial availability allowed?
What happens when WMS is unavailable?
What circuit breaker behavior exists?
What is retried?
What is the user-facing message?
Is the operation idempotent?
Which service owns the final stock decision?

If the behavior is not implemented, explicitly mark the gap.

Do not write generic behavior such as “the system checks stock” unless code proves it.

6.5 Work-center and equipment readiness

Investigate whether the system validates:

Work Center active status
correct site
routing assignment
capability eligibility
equipment assignment
equipment execution status
resource calendar
planned downtime
holiday
shift availability
max concurrent jobs
capacity model
finite capacity
setup family
production standard
existing load
overlapping jobs

Separate:

master-data readiness
scheduling readiness
real-time shop-floor readiness

Explain which validations are implemented and which are not.

6.6 Labor and skills

Investigate whether the system validates:

required headcount
required skill
minimum skill level
certification
employee active status
employee assignment
shift assignment
current availability
double booking
attendance
Work Center scope

State precisely whether labor data is currently informational, validated during Compute and Check, or enforced during execution.

Do not assume a workforce planning engine exists.

6.7 Error catalog for Work Orders

Create a complete error matrix.

Include at least every observed error related to:

invalid product revision
unreleased revision
missing production version
invalid production version
lot size outside range
missing MBOM
unreleased MBOM
empty MBOM
invalid MBOM line
circular BOM
missing routing
unreleased routing
empty routing
routing cycle
missing Work Center
inactive Work Center
wrong site
missing capability
missing production standard
invalid cycle time
missing calendar
unavailable resource
missing skill
insufficient labor
insufficient material
WMS unavailable
QMS dependency unavailable
traceability configuration missing
numbering rule missing
label template missing
invalid state transition
duplicate request
authorization failure
wrong client token
stale version/concurrent update

Only mark an error as implemented when found in the repository.

For missing errors, document them as gaps.

7. Mandatory MES feature coverage

Document every active MES feature and page, including at minimum:

Items
Item Revisions
MBOM Header
MBOM Lines
Component Substitutes, if implemented
Routing Header
Routing Operations
Operations
Production Versions
Work Centers
Workstations
Equipment
Resource Assignments
Resource Capabilities
Resource Calendars
Production Standards
Employees
Shifts
Work Calendars
Skills
Operation Skill Requirements
Reason Codes
Traceability Policies
Numbering Rules
Split Rules
Label Templates
Work Orders
Demand determination
Compute and Check
Approval and rejection
Operation execution
Material scan
Backflush
Good quantity
Scrap quantity
Downtime, if implemented
Parent/child labels
Split
Consume
Label issue
Label print
Kiosk login
Terminal/workstation resolution
Operator execution flow
Offline queue, if implemented
WebSocket flow
MES Console page-detail modals
Authentication and role behavior

For each feature, include full CRUD and lifecycle behavior rather than only the entity definition.

8. Mandatory WMS feature coverage

Document every active WMS feature and page, including:

Warehouses
Zones
Locations
Bins, if present
Warehouse map
Inventory ledger
Balance projection
Stock movement history
Inbound request
Receipt
Lot and expiry capture
Putaway
Outbound request
Allocation
FEFO
Picking
Staging
Dispatch
Work-center staging location
Material shortage
MES material request integration
Inventory adjustment, if present
UOM mapping
idempotency
circuit-breaker behavior
read-model behavior
WMS Console filters, pagination, dialogs, and error states

For all inventory actions, explain:

quantity invariants
balance ownership
ledger immutability
negative-stock rules
concurrency protection
duplicate movement protection
lot/expiry rules
source and destination constraints
staging semantics
transaction and outbox boundaries
9. Mandatory QMS feature coverage

Document every active QMS feature and page, including:

Inspection plans
Plan lifecycle
Characteristics
Attribute characteristics
Variable characteristics
Specification limits
Sampling rules
Defect codes
Inspection queue
Inspection draft creation
Result entry
Server-side evaluation
Pass behavior
Fail behavior
InspectionFailed event
NCR creation
NCR idempotency
NCR queue
severity
containment
disposition
use-as-is
rework
return
scrap
CAPA creation
CAPA ownership
due date
root cause
corrective action
CAPA lifecycle
MES/QMS relationship
WMS/QMS relationship
QMS Console confirmation dialogs
irreversible mutations
pagination
localization
role behavior

Explain all state transitions and the exact relationship between:

MES operation completion
-> inspection result
-> failed inspection
-> NCR
-> disposition
-> CAPA
-> future MES/WMS effects

Clearly distinguish currently implemented effects from future integration.

10. Frontend page specification

Create a page catalog for Portal, MES Console, WMS Console, QMS Console, and Kiosk UI.

For every route, document:

route path
page title
menu location
purpose
intended role
data queries
mutations
components
form fields
filters
table columns
sorting
pagination
URL-persisted state
loading state
empty state
error state
confirmation dialogs
disabled states
status badges
i18n keys
navigation behavior
theme behavior
API dependencies
known demo limitations

Create a route-to-feature-to-service matrix.

Example:

UI application	Route	Feature	Query endpoint	Mutation endpoint	Owning service	Roles

Do not document only what the page is intended to show. Inspect the actual page implementation.

11. API catalog

Build a complete active API catalog.

For each endpoint:

Method	Gateway path	Internal path	Service	Handler	Auth	Role	Request	Response	Errors	Events

Document:

Kong route
upstream service
authentication plugin
forwarded headers
user identity
client-token restrictions
role restrictions
body schema
query schema
validation
status codes
error shape
database transaction
downstream calls
circuit breaker
timeout
emitted events

Mark routes that are currently insecure, legacy, bypassed, deprecated, or not exposed through Kong.

12. Database and entity catalog

For every active table/entity, document:

bounded context
owning service
business meaning
columns
types
nullable fields
defaults
primary key
foreign keys
unique constraints
check constraints
indexes
lifecycle fields
audit fields
soft-delete behavior
effective dating
immutable fields
state enum
related events
related APIs
related pages

Create relationship diagrams using Mermaid ER diagrams.

Do not create one unreadable global ER diagram only.

Create:

MES master-data ERD
MES execution ERD
MES traceability ERD
WMS master-data ERD
WMS inventory/inbound/outbound ERD
QMS inspection ERD
QMS NCR/CAPA ERD
Cross-cluster logical identifier map
13. Business relationship maps

Create a dedicated section named:

Complete Business Relationship and Dependency Atlas

Include both tables and Mermaid diagrams.

At minimum, show relationships between:

Site
Area
Shift
Calendar
Item
Item Revision
MBOM
MBOM Line
Routing
Routing Operation
Production Version
Production Standard
Work Center
Workstation
Equipment
Resource Assignment
Resource Capability
Skill
Operation Skill Requirement
Employee
Work Order
Work Order Operation
Material Demand
WMS Inventory
Inbound
Outbound
Staging
Traceability Policy
Label
Genealogy
Inspection Plan
Inspection Result
NCR
Disposition
CAPA
User
Role
Resource Scope
Terminal

For every relationship, explain:

cardinality
ownership
effective-date rule
release-state rule
deletion rule
runtime dependency
validation dependency
whether the relationship is stored directly, resolved synchronously, or projected asynchronously

Create a relationship matrix:

Source concept	Target concept	Relationship	Owner	Validation time	Failure consequence
14. End-to-end business flows

Create detailed end-to-end flows for every major scenario.

At minimum:

Flow A: Configure a new finished product

From item creation through released production version.

Flow B: Create and validate a Work Order

From form entry through Determine Demand and Compute and Check.

Flow C: Material availability and staging

From MES demand through WMS allocation, shortage, picking, and work-center staging.

Flow D: Execute the complete production route

For the representative FG-WS-CM01-R1 route:

OP-MIX
-> OP-PREP
-> OP-CUT
-> OP-MOLD
-> OP-TRIM
-> OP-QC

For each operation, document:

required scans
required quantities
input labels
output labels
material consumption
genealogy
good quantity
scrap
completion rules
next-operation availability
Flow E: Parent-to-child split

Include quantity balance, tolerance, activation, remainder, and duplicate behavior.

Flow F: Finished label issue

Include numbering, template selection, persistence, print command, and retry.

Flow G: Quality PASS

Include MES and QMS consequences.

Flow H: Quality FAIL

Include reason requirement, no PASS label, event publication, inspection failure, NCR creation, disposition, and CAPA.

Flow I: WMS inbound

From request through receipt and putaway.

Flow J: WMS outbound

From request through allocation, FEFO, picking, staging, and dispatch.

Flow K: SSO and role-based application routing

Portal, Keycloak, per-client tokens, direct console access, logout, and wrong-client tokens.

Flow L: Service dependency failure

For every synchronous cross-service call:

downstream timeout
circuit breaker open
fallback
user-facing behavior
retry
data consistency
outbox/event effects

For each flow, provide:

Actors
Preconditions
Input
Step-by-step sequence
Service ownership per step
Database changes
Events
Failure branches
Recovery
Final state
Mermaid sequence diagram
Implementation-status annotation per step
15. State-machine atlas

Create state machines for every lifecycle-bearing entity found in the repository.

Examples may include:

Item
Item Revision
MBOM
Routing
Production Version
Work Order
Work Order Operation
Traceability Label
Inbound Request
Receipt
Putaway
Outbound Request
Allocation
Dispatch
Inspection Plan
Inspection Result
NCR
Disposition
CAPA

For every state machine, document:

Current state	Action	Actor	Guard	Next state	Side effects	Error when denied

Add Mermaid state diagrams.

Do not infer transitions from enum names alone. Find handlers and tests that prove transitions.

16. Event and integration atlas

Create one canonical event catalog.

For every event:

Event type	Version	Producer	Trigger	Payload	Consumers	Idempotency	Retry	Business effect

Document:

full event envelope
schema location
producer code
outbox write
publisher
topic
consumer group
consumer code
deduplication
retry
dead-letter handling
trace ID
correlation ID
ordering assumptions
compatibility risks

Create:

Cluster-level event map
Feature-level event maps
Sequence diagrams for important event chains
Missing or planned event links

Explicitly identify where integration is currently synchronous versus event-driven.

17. Error and recovery atlas

Create a central, exhaustive error catalog.

For every error:

Error code	Feature	Trigger	Layer	HTTP status	User message	Retryable	Recovery	Evidence

Cover:

validation errors
authorization errors
authentication errors
not found
conflicts
invalid transitions
duplicates
stale updates
database failures
downstream dependency failures
circuit breaker open
timeouts
Kafka failures
outbox failures
label-print failures
partial workflow failures
unavailable resources
shortages
quality failures
invalid scans
expired/consumed labels
wrong operation
quantity imbalance
localization fallback
frontend loading and mutation errors

If the frontend displays raw backend errors or generic messages, document that as a UX gap.

18. Role, permission, and scope atlas

Document:

Keycloak realm roles
Portal application visibility
per-console roles
backend role enforcement
client token/audience restrictions
domain permissions
resource scopes
site scope
area scope
work-center scope
workstation scope
own-assignment scope
approval segregation
demo users

Create a matrix:

Role	Application	Page	View	Create	Edit	Release	Approve	Execute	Scope

Where backend enforcement is missing or weaker than frontend visibility, explicitly mark the security gap.

19. Business-rule catalog

Create a centralized numbered catalog of business rules.

Use stable identifiers such as:

BR-MES-WO-001
BR-MES-MBOM-001
BR-MES-EXEC-001
BR-WMS-INV-001
BR-QMS-INSP-001
BR-SEC-SSO-001

Each rule must include:

Rule ID:
Name:
Business meaning:
Condition:
Expected behavior:
Owning bounded context:
Enforced by:
Frontend enforcement:
Backend enforcement:
Database enforcement:
Error:
Related entities:
Related APIs:
Related events:
Implementation status:
Evidence:
Tests:

Reference these rule IDs from feature sections, flows, errors, and state transitions.

Do not duplicate the full rule text everywhere. Use the canonical rule ID for cross-reference.

20. Implemented behavior versus desired behavior

For every important feature, include a comparison table:

Concern	Current implementation	Product intent	Gap	Risk	Recommended next step

This is especially important for:

Work Order stock availability
finite-capacity scheduling
labor validation
skills and certification
equipment real-time availability
MES API authentication
cross-cluster QMS integration
substitution approval
WMS reservation
compensation across services
print failure recovery
offline kiosk behavior

Do not disguise a roadmap item as current behavior.

21. Diagrams

Use Mermaid diagrams extensively.

Create separate, readable diagrams instead of one enormous diagram.

Required diagram types:

C4-style system context
cluster/service architecture
container topology
API gateway routing
SSO sequence
bounded-context map
entity relationship diagrams
Work Order creation sequence
Compute and Check sequence
inventory staging sequence
full production route
traceability split
label issue
quality failure to NCR/CAPA
inbound flow
outbound flow
event topology
state machines
role/application relationship
dependency failure and recovery

Every diagram must be followed by a prose explanation.

Every diagram must reflect actual behavior and annotate planned or missing branches.

Use labels such as:

[IMPLEMENTED]
[PARTIAL]
[PLANNED]
[MISSING]
[SYNC]
[ASYNC]