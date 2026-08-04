# Baseline

- Entry gate: `KIOSK_DEMO_PHASE_04_PASSED_READY_FOR_PHASE_05`.
- Canonical runtime before fixture: 2 Work Orders, 8 operations, 0 Phase 05 Work Orders.
- Existing backend state machine already owned Fail, Retry, Abort, history, outbox, and predecessor policy.
- Kiosk lacked Fail/Retry, approved reason loading, stable retry idempotency, authenticated command headers, and socket recovery after reload.
- MES Console detail refreshed only on mount/local actions and silently truncated operation rows after a nullable scan error.
