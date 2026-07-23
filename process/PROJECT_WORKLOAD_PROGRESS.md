# MOM Platform — Project Workload & Progress Tracker

**Document Role:** Single source of truth for overall project workload progress, current milestone status, and next actionable steps. Must be updated after acting on any requirement or completing any implementation step.

---

## 📊 Overall Progress Summary

- **Current Progress:** `14 / 15` Milestones Completed (93%)
- **Current Active Milestone:** Phase 4 Platform E2E Integration
- **Completed Steps:** 14
- **Remaining Steps:** 1

> **Cập nhật so với version trước:** chèn thêm **Phase 1, Step 8 — i18n Platform Foundation** trước khi
> đóng Phase 1 và trước khi bắt đầu Phase 2 (WMS). Lý do: đa ngôn ngữ (VI/EN/JA/KO) là 1 **mô hình dữ
> liệu xuyên suốt platform** (tương tự bài học SSO ở Phase 0), không phải tính năng UI đơn lẻ — nếu để
> WMS/QMS tự xây UI trước rồi mới gắn i18n sau, sẽ lặp lại đúng loại migrate 3 tầng (schema → event
> payload → read-model → UI) mà toàn bộ dự án đang cố tránh. Step này retrofit MES (đã Done) và thiết
> lập contract dùng chung cho WMS/QMS thừa hưởng miễn phí. Toàn bộ số thứ tự từ WMS trở đi dời xuống 1
> bậc so với version trước (Step 8 cũ `wms-master-data-service` → Step 9, v.v.).

---

## 🗺️ Roadmap & Detailed Workload Breakdown

