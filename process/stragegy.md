# CHIẾN LƯỢC XÂY DỰNG HỆ THỐNG — MOM PLATFORM (MES / WMS / QMS)
**Vai trò tài liệu:** Kim chỉ nam kiến trúc cho toàn bộ quá trình xây dựng, dùng lại mỗi khi bắt đầu 1 cluster/service mới để không lệch pattern.
**Đối tượng đọc:** Tech Lead, Software Architect, Dev Team.

---

## 0. Mental Model đúng (đã hiệu chỉnh)

Sai lầm cần tránh: coi MES/WMS/QMS là 3 **service**. Đúng là coi mỗi cái là 1 **Cluster** — một platform microservices con hoàn chỉnh, độc lập vận hành, độc lập scale, độc lập release, chỉ giao tiếp với bên ngoài qua **event contract** và **API hợp đồng rõ ràng** — không bao giờ qua shared database.

```
                    ┌───────────────────────────────┐
                    │   PLATFORM FOUNDATION (dùng chung) │
                    │  IAM · Event Broker · API Gateway  │
                    │  Observability · Shared-Kernel Libs │
                    └───────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
   ┌──────────┐              ┌──────────┐              ┌──────────┐
   │ CLUSTER  │              │ CLUSTER  │              │ CLUSTER  │
   │   MES    │◄───events───►│   WMS    │◄───events───►│   QMS    │
   └──────────┘              └──────────┘              └──────────┘
   nhiều service              nhiều service              nhiều service
   nhiều DB riêng              nhiều DB riêng              nhiều DB riêng
```

Nguyên tắc bất biến xuyên suốt: **1 service = 1 database = 1 bounded context = 1 team ownership = 1 khả năng deploy độc lập.** Vi phạm nguyên tắc này ở bất kỳ đâu là nguồn gốc chính của sai sót khi hệ thống lớn dần.

---

## 1. Domain Decomposition — chia bounded context bên trong từng Cluster

### 1.1 Cluster MES (xây trước, dựa trên 2 tài liệu đã cung cấp)

Không xây MES thành 1 service to chứa 30+ bảng. Tách theo bounded context nghiệp vụ, mỗi context có nhịp thay đổi và nhịp ghi/đọc rất khác nhau — đây là lý do kỹ thuật để tách, không phải tách cho vui:

| Service | Bounded Context | Vì sao tách riêng | Bảng/dữ liệu sở hữu |
|---|---|---|---|
| **mes-master-data-service** | Sản phẩm, quy trình, tài nguyên — dữ liệu **thay đổi chậm**, cần version hóa nghiêm ngặt, ghi ít-đọc nhiều | Nhịp ghi rất thấp (Release MBOM vài lần/tuần) nhưng bị đọc liên tục bởi mọi service khác → tối ưu cho read-heavy, cache tốt | Site, Area, UOM, Shift, ReasonCode, Item, ItemRevision, MBOM Header/Line, Substitute, ProductionVersion, Operation, Routing Header/Operation, ProductionStandard, WorkInstruction, WorkCenter, Workstation, Equipment, ResourceAssignment/Capability/Calendar, Skill |
| **mes-traceability-service** | Chính sách QR, quy tắc tách, numbering, label template + **runtime genealogy** (transactional) | Có yêu cầu đặc thù về **atomic sequence** (CurrentSequence) và **high write throughput** khi công nhân quét QR liên tục tại xưởng — khác hẳn nhịp ghi chậm của Master Data | TraceabilityPolicy, NumberingRule, QRSplitRule, LabelTemplate + (transactional, xây sau) Label Instance, Genealogy Event |
| **mes-execution-service** | Lõi thực thi sản xuất — **transactional, real-time, write-heavy** | Đây là trái tim MES: WO, phân rã Operation, ghi nhận Start/Finish liên tục suốt ca làm việc — cần tối ưu khác hẳn Master Data (throughput, idempotency, event sourcing cân nhắc) | WO, WO Operation, Dispatch, Execution Session, Production Result, Material Consumption |
| **mes-kiosk-gateway-service** | Edge-facing: quản lý Terminal, kênh giao tiếp real-time với thiết bị hiện trường, đồng bộ offline | Đặc thù riêng: WebSocket/long-poll, buffer khi mất mạng, không nên trộn logic edge với logic domain | Terminal, phiên kết nối thiết bị, offline sync queue |
| **mes-access-service** *(hoặc dùng chung IAM platform)* | Role/Permission/User Scope | Xem xét đặt ở Platform Foundation nếu WMS/QMS cũng cần mô hình phân quyền tương tự — tránh xây IAM riêng 3 lần | RolePermission, UserResourceScope |

