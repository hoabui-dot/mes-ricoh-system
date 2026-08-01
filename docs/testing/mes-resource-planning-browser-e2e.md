# MES Resource Planning Browser E2E

The browser test uses the real MES Console at the Playwright `baseURL` and Keycloak login. It creates a disposable Work Order through the UI, runs Compute & Check, opens each operation's Resource Planning card, confirms a Ready candidate, commits it, refreshes the detail page, and verifies every operation remains Committed through the API and rendered UI.

## Requirements

- MES Console reachable at `http://100.68.50.41:13052`.
- Gateway/execution API reachable at `http://100.68.50.41:18000`.
- Released Production Version and active shift from the deterministic seed.
- `MES_E2E_USERNAME`, `MES_E2E_PASSWORD`, `ALLOW_E2E_MUTATION=true`.
- Local execution database URL for exact cleanup.

## Run

```bash
MES_E2E_USERNAME=plant.manager \
MES_E2E_PASSWORD='Manager@123!' \
ALLOW_E2E_MUTATION=true \
MES_MASTER_DATA_DATABASE_URL=postgres://mes_master_data_user:mes_master_data_pass@127.0.0.1:15434/mes_master_data_db \
MES_EXECUTION_DATABASE_URL=postgres://mes_execution_user:mes_execution_pass@127.0.0.1:15435/mes_execution_db \
npm run test:e2e:resource-planning
```

The test has stable selectors for the creation form, operation list, candidate list/status, machine requirement, select-and-commit action, and persisted allocation status. It does not call a browser alert or bypass the backend allocation gate.
