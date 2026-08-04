# GLOBAL RULE

Read before every phase.

Mandatory:
- Preserve existing MES architecture.
- Preserve Kafka transport.
- Preserve domain ownership.
- Use MES APIs/domain services for fixtures.
- Verify every affected business flow.
- Produce runtime evidence.

Forbidden:
- Direct SQL to bypass domain.
- Reading WMS database.
- Changing WMS contracts unilaterally.
- Shared database.
- Shared Redis dependency.
- Breaking event compatibility.
- Fake runtime evidence.

Stop immediately if:
- Ownership changes are required.
- Event semantics must change.
- Mapping cannot be resolved.
- Runtime contradicts Integration Contract Pack.