> **Quyết định kiến trúc cần chốt sớm:** IAM (định danh + phân quyền) nên là dịch vụ **Platform-level dùng chung** cho cả 3 cluster (1 nguồn sự thật về User, Role), còn **DataScopeType/ConditionExpression theo từng domain** (ví dụ "chỉ xem WO trong Area X") thì mỗi cluster tự quản lý phần "authorization theo domain" của riêng nó, chỉ tham chiếu UserID/RoleID từ IAM chung. Đây là pattern chuẩn (centralized authentication, decentralized fine-grained authorization). Vì cả 3 hệ đều là website và cùng phục vụ chung 1 nhóm người dùng cấp cao (giám đốc, quản lý đa hệ), IAM ở đây phải triển khai kèm **SSO** ngay từ Phase 0 — chi tiết kiến trúc và checklist cụ thể xem **mục 2.1**.

### 1.2 Cluster WMS (thiết kế khung trước, xây sau — để không bị vướng khi tới lượt)

| Service (dự kiến) | Bounded Context |
|---|---|
| `wms-master-data-service` | Warehouse, Zone, Location, Storage Bin, UOM (tái dùng contract với MES qua event, không share bảng) |
| `wms-inventory-service` | Stock ledger, tồn kho theo location/lot |
| `wms-inbound-service` | Nhận hàng, putaway |
| `wms-outbound-service` | Picking, xuất kho theo WO (subscribe event từ MES) |

### 1.3 Cluster QMS (thiết kế khung trước)

| Service (dự kiến) | Bounded Context |
|---|---|
| `qms-inspection-service` | Inspection Plan, kết quả kiểm tra (liên kết OP-QC từ MES qua event) |
| `qms-nonconformance-service` | NCR, CAPA |

**Việc cần làm ngay dù chưa code WMS/QMS:** viết trước **Bounded Context Canvas** (1 trang mô tả: trách nhiệm, dữ liệu sở hữu, event publish/subscribe) cho từng service dự kiến ở trên — để khi tới lượt xây, không phải đoán lại ranh giới từ đầu, và để thiết kế event contract của MES ngay từ bây giờ đã tính trước "ai sẽ nghe" các event này.

---

## 2. Platform Foundation — xây 1 lần, dùng chung cho cả 3 Cluster

Đây là phần **bắt buộc phải có trước khi chạm vào bất kỳ service nghiệp vụ nào**, vì mọi cluster đều phụ thuộc vào nó. Xây thiếu phần này trước sẽ dẫn tới việc mỗi cluster tự chế 1 kiểu logging/event khác nhau — chính là "thiếu sót khi xây tiếp phân hệ" mà bạn muốn tránh.