| # | Step / Phase | Bounded Context & Scope | Stack | Status | Verification / Trace |
|---|---|---|---|---|---|
| **0** | **Phase 0: Platform Foundation** | Kafka, Keycloak SSO (`wonsealtech`), Kong API Gateway, Observability (OTel/Loki/Tempo/Prometheus/Grafana), `libs/shared-kernel`, Unified Portal | Infra / Node / React | **Completed ✅** | `implementation/phase-0-platform-foundation.md` |
| **1** | **Phase 1, Step 1: Master Data** | `mes-master-data-service` (26 tables, Validation Engine, MasterData Events) | Node.js, Drizzle | **Completed ✅** | `implementation/phase-1-mes-master-data-service.md` |
| **2** | **Phase 1, Step 2: Traceability** | `mes-traceability-service` (Policies, Atomic Numbering, QR Split Rules, Label Instances, Genealogy Log) | Go 1.22, pgx/v5 | **Completed ✅** | `implementation/phase-1-2-mes-traceability-service.md` |
| **3** | **Phase 1, Step 3: Execution (Stage A)** | `mes-execution-service` (WO Header/Operations/Materials, `DetermineDemand`, `CheckMasterDataReadiness`, `CreateWorkOrder`, `ComputeAndCheck`, `ApproveWorkOrder`) | Go 1.22, pgx/v5 | **Completed ✅** | `implementation/phase-1-3-mes-execution-service.md` |
| **4** | **Phase 1, Step 4: Execution (Stage B)** | `mes-execution-service` (Real-time Start/Finish operation execution, `OP-MIX`, `OP-CUT`, `OP-MOLD`, material consumption, execution sessions) | Go 1.22, pgx/v5 | **Completed ✅** | `implementation/phase-1-4-mes-execution-service-b.md` |
| **5** | **Phase 1, Step 5: Kiosk Gateway & UI** | `mes-kiosk-gateway-service` (Keycloak Direct Access Grant, WebSocket hub, offline queue) & `kiosk-operator-ui` (Remix/Vite tablet frontend, pessimistic confirmation, 3-layer error handling) | Go 1.22 / Vite / React | **Completed ✅** | `implementation/phase-1-5-mes-kiosk-gateway.md` |
| **6** | **Phase 1, Step 6: MES Console UI** | `mes-console` (Desktop administrative & planning UI for Tier 1/2 Master Data Admin, WO Planning `DetermineDemand`, Compute & Check, Role-gated Approval/Rejection) | Vite / React / Tailwind | **Completed ✅** | `implementation/phase-1-6-mes-console.md` |
| **7** | **Phase 1, Step 7: Labor Resource Mgmt + WorkCenter CRUD + MBOM Console Fix** | `mes-master-data-service` extension (`md_employee`, `md_shift`, `md_employee_shift_schedule`, `md_work_center` full CRUD) + `mes-console` extension (Employee/Shift/Work Calendar screens, WorkCenter Create/Edit + headcount modal, MBOM tree editor fix) | Node.js, Drizzle / Vite, React | **Completed ✅** *(post-release hotfix applied — see `implementation/phase-1-7-labor-resource-management.md`)* | `implementation/phase-1-7-labor-resource-management.md` |
| **8** | **Phase 1, Step 8: i18n Platform Foundation (VI/EN/JA/KO) + MES Retrofit** | `libs/shared-kernel` + `libs/shared-kernel-go` (`LocalizedText`/`SupportedLocale` contracts) + `libs/i18n-ui-shared` (new frontend package) + `mes-master-data-service` schema/event/validation retrofit + read-model updates in 3 Go services + locale switcher in `mes-console`/`kiosk-operator-ui`/`portal` | TS / Go / React | **Completed ✅** *(manual SSO/label-print checks remain in trace)* | `implementation/phase-1-8-i18n-platform-foundation.md` |
| **8a** | **Phase 1, Step 8a: i18n Static Coverage & Data Quality Hotfix** | MES static i18n gap fix, `i18n_data_quality_flag` sidecar table/API, MES Translation Review Queue, audit script, seed-data language enrichment migration/script, frontend static-string scanner, ADR governance update | TS / React / Node | **Completed ✅** | `implementation/phase-1-8a-i18n-coverage-data-quality-hotfix.md`, `docs/i18n/coverage-checklist.md`, `docs/adr/0002-i18n-completeness-governance.md` |
| **9** | **Phase 2, Step 1: WMS Master Data** | `wms-master-data-service` (Warehouse, Zone, Location, Storage Bin, UOM mapping) — **must use `LocalizedText` from day one for any translatable field**, per Step 8 contract. Closure addendum completed: Kong JWT auth fixed, no DELETE grants verified, Tempo trace evidence captured. | Node.js / TypeScript | **Completed ✅** | `implementation/phase-2-1-wms-master-data-service.md` |
| **10** | **Phase 2, Step 2: WMS Inventory & Stock** | Part A patch: WMS storage locations now model `Storage` vs `WorkCenterStaging`. Part B: `wms-inventory-service`, `wms-inbound-service`, `wms-outbound-service` implement two-echelon stock ledger, inbound receipts, outbound staging-first allocation, shortage declaration, FEFO, and MES staging endpoint integration. | Node / Go | **Completed ✅** | `implementation/phase-2-2-wms-inventory-stock.md` |
| **11** | **Phase 2, Step 3: WMS Console** | `wms-console` — React/Vite/shadcn-style UI matching the actual `mes-console` stack, with Warehouse Map, Master Data, Inventory, Inbound, Outbound, i18n, Keycloak `wms-client`, Docker/nginx serving on `13091` | React / Vite / shadcn-style UI | **Completed ✅** | `implementation/phase-2-3-wms-console.md` |
| **12a** | **Phase 3, Step 1: QMS Inspection Service** | `qms-inspection-service` — Inspection Plans, defect codes, characteristics, inspection results, MES event consumer, idempotent drafts, localized fields, outbox events | Node.js / TypeScript / Express / PostgreSQL / KafkaJS | **Completed ✅** | `implementation/phase-3-1-qms-inspection-service.md` |
| **12b** | **Phase 3, Step 2: QMS Nonconformance Service** | `qms-nonconformance-service` — NCR, disposition, CAPA, inspection-failure consumer, idempotent case creation | Node.js / TypeScript / Express / PostgreSQL / KafkaJS | **Completed ✅** | `implementation/phase-3-2-qms-nonconformance-service.md` |
| **12c** | **Phase 3, Step 3: QMS Console** | `qms-console` — inspection queue, result recording, NCR/CAPA workflows, i18n from first commit | React / Vite / Tailwind / shadcn-style UI | **Completed ✅** | `implementation/phase-3-3-qms-console.md` |
| **13** | **Phase 4: Platform E2E Integration** | Cross-cluster End-to-End integration testing (MES ↔ WMS ↔ QMS), Staging load test, Security Audit | Monorepo Stack | **Pending ⏳** | Pending |

