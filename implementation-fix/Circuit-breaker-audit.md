TASK: Circuit breaker audit and hardening across all synchronous 
inter-service calls in the MES/WMS platform.

CONTEXT: Read AI_CONTEXT.md sections 0, 6 (Cross-service rules), 
11 (Services and Ownership), 18 (Working Rules) before starting. 
This is a process-fix task -> write/update implementation-fix/, 
not implementation/. Do not renumber PROJECT_WORKLOAD_PROGRESS.md 
for this task since it is a hardening fix, not a roadmap milestone.

GOAL: The architecture rule "Use circuit breakers for synchronous 
service dependencies" must hold for every cross-service synchronous 
HTTP call in the system, not just mes-execution-service -> 
mes-master-data-service.

STEP 1 - AUDIT (do this first, report before changing code):
Inspect source code (not just docs) for every outbound synchronous 
HTTP call between services. Specifically verify:
1. mes-execution-service -> mes-master-data-service (approve WO 
   freshness/permission check) - confirm gobreaker is actually wired 
   here with sane thresholds (failure ratio, timeout, half-open 
   retry interval).
2. mes-execution-service -> mes-traceability-service (OP-MIX, 
   OP-CUT, OP-MOLD, OP-QC calls) - confirm whether a circuit breaker 
   actually exists in code, since implementation records mention 
   "traceability client with circuit breaker" but this is not 
   confirmed in the service manifest.
3. mes-execution-service -> wms-outbound-service (POST 
   /stage-materials call after WO release) - check if this retryable 
   action has any breaker/backoff, or just plain HTTP client with 
   no failure isolation.
4. wms-inbound-service -> wms-inventory-service (confirmed receipt 
   posting to inventory receipt API) - check for breaker.
5. Any other synchronous cross-service HTTP call found in code that 
   is not listed above.

For each of the 5 items, report: exists / missing / partially 
implemented, plus current threshold config if it exists.

STEP 2 - FIX:
For every call found missing or partially implemented a circuit 
breaker:
- Go services: use gobreaker (already a dependency, keep consistent 
  library choice across Go services per Tech Stack Decision doc).
- Node.js services (wms-inbound-service, mes-master-data-service if 
  it ever calls out): use an equivalent breaker library (e.g. 
  opossum) - do not implement a custom breaker from scratch.
- Standard config baseline unless a service has a documented reason 
  to differ: failure ratio threshold ~50%, minimum request volume 
  before tripping, open-state timeout ~30s, half-open trial requests 
  1-3.
- On open circuit, the caller must fail gracefully with an explicit 
  retryable error state, not swallow the failure silently. For 
  mes-execution-service in particular, this must surface as the 
  existing "503 circuit breaker retry UI" pattern already used in 
  mes-console, not a new UX pattern.
- For /stage-materials specifically: this endpoint is documented as 
  "retryable" - confirm the retry-on-open-circuit behavior is 
  idempotent (safe to call multiple times without double-staging 
  material), since staging-first allocation logic in 
  wms-outbound-service must not double-transfer stock if called twice.

STEP 3 - OBSERVABILITY:
Ensure circuit breaker state transitions (closed -> open -> 
half-open -> closed) emit OTel spans/metrics to the existing 
Tempo/Prometheus stack, consistent with the platform's existing 
OTel Collector wiring. Do not build a separate monitoring path.

STEP 4 - TESTS:
Add unit/integration tests per affected service simulating 
downstream failure (timeout, 5xx, connection refused) to confirm 
the breaker trips, and confirm behavior on trip: no unbounded retry 
storms, no data corruption on partial failure (especially 
stage-materials idempotency).

STEP 5 - DOCUMENTATION:
- Update service.manifest.yaml for each affected service to document 
  its synchronous dependencies and breaker config.
- Write implementation-fix/circuit-breaker-hardening.md documenting: 
  audit findings, what was fixed, test evidence, and any call sites 
  intentionally left without a breaker (with justification).
- Do NOT touch process/PROJECT_WORKLOAD_PROGRESS.md milestone table 
  since this is a hotfix, not a phase completion.

CONSTRAINTS:
- No cross-service DB reads introduced as a workaround.
- Do not change WMS two-echelon staging business logic - only add 
  failure isolation around it.
- Do not modify Kong routes/plugins as part of this task.
- Run `git status --short` first; do not revert unrelated changes.
- Verify with: go test ./... for Go services, and 
  npm run test --workspace=<service> for Node services touched.