| Thành phần | Vai trò | Lựa chọn công nghệ đề xuất |
|---|---|---|
| **Event Broker** | Xương sống giao tiếp real-time, cross-service, cross-cluster | Kafka (throughput cao, phù hợp MES ghi liên tục; có thể đổi RabbitMQ nếu ưu tiên đơn giản hóa cho demo) |
| **Schema Registry / Event Contract Registry** | Định nghĩa version cho từng loại event, kiểm tra backward-compatibility trước khi merge | Confluent Schema Registry (Avro/JSON Schema) hoặc đơn giản hơn: 1 package `libs/event-contracts` trong monorepo với JSON Schema + test tương thích |
| **API Gateway** | 1 cổng vào duy nhất cho client (Admin UI, Kiosk App), routing tới đúng service/cluster, auth trung tâm | Kong / KrakenD / hoặc Express Gateway cho demo |
| **IAM + SSO (Identity, Access & Single Sign-On)** | Nguồn sự thật duy nhất về User/Role; **1 lần đăng nhập dùng chung cho cả 3 website MES/WMS/QMS** — không ai phải tạo/nhớ 3 tài khoản | Keycloak (self-host, hỗ trợ sẵn OIDC + SSO session + multi-client trong 1 Realm) |
| **Unified Portal / App Launcher** | 1 trang landing chung sau khi login, liệt kê 3 hệ thống như 3 "app" để người dùng bấm vào (giống Google Workspace app switcher) — đặc biệt cần cho giám đốc/quản lý cấp cao dùng cả 3 hệ | Frontend nhẹ (React), chỉ hiển thị app theo Role được cấp, không chứa business logic |
| **Observability Stack** | Structured log, trace xuyên service, metric | OpenTelemetry Collector + Loki (log) + Tempo/Jaeger (trace) + Prometheus/Grafana (metric) |
| **Shared-Kernel Libraries** | Code dùng chung KHÔNG chứa domain logic: Audit trigger SQL lib, Lifecycle State Machine SQL lib, Outbox publisher lib, Event envelope type | Package riêng trong `libs/`, versioned, mọi service import qua package manager nội bộ — **không copy-paste giữa service** |
| **Service Scaffolding Template** | Khung chuẩn để sinh 1 service mới nhất quán (xem mục 5) | Cookiecutter / Nx generator / Yeoman |

### 2.1 Chiến lược SSO — xây lúc nào và xây như thế nào

**Trả lời thẳng câu hỏi "xây lúc nào":** SSO phải nằm trong **Phase 0 (Platform Foundation)**, xây **trước khi có bất kỳ UI/website nào của MES/WMS/QMS**, không phải một tính năng thêm vào cuối. Lý do kỹ thuật, không phải chỉ vì tiện:

- SSO không phải là "1 nút Login dùng chung" — nó là **1 mô hình danh tính (identity model)** mà toàn bộ Role/Permission của cả 3 cluster đều phải build dựa trên đó. Nếu xây MES/WMS/QMS trước rồi mới gắn SSO sau, gần như chắc chắn phải **retrofit lại toàn bộ bảng permission và middleware auth của cả 3 hệ** — đúng loại "phải migrate lại sau" mà chúng ta đang cố tránh từ đầu.
- `md_role_permission` / `md_user_resource_scope` (đã thiết kế trong MES Master Data) chỉ nên lưu **RoleCode** và **UserID** — hai giá trị này phải đến từ 1 nguồn IAM trung tâm ngay từ ngày đầu tiên viết bảng, không phải tự sinh UserID nội bộ trong MES rồi map lại sau.

**Kiến trúc SSO cụ thể (dùng Keycloak, chuẩn OIDC):**

1. **1 Keycloak Realm dùng chung** cho toàn công ty (ví dụ `wonsealtech`), không tạo 3 Realm riêng cho 3 hệ — vì tạo riêng sẽ lại quay về bài toán "3 tài khoản" mà bạn muốn tránh.
2. **Mỗi cluster đăng ký là 1 OIDC Client riêng trong cùng Realm đó**: `mes-client`, `wms-client`, `qms-client`, cộng thêm `portal-client` cho trang landing chung. Nhiều Client trong 1 Realm vẫn cho phép SSO session dùng chung — người dùng login 1 lần ở Keycloak, sau đó chuyển qua lại giữa MES/WMS/QMS mà **không phải nhập lại mật khẩu** (trình duyệt giữ SSO session cookie ở Keycloak, mỗi client chỉ redirect qua lấy token).
3. **Global Role vs Domain-Scoped Permission** (đã note sơ ở mục 1.1, giờ làm rõ hơn):
   - **Global Role** (ví dụ `EXECUTIVE`, `PLANT_MANAGER`) định nghĩa **trong Keycloak Realm Role** — dùng để quyết định giám đốc thấy được app nào trên Unified Portal.
   - **Fine-grained Permission theo domain** (ví dụ "chỉ duyệt MBOM tại Site HN01") vẫn nằm trong bảng `md_role_permission`/`md_user_resource_scope` riêng của từng cluster — KHÔNG nhét hết vào Keycloak, vì mỗi domain có mô hình phân quyền khác nhau (MES theo Site/Area/WorkCenter, WMS theo Warehouse/Zone, QMS theo Inspection Plan) và Keycloak không nên "biết" chi tiết nghiệp vụ của từng cluster.
