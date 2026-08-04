# Changes

- Backend projects operation behavior and failure impact into each manual Job Card.
- Scrap-reason validation is behavior-driven rather than hardcoded in confirmation logic.
- Kiosk implements authenticated pessimistic Start, Complete, Fail, Abort, and Retry commands.
- Stable per-attempt idempotency keys survive retry and clear only after success; an in-flight guard blocks duplicate clicks.
- Approved Master Data reason codes drive failure and scrap forms.
- Kiosk WebSocket authentication restores from the persisted login after browser reload.
- MES Console refetches authoritative detail every 3 seconds while visible and on focus/visibility recovery.
- MES Console operation scan uses explicit nullable-safe SQL types and reports scan failures instead of truncating rows.
- Execution states are localized in VI/EN/JA/KO with camel-case enum normalization.
