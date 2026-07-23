# BUILD PROMPT — Phase 1, Step 5: `mes-kiosk-gateway-service` + Kiosk Operator UI

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Phase:** Phase 1, Step 5
**Status before this prompt:** Steps 0–4 completed and verified (Platform Foundation, `mes-master-data-service`, `mes-traceability-service`, `mes-execution-service` Stage A+B). `mes-execution-service` exposes `/work-orders/{id}/operations/{opId}/start|confirm|abort` under `/api/mes/execution/*`.

**IMPORTANT — read before coding:** Every technology choice in this prompt is final and non-negotiable. Do not substitute an alternative library, framework, or pattern "because it seemed better" — if a genuine blocker is found, stop and report it instead of silently swapping technology. This prompt intentionally narrows every decision to reduce ambiguity.

---

## 0. Scope correction: this step was under-specified in the roadmap tracker

The roadmap tracker lists Step 5 as backend-only (`mes-kiosk-gateway-service`). This is corrected here: **this step includes both the backend gateway service AND the first operator-facing frontend of the project (Kiosk Operator UI)**, because a WebSocket gateway with no client cannot be verified end-to-end. Treat this prompt as covering two deliverables that ship together:

- **Part A** — `mes-kiosk-gateway-service` (Go backend)
- **Part B** — Kiosk Operator UI (Remix frontend)

After completion, update `process/PROJECT_WORKLOAD_PROGRESS.md` to reflect that Step 5 included both, so future steps aren't confused about where the Kiosk UI was built.

---

## PART A — `mes-kiosk-gateway-service` (Backend)

### A.1 Fixed Technology Decisions

| Concern | Decision | Reasoning (do not revisit) |
|---|---|---|
| Language | Go 1.22 | Per `TECH-STACK-DECISION.md`, long-lived concurrent connections = Go's exact use case |
| HTTP router | `chi` | Consistent with `mes-execution-service` and `mes-traceability-service` |
| WebSocket library | `gorilla/websocket` | Widest ecosystem adoption, most reference material available, lowest implementation-risk choice for this step |
| Realtime protocol scope | **WebSocket only. Do NOT implement MQTT in this step.** | MQTT was listed as a future option in the original strategy doc for physical PLC/sensor integration, which is out of scope for this MVP (kiosks are browser-based tablets, not raw IoT devices). Implementing both now doubles risk for no MVP benefit. |
| DB | PostgreSQL, own database `mes_kiosk_gateway_db` | Database-per-service rule, unchanged |
| DB driver | `pgx/v5` | Consistent with other Go services |
| Auth for terminal/operator | Keycloak **Direct Access Grant** (Resource Owner Password Credentials flow) against the existing `mes-client` | Kiosks are trusted, network-restricted shop-floor devices — full redirect-based OIDC login is impractical on a shared tablet used by many operators per shift. Direct Grant with employee ID + PIN is the correct trade-off for this trust boundary. **Do not implement a new custom auth scheme.** This requires enabling "Direct Access Grants" on `mes-client` in the Keycloak realm config — do this as an infra change, not a workaround in application code. |
| Event consumption | `segmentio/kafka-go`, same as other Go services | Consistency |
| Outbox | Reuse `libs/shared-kernel-go` outbox pattern — **only if this service needs to publish events**. See §A.4 — in most cases this service is a consumer/relay, not a publisher of domain events. |

### A.2 Domain Scope

Owned tables in `mes_kiosk_gateway_db`:
- `terminal` — `terminal_id`, `terminal_code` (physical label, e.g. `KIOSK-MOLD-01`), `site_id`, `work_center_id` (reference only, no FK), `status` (`ONLINE` / `OFFLINE` / `DISABLED`), `last_seen_at`.
- `terminal_session` — `session_id`, `terminal_id`, `operator_user_id`, `logged_in_at`, `logged_out_at`, `status`.
- `outbound_message_queue` — messages waiting to be delivered to a terminal that is currently disconnected: `message_id`, `terminal_id`, `payload` (JSON), `event_type`, `created_at`, `delivered_at` (nullable), `status` (`PENDING` / `DELIVERED` / `EXPIRED`).

**Explicitly out of scope for `outbound_message_queue`:** this table is for server→terminal push messages only (e.g. "new WO assigned to your work center", "operation state changed by another terminal"). It is **not** for queuing operator actions taken while offline — that responsibility belongs to the browser client (see Part B §B.5). Do not build a client-action-replay system on the backend; this would duplicate the idempotency mechanism already proven in `mes-execution-service`.