4. **Luồng đăng nhập cho người dùng cấp cao (giám đốc, quản lý đa hệ):** login 1 lần tại Unified Portal → Keycloak cấp SSO session → Portal hiển thị 3 app theo Global Role được gán → bấm vào MES/WMS/QMS bất kỳ → mỗi app tự redirect lấy token cho Client tương ứng mà **không hỏi lại mật khẩu**. Với người dùng vận hành (công nhân dùng Kiosk) thì luồng đơn giản hơn: chỉ cần login trực tiếp vào `mes-client`, không cần thấy Unified Portal.
5. **Single Logout (SLO):** khi logout ở 1 hệ (ví dụ WMS), Keycloak phải kết thúc session ở cả MES/QMS nếu đang mở — cấu hình `Front-Channel Logout` cho cả 3 Client, việc này hay bị bỏ sót nếu build SSO muộn nên cần đưa vào checklist Phase 0 ngay.
6. **API Gateway xác thực token 1 lần**, sau đó forward `UserID` + `RoleCode` (đã giải mã từ JWT) xuống các service qua header nội bộ — các service nghiệp vụ (`mes-execution-service`...) không tự verify JWT nữa, tránh trùng lặp logic xác thực ở 30+ service sau này.

**Cập nhật checklist Phase 0** (mục 4 bên dưới) để phản ánh đúng các bước SSO này ngay từ đầu.

---

## 3. Nguyên tắc giao tiếp Cross-Service & Cross-Cluster

1. **Không bao giờ query chéo database.** Kể cả giữa 2 service trong cùng 1 cluster (ví dụ `mes-execution-service` cần biết MBOM) — nó không JOIN vào DB của `mes-master-data-service`. Nó phải:
   - Consume event `MBOMReleased` và giữ **local read-model** (bản sao rút gọn, eventually consistent), **hoặc**
   - Gọi API đồng bộ (chỉ khi cần dữ liệu tức thời, chấp nhận coupling tạm thời và có circuit breaker)
2. **Outbox Pattern bắt buộc** ở mọi service có ghi transactional quan trọng: ghi data + ghi event vào bảng `outbox_event` trong cùng 1 transaction DB, có 1 relay process riêng đẩy sang Kafka — tránh mất event khi service crash giữa chừng.
3. **Event Envelope chuẩn hóa dùng chung** (định nghĩa 1 lần trong shared-kernel):
   ```json
   {
     "event_id": "uuid",
     "event_type": "MES.MasterData.MBOMReleased.v1",
     "occurred_at": "2026-08-01T10:00:00Z",
     "source_service": "mes-master-data-service",
     "trace_id": "uuid",
     "payload": { }
   }
   ```
   Naming convention: `<Cluster>.<BoundedContext>.<EventName>.v<N>` — có version ngay trong tên topic/type để hỗ trợ tiến hóa schema không phá vỡ consumer cũ.
