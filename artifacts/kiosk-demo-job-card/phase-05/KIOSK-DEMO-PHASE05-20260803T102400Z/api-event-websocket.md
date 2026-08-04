# API, Event, And WebSocket Evidence

- Real command flow persisted Start, two Complete operations, Fail, Retry, a second Start, and Abort.
- The successful browser run required at least 9 matching transactional outbox events across Started, Finished, Failed, RetryRequested, and Aborted.
- Gateway consumed and delivered the matching events; Kiosk invalidated and refetched authoritative detail.
- MES Console independently refetched the same authoritative Work Order and matched Ready, InProgress, Finished, ExecutionError, retry Ready, and abort Ready states.
- Backend tagged integration covered rejected Start, invalid quantity, missing failure reason, invalid failure state, retry denial, successor blocking, idempotent transitions, history preservation, and Print Station command rejection.
- Browser never published Kafka and Print Station remained read-only.