### A.3 WebSocket Contract

- Endpoint: `wss://.../api/mes/kiosk-gateway/ws?terminal_id={id}` (behind Kong, which must be configured to proxy WebSocket upgrade — verify Kong plugin support before implementing; if Kong's declarative config cannot proxy WS cleanly, expose this port directly and document the exception, do not silently bypass Kong for all endpoints).
- On connect: client sends an initial auth frame `{ "type": "auth", "token": "<keycloak access token>" }`. Server validates token against Keycloak's JWKS endpoint (reuse whatever JWT validation approach Kong ends up using in Phase 1 security hardening — if that hasn't landed yet, validate directly in this service using `github.com/coreos/go-oidc` against the Keycloak realm).
- Server → client message types: `wo_assigned`, `operation_state_changed`, `terminal_disabled`.
- Client → server message types: `heartbeat` (every 30s; server marks terminal `OFFLINE` after 90s of no heartbeat).
- On reconnect: server drains any `PENDING` rows in `outbound_message_queue` for that `terminal_id`, sends them in order, marks `DELIVERED`.

### A.4 Kafka Consumption

Consume `MES.Execution.OperationStarted.v1`, `MES.Execution.OperationFinished.v1`, `MES.Execution.WOCompleted.v1`. For each event, resolve which terminal(s) are subscribed to the relevant `work_center_id` (from the `terminal` table) and either push immediately via WebSocket (if connected) or write to `outbound_message_queue` (if not). This service does not need an outbox/publish side for Phase 1 — it is purely a consumer-and-relay. Do not build outbox publishing unless a concrete downstream consumer is identified.

### A.5 API Surface (REST, for the Remix backend to call, not for direct browser use)

- `POST /terminals/{id}/login` — Direct Grant token exchange proxy (keeps Keycloak client secret off the browser). Body: `{ employee_id, pin }`. Returns access token + refresh token.
- `POST /terminals/{id}/logout`
- `GET /terminals/{id}/status`
- `GET /terminals` (admin/supervisor listing)

### A.6 Definition of Done — Part A

| # | Item | Verification |
|---|---|---|
| 1 | Terminal WebSocket connects, authenticates, heartbeats | Manual `wscat` test |
| 2 | Terminal marked `OFFLINE` after missed heartbeats | Kill connection, wait 90s, check DB |
| 3 | Message queued while offline, delivered on reconnect in order | Integration test |
| 4 | Kafka event correctly routed only to subscribed work-center terminals | Integration test with 2 terminals, 2 work centers |
| 5 | Direct Grant login works end-to-end through this service | `curl` test with real employee credentials in Keycloak |
| 6 | Kong WebSocket proxy confirmed working, or exception documented | Verified against real Kong config |

---

## PART B — Kiosk Operator UI (Frontend)

### B.1 Fixed Technology Decisions