4. **Saga pattern cho quy trình xuyên cluster** (ví dụ: WO hoàn thành ở MES → cần trừ kho ở WMS → cần kiểm QC ở QMS): dùng **choreography-based saga** (mỗi service tự nghe event và tự hành động, không có 1 orchestrator trung tâm) cho giai đoạn đầu vì đơn giản hơn để build/debug; chỉ chuyển sang orchestration-based saga (dùng Temporal/Camunda) khi số bước saga quá phức tạp để quản lý bằng choreography thuần.
5. **Anti-Corruption Layer**: khi 1 cluster cần model dữ liệu của cluster khác theo cách khác với bản gốc (ví dụ WMS gọi "Item" là "Stock Keeping Unit" với ít trường hơn), viết 1 adapter/mapper riêng trong chính service consumer đó — không ép cluster nguồn phải đổi model để tiện cho cluster khác.

---

## 4. Lộ trình xây dựng theo Phase (thứ tự bắt buộc để tránh thiếu sót)

### Phase 0 — Platform Foundation (làm trước tiên, không được bỏ qua)
- [ ] Dựng Kafka + Schema Registry (docker-compose)
- [ ] Dựng Keycloak, tạo **1 Realm chung** (`wonsealtech`), tạo sẵn 3 OIDC Client (`mes-client`, `wms-client`, `qms-client`) + 1 Client cho Portal (`portal-client`)
- [ ] Định nghĩa **Global Role** trong Realm (`EXECUTIVE`, `PLANT_MANAGER`, `OPERATOR`...) — dùng để quyết định app nào hiện trên Unified Portal, KHÔNG dùng để lưu fine-grained permission theo domain
- [ ] Cấu hình **Front-Channel Logout** cho cả 3 Client để đảm bảo Single Logout hoạt động đúng ngay từ đầu
- [ ] Dựng **Unified Portal** (app launcher) tối thiểu: login qua Keycloak → hiển thị 3 nút app theo Global Role → mỗi nút redirect đúng Client tương ứng
- [ ] Dựng API Gateway, cấu hình xác thực JWT tập trung tại Gateway (verify 1 lần, forward `UserID`/`RoleCode` xuống service qua header nội bộ), route rỗng phía sau (chưa có service nghiệp vụ, chỉ để có khung)
- [ ] Dựng Observability stack tối thiểu (log tập trung + 1 dashboard Grafana rỗng)
- [ ] Viết `libs/shared-kernel`: Event Envelope type, Outbox publisher, Audit trigger SQL, Lifecycle State Machine SQL
- [ ] Viết Service Scaffolding Template (xem mục 5) và test bằng cách sinh 1 service "hello-world" chạy được qua Gateway, publish được 1 event test, log/trace hiển thị đúng trên Grafana

**Definition of Done Phase 0**: chạy `docker-compose up`; login 1 lần tại Unified Portal bằng 1 tài khoản test có Global Role `EXECUTIVE`, thấy đủ 3 nút app (dù MES/WMS/QMS phía sau còn là service rỗng), bấm qua lại giữa các app **không bị hỏi lại mật khẩu**; logout ở 1 app thì các app còn lại cũng mất phiên; gọi API qua Gateway thành công với token đã forward đúng `UserID`/`RoleCode`; thấy trace trong Tempo; thấy 1 event test trong Kafka topic — chứng minh toàn bộ hạ tầng dùng chung (bao gồm SSO) hoạt động trước khi viết bất kỳ dòng domain logic nào.

### Phase 1 — Cluster MES (xây theo đúng thứ tự phụ thuộc domain)
1. `mes-master-data-service` — dùng schema 30+ bảng đã thiết kế (Foundation → Product → Process → Resource → Traceability config → Access), có outbox, publish event `ItemRevisionReleased`, `MBOMReleased`, `RoutingReleased`, `ProductionVersionReleased`, v.v. cho mỗi lần Release.
2. `mes-traceability-service` — consume event từ Master Data (biết Item nào cần policy gì), triển khai atomic numbering, QR split logic.
3. `mes-execution-service` — consume Master Data + Traceability qua event/local read-model, triển khai WO lifecycle, publish `WOCompleted`, `MaterialConsumed`, `QRChildActivated` (những event mà WMS/QMS sau này sẽ cần).
4. `mes-kiosk-gateway-service` — WebSocket layer, consume event từ Execution để push real-time xuống kiosk.
5. Tích hợp toàn Cluster MES qua Gateway + IAM, kiểm thử end-to-end 1 luồng đầy đủ (tạo WO → Start/Finish → quét QR mẹ-con → sinh tem con) chạy qua tất cả 4 service.

