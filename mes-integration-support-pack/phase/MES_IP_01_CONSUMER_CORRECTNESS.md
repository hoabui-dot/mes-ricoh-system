# Consumer Correctness

## Purpose
Harden the WMS result consumer. Implement durable inbox, explicit offset commit, version safety, ordering, transition guard, duplicate handling, unknown aggregate handling and exactly-once business effect.

## Scope
- MES only
- Shared integration correctness
- No architecture redesign

## Inputs
- Integration Contract Pack
- Integration Validation Pack
- Existing MES architecture
- Existing runtime reports

## Deliverables
- Updated implementation
- Runtime evidence
- Phase report

## Verification
- Unit
- Integration
- Runtime
- Regression
- Business flow

## Acceptance
- Phase objectives completed
- No architecture violations
- Evidence attached

## Stop Conditions
- Architecture conflict
- Ownership conflict
- Event contract conflict
- Unresolved mapping
- Breaking compatibility
