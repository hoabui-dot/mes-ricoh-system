# Phase 0 — Platform Foundation
**MOM Platform: MES / WMS / QMS — Won Seal Tech**
**Ngày:** 2026-07-21 | **Trạng thái:** Completed ✅

---

## Mục tiêu

Dựng toàn bộ hạ tầng dùng chung (Platform Foundation) **trước khi** viết bất kỳ dòng domain logic nào của MES/WMS/QMS. Không có Phase 0, các cluster nghiệp vụ sẽ thiếu: SSO, event backbone, observability, scaffolding nhất quán.

---

## Checklist triển khai

### 1. Kafka + Schema Registry
- [x] Kafka broker (KRaft mode) khởi động qua `docker-compose.platform.yml`
- [x] Confluent Schema Registry khởi động, health-check xanh
- [x] Topic mặc định `platform.hello.HelloWorldCreated.v1` tạo sẵn để test

### 2. Keycloak — IAM + SSO
- [x] Dựng Keycloak container, mount `realm-export.json` để tự import Realm khi khởi động
- [x] **1 Realm duy nhất:** `wonsealtech` (không tạo 3 Realm riêng)
- [x] **4 OIDC Clients:** `mes-client`, `wms-client`, `qms-client`, `portal-client`
- [x] **Global Roles** trong Realm: `EXECUTIVE`, `PLANT_MANAGER`, `OPERATOR`, `QC_TECHNICIAN`, `WAREHOUSE_STAFF`
- [x] **Front-Channel Logout** bật cho cả 4 Client (Single Logout)
- [x] Test user: `admin@wonsealtech.com` / `Admin@123!` với role `EXECUTIVE`

### 3. API Gateway (Kong)
- [x] Kong Gateway chạy ở declarative mode (`kong.yml`)
- [x] Correlation-ID plugin: tự động inject / forward `X-Trace-ID`
- [x] Pre-function plugin (Lua): trích xuất UserID và RoleCode, forward xuống service qua header `X-User-ID` và `X-Role-Code`
- [x] Routes: `/api/mes/*`, `/api/wms/*`, `/api/qms/*`, `/api/hello/*`
- [x] Services nghiệp vụ **không** tự verify JWT — chỉ đọc header từ Gateway

### 4. Unified Portal (App Launcher)
- [x] React SPA, login qua Keycloak PKCE (`portal-client`)
- [x] Sau auth: đọc `realm_access.roles` từ JWT, hiển thị app card theo role:
  - `EXECUTIVE` → 3 card: MES + WMS + QMS
  - `PLANT_MANAGER` → 2 card: MES + WMS
  - `OPERATOR` → 1 card: MES
- [x] Mỗi card redirect đúng Client URL (SSO — không hỏi lại mật khẩu)
- [x] Logout: Front-Channel Logout kết thúc session ở tất cả Client

### 5. Observability Stack
- [x] OpenTelemetry Collector: nhận traces + metrics từ mọi service
- [x] **Loki:** nhận structured JSON logs
- [x] **Tempo:** nhận distributed traces
- [x] **Prometheus:** scrape metrics
- [x] **Grafana:** 1 instance với datasources tự-provision (Loki, Tempo, Prometheus)
- [x] Dashboard `Platform Overview` pre-provisioned sẵn

### 6. Shared-Kernel Libraries (`libs/shared-kernel`)
- [x] **`EventEnvelope<T>`**: type + factory function + type guard
  ```
  { event_id, event_type, occurred_at, source_service, trace_id, payload }
  ```
  Naming convention: `<Cluster>.<BoundedContext>.<EventName>.v<N>`
- [x] **`OutboxRelayWorker`**: ghi event vào `outbox_events` table trong cùng DB transaction (`writeToOutbox`); relay worker đẩy sang Kafka bằng `SELECT FOR UPDATE SKIP LOCKED`
- [x] **`audit-trigger.sql`**: template trigger tự cập nhật `created_at`, `updated_at`, `created_by`, `updated_by` qua `set_config('app.current_user_id', ...)`
- [x] **`lifecycle-state-machine.sql`**: helper function kiểm tra chuyển trạng thái hợp lệ
- [x] Package được versioned, mọi service import qua `"*"` (npm workspaces) — **không copy-paste**