**Definition of Done Phase 1**: toàn bộ luồng nghiệp vụ MES MVP (theo mục VII.2 của tài liệu gốc) chạy được qua nhiều service thật sự tách biệt, có thể tắt riêng `mes-kiosk-gateway-service` mà 3 service kia vẫn hoạt động độc lập (chứng minh decoupling đúng).

### Phase 2 — Cluster WMS (lặp lại đúng pattern đã chứng minh ở Phase 1)
- Dùng lại Service Scaffolding Template, dùng lại shared-kernel, không thiết kế lại từ đầu.
- Viết Anti-Corruption Layer để WMS tiêu thụ event `MBOMReleased`/`WOCompleted` từ MES.
- Định nghĩa rõ event WMS sẽ publish ngược lại cho MES (`StockReserved`, `StockShort`) — vì MES Execution có thể cần biết tồn kho trước khi cho phép Start Operation.

### Phase 3 — Cluster QMS (lặp lại pattern)
- Tương tự, consume `WOOperationCompleted` (đặc biệt tại `OP-QC`), publish `InspectionPassed`/`InspectionFailed`/`NCRRaised` để MES quyết định hold lô hàng.

### Phase 4 — Cross-Cluster Saga & Hardening
- Thiết kế saga cho quy trình dài xuyên 3 cluster (ví dụ: WO hoàn thành → giữ hàng WMS → chờ QC pass → mới cho phép nhập kho thành phẩm).
- Load test, chaos test (tắt ngẫu nhiên 1 service xem hệ thống có graceful degrade không), security review, multi-tenant nếu cần.

---

## 5. Service Scaffolding Template (bắt buộc áp dụng cho MỌI service, mọi cluster)

Để tránh mỗi service được viết theo 1 phong cách khác nhau (nguồn thiếu sót phổ biến khi nhiều người/nhiều giai đoạn cùng build), mọi service — bất kể thuộc cluster nào — phải theo đúng khung sau:

```
<service-name>/
├── src/
│   ├── domain/           # entity, value object, domain event — không phụ thuộc framework
│   ├── application/      # use case / command handler / query handler
│   ├── infrastructure/
│   │   ├── db/            # migration, repository implementation
│   │   ├── outbox/         # outbox publisher, relay worker
│   │   ├── events/          # consumer cho event từ service/cluster khác
│   │   └── http/             # REST/GraphQL controller
│   └── main.ts
├── migrations/            # SQL migration riêng của service này, không đụng service khác
├── test/
│   ├── unit/
│   ├── integration/
│   └── contract/           # contract test với event mà service này publish/consume
├── Dockerfile
├── docker-compose.override.yml   # chỉ chứa DB + dependency riêng của service này
└── service.manifest.yaml   # khai báo: tên service, cluster sở hữu, event publish/subscribe, owned DB
```

`service.manifest.yaml` là điểm quan trọng nhất — đây là **tài liệu sống** giúp bất kỳ ai (kể cả AI agent) khi bắt đầu xây service tiếp theo có thể tra cứu ngay: service nào publish event gì, service nào cần subscribe gì, tránh phải đọc lại toàn bộ codebase cluster cũ.

```yaml
service: mes-master-data-service
cluster: MES
owns_database: mes_master_data_db
publishes_events:
  - MES.MasterData.ItemRevisionReleased.v1
  - MES.MasterData.MBOMReleased.v1
  - MES.MasterData.ProductionVersionReleased.v1
consumes_events: []
```

---

## 6. Docker & Docker Compose — chiến lược cho demo nhiều cluster

Không dùng 1 file `docker-compose.yml` khổng lồ chứa tất cả. Dùng cấu trúc phân lớp để dễ chạy từng phần khi cần:

