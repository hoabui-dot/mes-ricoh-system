# MOM Platform — S-Factory

**Manufacturing Operations Management Platform**  
MES · WMS · QMS — Kizuna 3, Long An

---

## Kiến trúc tổng quan

```
                  ┌─────────────────────────────────┐
                  │   PLATFORM FOUNDATION (Phase 0)  │
                  │  Keycloak · Kafka · Kong Gateway  │
                  │  OTel + Grafana · Shared-Kernel   │
                  └─────────────────────────────────┘
                                 │
       ┌─────────────────────────┼──────────────────────────┐
       │                         │                          │
  ┌─────────┐               ┌─────────┐               ┌─────────┐
  │ CLUSTER │               │ CLUSTER │               │ CLUSTER │
  │   MES   │◄────events───►│   WMS   │◄────events───►│   QMS   │
  └─────────┘               └─────────┘               └─────────┘
  (Phase 1)                 (Phase 2)                 (Phase 3)
```

## Cấu trúc thư mục

```
mes-system/
├── infra/                          # Docker Compose platform layer
│   ├── docker-compose.platform.yml # Kafka, Keycloak, Kong, Observability
│   ├── docker-compose.yml          # Root compose (includes platform + services)
│   ├── keycloak/realm-export.json  # Pre-configured SSO realm
│   ├── kong/kong.yml               # API Gateway declarative config
│   └── observability/              # OTel, Tempo, Loki, Prometheus, Grafana
├── libs/
│   └── shared-kernel/              # @mom-platform/shared-kernel
│       ├── src/event-envelope.ts   # EventEnvelope<T> type + factory
│       ├── src/outbox-publisher.ts # Outbox pattern (write + relay worker)
│       ├── src/audit-trigger.sql   # Audit timestamps SQL trigger
│       └── src/lifecycle-state-machine.sql  # State FSM validator
├── services/
│   └── hello-world-service/        # Phase 0 scaffolding validator
├── portal/                         # Unified Portal (React + Vite + Keycloak-js)
├── process/
│   ├── phase-0.md                  # Phase 0 requirements & DoD checklist
│   └── stragegy.md                 # Architecture strategy
└── product-doc.md                  # Product & process specification
```

## Khởi động nhanh (Phase 0)

### Yêu cầu
- Docker + Docker Compose v2.x
- Node.js 20+ + npm 10+

### 1. Cài dependencies
```bash
npm install
```

### 2. Dựng Platform Foundation
```bash
npm run infra:up
# hoặc:
cd infra && docker compose -f docker-compose.platform.yml -f docker-compose.yml up -d
```

### 3. Kiểm tra trạng thái
```bash
npm run infra:ps
```

### 4. Truy cập các dịch vụ

| Service | URL | Credentials |
|---|---|---|
| **Unified Portal** | http://localhost:13000 | admin / Admin@123! |
| **Keycloak Admin** | http://localhost:18080 | admin / Admin@123! |
| **Kafka UI** | http://localhost:18082 | - |
| **Kong Admin** | http://localhost:18001 | - |
| **Grafana** | http://localhost:13001 | admin / Admin@123! |
| **Prometheus** | http://localhost:19090 | - |
| **Schema Registry** | http://localhost:18081 | - |
| **Hello-World API** | http://localhost:13010/health | - |

### 5. Test SSO end-to-end
1. Mở http://localhost:13000 → redirect đến Keycloak login
2. Đăng nhập: `admin` / `Admin@123!`
3. Thấy 3 app buttons (EXECUTIVE role)
4. Bấm MES → tab mới mở, không hỏi lại mật khẩu
5. Logout → tất cả session bị kết thúc

### 6. Test API qua Gateway
```bash
# Lấy token từ Keycloak
TOKEN=$(curl -s -X POST http://localhost:18080/realms/wonsealtech/protocol/openid-connect/token \
  -d 'client_id=portal-client&grant_type=password&username=admin&password=Admin@123!' \
  | jq -r '.access_token')

# Gọi hello-world qua Kong Gateway
curl -H "Authorization: Bearer $TOKEN" http://localhost:18000/api/hello
```

### 7. Kiểm tra trace trong Grafana
- Mở http://localhost:13001
- Explore → Tempo → tìm trace từ `hello-world-service`

### 8. Kiểm tra Kafka event
```bash
docker exec -it platform-kafka \
  kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic platform.hello.HelloWorldCreated.v1 \
  --from-beginning
```

## Tài khoản test

| Username | Password | Role | Truy cập |
|---|---|---|---|
| `admin` | `Admin@123!` | EXECUTIVE | MES + WMS + QMS |
| `plant.manager` | `Manager@123!` | PLANT_MANAGER | MES + WMS |
| `operator01` | `Operator@123!` | OPERATOR | MES only |

## Phase tiếp theo

Sau khi Phase 0 **Definition of Done** xanh hoàn toàn:

- **Phase 1:** `mes-master-data-service` → schema 30+ bảng, Outbox, event Release
- **Phase 2:** `mes-traceability-service` → QR Split Rule, atomic numbering
- **Phase 3:** `mes-execution-service` → WO lifecycle, Start/Finish
- **Phase 4:** `mes-kiosk-gateway-service` → WebSocket, offline sync

Xem chi tiết: [process/stragegy.md](process/stragegy.md)