| Concern | Decision | Reasoning (do not revisit) |
|---|---|---|
| Framework | **Remix** (already decided in `TECH-STACK-DECISION.md` for tablet kiosk shop-floor UI) | SSR + progressive enhancement — forms still submit under flaky shop-floor Wi-Fi even before JS finishes loading |
| UI component library | **shadcn/ui** | Explicit requirement from project owner |
| Styling | Tailwind CSS (shadcn's required dependency) | — |
| Server-state / mutations for confirmations | Remix `loader`/`action`, **not** a client-fetch library, for anything that writes data (Start/Confirm/Abort operation) | Keeps write operations resilient to JS not being loaded yet; matches the reasoning already established for this app |
| Client-state for realtime WebSocket push | A single React Context (`KioskSocketProvider`) wrapping the native browser `WebSocket` API — **do not add a third-party WS library**; this is a small, well-understood surface | Reduces dependency surface for a project with a weak coding AI |
| Form validation | `zod`, schema shared between the Remix `action` (server) and the form component (client) | Never trust client-only validation for actions with physical consequences (label print, material consumption) |
| Toast notifications | `sonner` (standard pairing with shadcn/ui) | — |
| Client-side offline action buffering | Browser `IndexedDB` via the `idb` npm package | Per Part A §A.2, offline operator actions are a client responsibility, not backend |

### B.2 Non-negotiable UX rule: Pessimistic confirmation only

This is the single most important rule in this prompt. **Every operator confirmation action (Start, Confirm/Finish, Abort) must show a loading state and wait for the server response before showing success.** Do not implement optimistic UI (i.e., do not update the screen to "Done" before the server responds) for any action that:
- Triggers label printing (`OP-MIX`, `OP-CUT`, `OP-MOLD`, `OP-QC` PASS)
- Triggers material consumption
- Triggers a QR split or consume call to `mes-traceability-service`

Reason: these actions have physical, real-world consequences (a printed label, consumed inventory). Showing success before the server confirms creates a mismatch between what the operator believes happened and what actually happened on the shop floor — this is a safety-relevant rule, not a style preference.

The only UI elements allowed to be optimistic are non-physical, purely informational ones (e.g. highlighting the next operation in a routing list based on local state before the server round-trip completes).

### B.3 CRUD Confirmation Flow — exact pattern to implement

For every write action (Start / Confirm / Abort an operation):

1. **Disable the trigger button immediately on click** (before the network call resolves) using Remix's `useNavigation()` state (`navigation.state !== "idle"`). This prevents double-submit, which is a real risk here (double-submit = double material consumption).
2. **Show a spinner inside the button**, not a full-page loading overlay — operators need to still see the screen context (which WO/operation they're on) while waiting.
3. **On success** (`action` returns `2xx`): show a `sonner` success toast with the concrete result (e.g. "Đã ghi nhận: 98 đạt, 2 phế phẩm — Tem đã in: FG-LOT-00231"), and navigate/redirect to the next operation in the routing sequence if the current one is now `Finished`.
4. **On expected failure** (`action` returns a typed error, e.g. validation failure, missing reason code, traceability service unreachable): render the error **inline in the form**, near the relevant field — not as a toast. Toasts are for confirmations of success or for background/system-level issues (e.g. WebSocket disconnected), not for form validation errors the operator needs to fix and retry with context still visible.
5. **On unexpected failure** (5xx, network error, unhandled exception): this is where Remix's `ErrorBoundary` takes over (see §B.4) — the action should still attempt to return a typed error response rather than throw, wherever the failure is anticipated (e.g. circuit breaker open on `mes-traceability-service` — this is anticipated and must be a typed error, not an unhandled exception).
6. **Idempotency**: every confirm action generates and sends an idempotency key (`crypto.randomUUID()`) once per attempt, stored in component state so a retry (user clicking again after a timeout) reuses the same key — matching the backend idempotency contract already built into `mes-execution-service` and `mes-traceability-service`.
7. **Irreversible/destructive actions** (Abort session, declare scrap quantity) require an explicit confirmation step using shadcn's `AlertDialog` before the action fires — never fire on a single tap for these.

### B.4 Error Handling & Error Boundary Strategy (senior-level, explicit)

Implement **three layers** of error handling, each with a distinct responsibility. Do not collapse them into one generic catch-all.

**Layer 1 — Field-level / form-level errors (expected, recoverable by the operator)**
- Source: `action` returns `{ error: { field?: string, message: string, code: string } }` with a `4xx` status.
- Handling: rendered inline by the form component itself using the data from `useActionData()`. Never bubbles to an ErrorBoundary.
- Example: "Vui lòng chọn mã nguyên nhân trước khi xác nhận NG" (reason code required on QC fail).

**Layer 2 — Route-level ErrorBoundary (unexpected but scoped to this screen)**
- Every route file (`app/routes/kiosk.$terminalId.wo.$woId.operations.$opId.tsx` etc.) exports its own `ErrorBoundary` using Remix v2's `useRouteError()` + `isRouteErrorResponse()`.
- Distinguish:
  - `isRouteErrorResponse(error) && error.status === 503` (traceability/execution service circuit breaker open) → show a specific "Hệ thống đang bận, vui lòng thử lại sau ít giây" card with a manual retry button. Do not auto-retry silently more than once — a shop-floor operator needs to know something is degraded, not have it silently masked.
  - `isRouteErrorResponse(error) && error.status === 401/403` → redirect to terminal login screen.
  - Anything else (unexpected exception, `error instanceof Error`) → generic "Đã có lỗi hệ thống, vui lòng gọi tổ trưởng" card. **Never render the raw error message or stack trace on a shop-floor screen** — log it (see §B.6) but show operators only the generic message and an incident reference code (`crypto.randomUUID()` generated client-side at the moment of error, included in both the UI and the log line, so a supervisor can correlate).
- This boundary must **not** cover WebSocket connection loss — that is Layer 3.

**Layer 3 — Root-level ErrorBoundary + connectivity state (last resort / cross-cutting)**
- `app/root.tsx` exports a top-level `ErrorBoundary` as the final fallback if a route-level boundary itself fails to render (defense in depth) — same generic "system error" treatment as Layer 2's default case.
- Separately (not an error boundary — this is connection state, not an error): the `KioskSocketProvider` context exposes a `connectionStatus: "connected" | "connecting" | "disconnected"`. Render a persistent, non-dismissible banner at the top of every kiosk screen when `disconnected`, distinct in color/style from any error toast, since this is an ambient state, not a one-off failure. Do not treat WebSocket disconnect as fatal — the operator should still be able to view cached screen state and even attempt actions (which will queue per §B.5), just with clear visual indication they're offline.

### B.5 Offline Behavior (client-side only, per Part A's scope boundary)

- Cache the current WO/operation view data in `IndexedDB` on every successful load, so the screen remains usable (read-only) when offline.
- Do **not** allow write actions (Start/Confirm/Abort) to be queued and silently replayed later for anything in the "pessimistic-only" list from §B.2 (label printing, material consumption, traceability calls) — these must be blocked with a clear "Không thể xác nhận khi mất kết nối" message while offline, because silently replaying a physical-consequence action minutes later without operator awareness is unsafe.
- Non-physical, read-only navigation and cached-data viewing may continue to work offline.

### B.6 Logging

- Client-side: on any Layer 2/3 error, `console.error` with the incident reference code, plus (if a logging endpoint exists or is added) POST a minimal error report `{ incident_id, route, message, timestamp }` to a lightweight logging endpoint on `mes-kiosk-gateway-service`. Do not send full stack traces from the browser in the request body if this is later exposed outside the trusted network — keep this endpoint internal-only.

### B.7 Screens to Implement (minimum for this step)

1. `/kiosk/:terminalId/login` — employee ID + PIN form (Direct Grant via Part A §A.5).
2. `/kiosk/:terminalId/wo-list` — WOs relevant to this terminal's work center, realtime-updated via WebSocket `wo_assigned` messages.
3. `/kiosk/:terminalId/wo/:woId/operations/:opId` — the core confirmation screen: shows operation details (from `mes-execution-service` read-model), the scan/quantity input fields driven by that operation's `ConfirmationMode`/`RequiresMaterialScan`/`RequiresOutputLabel` config, and the Start/Confirm/Abort actions per §B.3.
4. Root layout with persistent connectivity banner (§B.4 Layer 3) and logout control.

### B.8 Definition of Done — Part B

| # | Item | Verification |
|---|---|---|
| 1 | Operator can log in via Direct Grant and reach the WO list | Manual test with real Keycloak user |
| 2 | Confirm action is pessimistic — button disabled, spinner shown, no UI update until server responds | Manual test with artificial network delay |
| 3 | Double-click on Confirm does not trigger two requests | Manual test, verify only one `material_consumption` row created |
| 4 | Field-level error (missing reason code on QC fail) renders inline, not as toast, form data preserved | Manual test |
| 5 | Simulated `mes-traceability-service` outage renders the specific 503 ErrorBoundary card, not a generic crash | Fault injection test (stop traceability service, attempt OP-CUT confirm) |
| 6 | WebSocket disconnect shows persistent banner, does not block read-only navigation | Manual test, kill WS connection |
| 7 | Offline write attempt on a physical-consequence action is blocked with clear message, not silently queued | Manual test, go offline, attempt OP-MOLD confirm |
| 8 | Realtime `wo_assigned` push updates the WO list without a manual page refresh | Integration test |

---

## 1. Explicit Non-Goals for This Step

> Current-state note added by documentation audit on 2026-07-22: the WMS stock-visibility gap below was
> correct for this historical kiosk prompt. Phase 2 Step 2 now implements WMS backend stock staging;
> kiosk UI stock visibility remains a separate future UX decision.

- No MQTT/PLC integration (§A.1).
- No supervisor/admin console (Item/MBOM/Routing CRUD UI) — that remains a separate, not-yet-scheduled deliverable; flag this gap to the project owner rather than building it opportunistically here.
- No offline write replay on the backend (§A.2).
- No WMS stock visibility in the kiosk UI — unchanged gap from Stage B.

## 2. Process Reminder

Update `process/PROJECT_WORKLOAD_PROGRESS.md` for Step 5 immediately after completion, and explicitly note in that entry that this step included the first frontend deliverable (Kiosk Operator UI), since the original roadmap didn't schedule it as a separate line item — this prevents future confusion about when/where the UI work happened.