```
infra/
├── docker-compose.platform.yml     # Kafka, Schema Registry, Keycloak, Gateway, Observability
├── docker-compose.mes.yml          # 4 service MES + 4 DB Postgres riêng
├── docker-compose.wms.yml          # (giai đoạn sau)
├── docker-compose.qms.yml          # (giai đoạn sau)
└── docker-compose.yml              # root file dùng `include:` hoặc merge cả platform + các cluster đang active
```

Chạy demo linh hoạt:
```bash
# Chỉ chạy platform + MES (giai đoạn hiện tại)
docker compose -f docker-compose.platform.yml -f docker-compose.mes.yml up

# Sau này thêm WMS mà không đụng MES đang chạy
docker compose -f docker-compose.platform.yml -f docker-compose.mes.yml -f docker-compose.wms.yml up
```
Mỗi service trong `docker-compose.mes.yml` có Postgres container riêng (`mes-master-data-db`, `mes-traceability-db`, `mes-execution-db`), đúng nguyên tắc database-per-service — kể cả ở môi trường demo, để hành vi giống production ngay từ đầu (tránh việc "demo thì gộp chung DB cho nhanh" rồi sau phải migrate lại — đúng tinh thần bạn muốn tránh từ đầu).

---

## 7. Cơ chế quản trị chống trôi (Anti-Drift Governance)

Đây là phần trả lời trực tiếp cho yêu cầu "tránh thiếu sót khi xây tiếp phân hệ tiếp theo":

1. **Architecture Decision Record (ADR)**: mọi quyết định kiến trúc quan trọng (chọn Kafka thay vì RabbitMQ, chọn choreography saga thay vì orchestration...) ghi thành 1 file ngắn trong `docs/adr/NNNN-title.md`. Khi xây WMS, thành viên mới/AI agent đọc ADR trước, không phải đoán lại.
2. **Bounded Context Canvas** cho từng service viết TRƯỚC khi code (mục 1.2/1.3 là bản nháp) — canvas gồm: Trách nhiệm, Không phải trách nhiệm của service này, Event Publish, Event Subscribe, Ubiquitous Language (thuật ngữ riêng của domain đó).
3. **Contract Testing**: mỗi cặp publisher/consumer event có 1 bộ test hợp đồng (Pact hoặc tự viết JSON Schema validation test) chạy trong CI — nếu MES đổi cấu trúc event mà chưa tăng version, build phải fail ngay, không để WMS/QMS phát hiện lỗi lúc runtime.
4. **Service Manifest Registry**: gom toàn bộ `service.manifest.yaml` của mọi service vào 1 chỗ (script quét thư mục), sinh ra 1 sơ đồ tổng thể ai-publish-ai-subscribe tự động — tránh phải nhớ thủ công khi số service tăng lên.
5. **Definition of Ready trước khi xây 1 service mới**: canvas đã viết xong + event contract đã review + đã biết rõ service này sẽ consume những event nào từ cluster nào → mới bắt đầu code.

---

## 8. Việc cần làm ngay (theo đúng thứ tự Phase ở mục 4)

1. Chốt lựa chọn công nghệ Phase 0 (Kafka hay RabbitMQ, Keycloak hay tự viết IAM tối giản cho demo).
2. Dựng Phase 0 — Platform Foundation trước, verify bằng service "hello-world".
3. Sau khi Phase 0 xanh, quay lại áp dụng đúng schema 30+ bảng đã thiết kế trước đó — nhưng giờ đặt nó **bên trong `mes-master-data-service`** theo đúng Service Scaffolding Template ở mục 5, kèm outbox publisher cho các event Release, thay vì coi nó là "MES = 1 service" như bản phác thảo cũ.

Tôi có thể viết tiếp **English prompt cập nhật cho `mes-master-data-service`** (đặt đúng trong bối cảnh cluster/microservices lần này, kèm outbox + service manifest + Dockerfile) làm bước triển khai cụ thể đầu tiên của Phase 1, nếu bạn muốn tiếp tục theo lộ trình này.