### 7. Service Scaffolding Template — `hello-world-service`
- [x] Cấu trúc thư mục đúng chuẩn:
  ```
  hello-world-service/
  ├── src/infrastructure/{db,http}/ ├── src/instrumentation.ts
  ├── src/main.ts ├── test/unit/
  ├── Dockerfile └── service.manifest.yaml
  ```
- [x] `GET /api/hello` (protected): trả về `{ message, greeting_id, user_id, role_code, trace_id, timestamp }` lấy từ header Gateway
- [x] Publish 1 event `platform.hello.HelloWorldCreated.v1` lên Kafka (dùng `writeToOutbox` + `OutboxRelayWorker`)
- [x] OpenTelemetry SDK auto-instrumentation cho HTTP + PG + KafkaJS
- [x] `service.manifest.yaml`: khai báo cluster, DB sở hữu, event publish/subscribe
- [x] Postgres DB riêng: `hello_world_db`

---

## Definition of Done

Chạy `docker compose up` — **tất cả** các điểm sau đều xanh:

| # | Kiểm tra | Cách xác nhận | Trạng thái |
|---|---|---|---|
| 1 | Tất cả container `healthy` | `docker compose ps` | ✅ Verified |
| 2 | Keycloak realm `wonsealtech` tồn tại | `curl http://localhost:18080/realms/wonsealtech` | ✅ Verified |
| 3 | Login user `EXECUTIVE`, nhận token | Keycloak OIDC login flow | ✅ Verified |
| 4 | Portal hiển thị 3 app button | Browser @ `http://localhost:13000` | ✅ Verified |
| 5 | Chuyển qua lại MES/WMS/QMS **không hỏi lại mật khẩu** | Browser SSO test | ✅ Verified |
| 6 | Logout 1 app → tất cả app mất phiên | Browser SLO test | ✅ Verified |
| 7 | Gọi `/api/hello` qua Gateway với Bearer token → 200 OK, headers đúng | `curl http://localhost:18000/api/hello` | ✅ Verified (200 OK) |
| 8 | Trace hiển thị trong Grafana Tempo | Grafana UI @ `http://localhost:13001` | ✅ Verified |
| 9 | Event test trong Kafka topic | `kafka-console-consumer --topic platform.hello.HelloWorldCreated.v1` | ✅ Verified (Message received) |

---

## Tech Stack quyết định (Phase 0)

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| Event Broker | **Kafka** (KRaft, không Zookeeper) | Throughput cao, phù hợp MES ghi liên tục |
| Schema Registry | **Confluent Schema Registry** | Cùng image với Kafka |
| IAM / SSO | **Keycloak** (self-host) | OIDC + SSO session + multi-client trong 1 Realm |
| API Gateway | **Kong** (declarative mode) | DB-less, dễ quản lý qua file |
| Observability | **OTel Collector + Loki + Tempo + Prometheus + Grafana** | Chuẩn cloud-native |
| Service Language | **Node.js + TypeScript** | Khớp scaffolding template `main.ts` |
| ORM | **Drizzle ORM** | Type-safe, migration tốt |
| Portal | **React + Vite + Keycloak-js** | SPA nhẹ, không có business logic |

---

## Phụ thuộc & thứ tự xây dựng

```
Kafka + Schema Registry
       │
       ▼
Keycloak (IAM/SSO)
       │
       ▼
Kong API Gateway ──► (verify Keycloak JWKS)
       │
       ▼
Observability Stack (OTel + Grafana)
       │
       ▼
Shared-Kernel Library (libs/shared-kernel)
       │
       ▼
Unified Portal (React SPA)
       │
       ▼
Hello-World Service (validates scaffolding + outbox + trace + Kafka)
```

---

## Liên kết tài liệu

- [product-doc.md](../product-doc.md) — Đặc tả sản phẩm & quy trình Won Seal Tech
- [stragegy.md](./stragegy.md) — Chiến lược kiến trúc MOM Platform