---

## 🛠️ Non-Milestone Hotfix / Hardening Log

These entries do **not** change milestone counts or roadmap numbering, but they are part of current
workload context and must be read before extending the affected areas.

| Date | Hotfix / Hardening | Scope | Status | Verification / Trace |
|---|---|---|---|---|
| 2026-07-22 | SSO Flow Portal Hotfix | Portal app-resolution policy, live Keycloak URL/logout normalization, process-fix implementation rule | **Completed ✅** | `implementation-fix/sso-flow-portal-hotfix.md` |
| 2026-07-22 | Circuit Breaker Hardening | Audited and hardened synchronous server-to-server dependencies: MES execution -> master-data/traceability/WMS outbound, WMS outbound -> WMS inventory, WMS inbound -> WMS inventory, kiosk gateway -> Keycloak. Added shared Go breaker baseline, Node opossum breaker, OTel transition telemetry, stage-materials idempotency protection, and service manifest dependency declarations. | **Completed ✅** | `implementation-fix/circuit-breaker-hardening.md`; Go tests in `libs/shared-kernel-go`, `mes-execution-service`, `wms-outbound-service`, `mes-kiosk-gateway-service`; `npm run test/build --workspace=wms-inbound-service` |
| 2026-07-23 | QMS Console Step 3b UI/UX Hardening | Audited QMS against WMS primitives; replaced native language/checkbox controls, added URL-persisted 10/50/100 pagination, specific pessimistic AlertDialog confirmations, plan release detail action, exact industrial theme tokens, and registered JA/KO fallback flags in the MES Translation Review Queue. | **Completed ✅** | `implementation/phase-3-3-qms-console.md`; `scripts/i18n-audit/register-qms-console-fallback-flags.ts` |
| 2026-07-23 | QMS Full Demo Seed | Added deterministic idempotent inspection and nonconformance seed data covering plans, characteristics, results, defects, NCR/disposition, CAPA, and links for every QMS Console lifecycle state. | **Completed ✅** | `implementation/qms-demo-seed-data.md`; `npm run seed:qms:demo` |
| 2026-07-23 | Three-console SSO audit and user guide | Re-verified Portal/MES/WMS/QMS availability, Keycloak role-scoped tokens, WMS/QMS Kong rejection behavior, corrected live and checked-in `wms-client` from stale `4001` to `13091`, marked WMS/QMS live in the portal, and recorded the legacy MES Kong bearer-auth gap for Phase 4. | **Completed ✅** | `docs/SSO-USER-GUIDE-MES-WMS-QMS.md`; `implementation-fix/sso-mes-wms-qms-verification.md` |

---

## 🎯 Immediate Next Step Instructions

- **Target Task:** Phase 4 — Platform E2E Integration (MES ↔ WMS ↔ QMS, staging load and security audit).
- **Prerequisite Rule:** WMS Inventory/Inbound/Outbound services must consume WMS/MES references through
  local read models and must not query another service database directly.
- **Hardening Rule:** Any new synchronous server-to-server HTTP dependency must follow
  `implementation-fix/circuit-breaker-hardening.md`: circuit breaker, explicit retryable 503 behavior,
  OTel transition telemetry, and manifest documentation.
- **Rule:** Upon completing or updating any task, update this document (`process/PROJECT_WORKLOAD_PROGRESS.md`) immediately.
