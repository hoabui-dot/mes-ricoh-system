# AI Document for Codex — ND Station Agent System

## 1. Mục tiêu của document

Tài liệu này dùng để hướng dẫn Codex / AI coding agent hiểu đúng hệ thống, cấu trúc source code, cách tổ chức folder, cách triển khai service, và các best practice cần tuân thủ khi code bằng .NET.

Hệ thống là một **Station Agent** chạy tại edge trong nhà máy, nhận job từ **ND Factory Gateway** qua MQTT/mTLS, thực thi các job liên quan đến **in / marking / vision / PLC**, lưu lịch sử cục bộ bằng SQLite, cache / idempotency bằng Redis, và có UI Kiosk realtime cho công nhân thao tác.

---

## 2. Tóm tắt hệ thống đã thống nhất trong conversation

### 2.1 Kiến trúc tổng quan

Hệ thống theo mô hình:

* **Database per service**
* **7 services trong cùng 1 source repo**
* **MQTT/mTLS** để kết nối với ND Factory Gateway
* **SQLite** là source of truth tại edge
* **Redis** dùng cho cache, idempotency, distributed lock, heartbeat, realtime state
* **Outbox pattern** cho event publish an toàn
* **RBAC** cho Kiosk UI
* **Manual overwrite / reprint / relaser / reprocess** phải audit đầy đủ
* **Vision + PLC** để kiểm tra lỗi và reject sản phẩm

### 2.2 7 services

1. **MQTT Adapter Service**

   * Nhận / gửi message MQTT
   * Lưu inbox / outbox message
   * Chịu trách nhiệm message transport layer

2. **Job Engine Service**

   * Core orchestration
   * Quản lý lifecycle job
   * Retry / overwrite / history / state transitions

3. **Printer Adapter Service**

   * Điều khiển máy in công nghiệp
   * Zebra / Honeywell / TSPL / ZPL / TCP 9100
   * Health check printer, failover printer pool

4. **Laser Adapter Service**

   * Điều khiển máy khắc laser
   * Call SDK / TCP / REST tùy hãng
   * Quản lý laser job, laser events

5. **Vision Service**

   * Camera / OCR / barcode verification
   * Lưu kết quả inspection
   * Trả PASS / FAIL / defect code

6. **PLC Adapter Service**

   * Giao tiếp PLC bằng Modbus TCP / OPC-UA / protocol công nghiệp khác
   * Trigger reject robot / conveyor / sensor

7. **Kiosk UI Service**

   * UI realtime cho công nhân
   * Access control / authorization / sessions / audit logs
   * Manual overwrite actions

---

## 3. Các nguyên tắc kiến trúc đã chốt

### 3.1 Database per service

Mỗi service có database riêng. Không có foreign key vật lý xuyên service.

Cross-service reference chỉ là logical reference bằng `job_id`, `attempt_id`, `user_id`, `device_id` và ghi chú bằng `note`.

### 3.2 Không ghép mọi logic vào 1 monolith quá lớn

Mặc dù là một source repo, code bên trong phải tách theo service rõ ràng để:

* dễ hiểu
* dễ build
* dễ test
* dễ thay thế protocol / device vendor
* tránh coupling cao

### 3.3 Station Agent chạy tại edge

Edge IPC phải có khả năng:

* chạy offline
* queue job cục bộ
* sync lại khi có mạng
* không mất job
* không tạo tem trùng

### 3.4 Job lifecycle phải audit được

Mọi hành động phải lưu:

* ai thao tác
* lúc nào
* làm gì
* kết quả gì
* job attempt nào
* step nào fail
* vì sao overwrite

---

## 4. Tech stack đề xuất cho toàn hệ thống

### 4.1 Ngôn ngữ / runtime

* **.NET 9** cho backend services
* **ASP.NET Core** cho API / background worker / SignalR
* **C#** là ngôn ngữ chính

### 4.2 UI

* **React + Vite** cho Kiosk UI
* Có thể dùng TypeScript nếu cần typing tốt hơn

### 4.3 Database

* **SQLite** cho từng service tại edge
* Migration bằng EF Core hoặc tool tương đương

### 4.4 Cache / idempotency / lock

* **Redis**

### 4.5 Messaging

* **MQTT** qua ND Factory Gateway
* Thư viện .NET nên dùng MQTTnet hoặc tương đương

### 4.6 Realtime UI

* **SignalR** để đẩy trạng thái job / printer / laser / PLC / vision lên kiosk

### 4.7 Container / deployment

* **Docker**
* **Docker Compose** cho local/dev/demo kit
* Mỗi service có Dockerfile riêng

---

## 5. Cấu trúc repository đề xuất

Dưới đây là cấu trúc repo khuyến nghị cho Codex.

```text
station-agent/
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── global.json
├── Directory.Build.props
├── Directory.Packages.props
├── docs/
│   ├── architecture/
│   │   ├── system-overview.md
│   │   ├── service-contracts.md
│   │   ├── database-dictionary.md
│   │   ├── sequence-flow.md
│   │   └── adr/
│   │       ├── 0001-database-per-service.md
│   │       ├── 0002-offline-first.md
│   │       └── 0003-outbox-pattern.md
│   ├── coding-guidelines/
│   │   ├── dotnet-clean-code.md
│   │   ├── folder-guidelines.md
│   │   └── testing-guidelines.md
│   └── runbooks/
│       ├── local-dev.md
│       ├── demo-kit.md
│       └── troubleshooting.md
├── shared/
│   ├── ND.SharedKernel/
│   │   ├── ND.SharedKernel.csproj
│   │   ├── README.md
│   │   ├── Abstractions/
│   │   ├── Domain/
│   │   ├── Exceptions/
│   │   ├── Primitives/
│   │   └── Serialization/
│   ├── ND.Contracts/
│   │   ├── ND.Contracts.csproj
│   │   ├── README.md
│   │   ├── Mqtt/
│   │   ├── Jobs/
│   │   ├── Devices/
│   │   └── Auth/
│   ├── ND.Infrastructure/
│   │   ├── ND.Infrastructure.csproj
│   │   ├── README.md
│   │   ├── SQLite/
│   │   ├── Redis/
│   │   ├── Messaging/
│   │   └── Observability/
│   └── ND.Testing/
│       ├── ND.Testing.csproj
│       ├── README.md
│       └── Fixtures/
├── services/
│   ├── mqtt-adapter/
│   ├── job-engine/
│   ├── printer-adapter/
│   ├── laser-adapter/
│   ├── vision-service/
│   ├── plc-adapter/
│   └── kiosk-ui/
└── deploy/
    ├── docker/
    ├── compose/
    └── nginx/
```

---

## 6. Chi tiết nội dung từng folder / file chính

### 6.1 Root files

#### `README.md`

Nội dung:

* giới thiệu hệ thống
* kiến trúc tổng quan
* cách chạy local
* cách chạy compose
* links tới docs quan trọng
* danh sách services

#### `docker-compose.yml`

Chứa tất cả container cần thiết cho local/dev/demo:

* mqtt-adapter
* job-engine
* printer-adapter
* laser-adapter
* vision-service
* plc-adapter
* kiosk-ui
* redis
* từng SQLite file mount volume

#### `.env.example`

Mẫu biến môi trường:

* MQTT broker URL
* Station ID
* Edge site / line / area
* Redis connection string
* SQLite paths
* printer IP / port
* laser endpoints
* PLC endpoints
* auth secrets

#### `global.json`

Cố định version .NET SDK.

#### `Directory.Build.props`

Chứa rule chung của .NET:

* warnings as errors
* nullable enable
* implicit usings
* LangVersion
* analyzers

#### `Directory.Packages.props`

Quản lý package version tập trung.

---

## 7. Cấu trúc chuẩn của từng service .NET

Mỗi service nên theo dạng Clean Architecture tối giản.

Ví dụ:

```text
services/job-engine/
├── README.md
├── src/
│   ├── ND.JobEngine.Api/
│   ├── ND.JobEngine.Application/
│   ├── ND.JobEngine.Domain/
│   └── ND.JobEngine.Infrastructure/
├── tests/
│   ├── ND.JobEngine.UnitTests/
│   └── ND.JobEngine.IntegrationTests/
└── docker/
    └── Dockerfile
```

### Quy ước

* `Api` hoặc `Worker` chứa entrypoint
* `Application` chứa use case, command/query, DTO, interfaces
* `Domain` chứa entity, value object, domain service, rule
* `Infrastructure` chứa EF Core, SQLite, Redis, MQTT, file system, device adapter implementation

Nếu service quá nhỏ, có thể gộp `Api + Worker` theo dạng worker service.

---

## 8. Nội dung và vai trò của từng service

### 8.1 MQTT Adapter Service

#### Trách nhiệm

* nhận lệnh MQTT từ ND Factory Gateway
* validate payload
* deduplicate bằng idempotency key
* ghi `mqtt_messages`
* tạo outbox event nếu cần publish ngược

#### File gợi ý

```text
services/mqtt-adapter/
├── README.md
├── src/
│   ├── ND.MqttAdapter.Worker/
│   ├── ND.MqttAdapter.Application/
│   ├── ND.MqttAdapter.Domain/
│   └── ND.MqttAdapter.Infrastructure/
└── tests/
```

### 8.2 Job Engine Service

#### Trách nhiệm

* orchestrate job lifecycle
* tạo job / attempt / steps / history / overwrite request
* quản lý state machine
* điều phối job qua Printer / Laser / Vision / PLC

### 8.3 Printer Adapter Service

#### Trách nhiệm

* quản lý printer registry
* render label template ra ZPL/TSPL/EPL
* gửi lệnh qua TCP socket / SDK
* health check printer
* failover printer group

### 8.4 Laser Adapter Service

#### Trách nhiệm

* quản lý laser registry
* call SDK / TCP / REST
* render marking template
* lưu job / events

### 8.5 Vision Service

#### Trách nhiệm

* chụp ảnh / đọc barcode / OCR
* trả PASS / FAIL
* lưu kết quả inspection
* gắn defect code

### 8.6 PLC Adapter Service

#### Trách nhiệm

* đọc / ghi PLC register / coil
* trigger robot reject
* publish PLC events
* health check PLC

### 8.7 Kiosk UI Service

#### Trách nhiệm

* realtime dashboard
* job search / job history
* manual overwrite / reprint / relaser / force complete
* user management
* RBAC
* session management
* audit log

---

## 9. File layout chi tiết cho từng service

### 9.1 Common pattern

Mỗi service nên có cấu trúc tương tự:

```text
src/ND.<ServiceName>.Api/
├── Program.cs
├── appsettings.json
├── appsettings.Development.json
├── Endpoints/
├── Middleware/
├── Extensions/
├── Contracts/
└── README.md
```

### 9.2 Application layer

```text
src/ND.<ServiceName>.Application/
├── Commands/
├── Queries/
├── Dtos/
├── Interfaces/
├── Validators/
├── Behaviors/
└── Services/
```

### 9.3 Domain layer

```text
src/ND.<ServiceName>.Domain/
├── Entities/
├── ValueObjects/
├── Events/
├── Enums/
├── Rules/
└── Exceptions/
```

### 9.4 Infrastructure layer

```text
src/ND.<ServiceName>.Infrastructure/
├── Persistence/
├── Repositories/
├── Migrations/
├── Redis/
├── Messaging/
├── DeviceAdapters/
├── Options/
└── DependencyInjection/
```

---

## 10. Best practice cho .NET codebase

### 10.1 Clean Code rules

* Tên class phải rõ ràng, không viết tắt mơ hồ
* 1 class = 1 trách nhiệm
* Tránh logic dài trong controller / endpoint
* Không để business logic trong infrastructure
* Không hardcode protocol / IP / port / template trong code
* Tất cả side effect phải đi qua abstraction

### 10.2 Naming conventions

* Class: `PascalCase`
* Method: `PascalCase`
* Interface: `I` prefix, ví dụ `IPrinterAdapter`
* Private field: `_camelCase`
* Local variable: `camelCase`
* Constant: `PascalCase` hoặc `UPPER_CASE` theo team rule thống nhất

### 10.3 Async rule

* Dùng `async/await` cho I/O
* Method async phải suffix `Async`
* Không block bằng `.Result` hoặc `.Wait()`
* Không swallow exception

### 10.4 Dependency Injection

* inject qua constructor
* không new service trong business code
* không lấy service bằng static global

### 10.5 Error handling

* dùng custom exception có ngữ nghĩa rõ
* map lỗi nghiệp vụ sang result type rõ ràng
* log đầy đủ correlation id / job id / station id

### 10.6 Logging

* dùng structured logging
* log theo event, không log text rời rạc
* luôn có correlation id
* log chỗ vào / ra của job important

### 10.7 Validation

* validate ở Application layer
* không để input bẩn xuống Domain
* dùng FluentValidation nếu phù hợp

### 10.8 Testing

* Unit test cho domain rules
* Integration test cho SQLite / MQTT / Redis / device adapter mock
* Test idempotency và retry carefully

### 10.9 .NET folder rule

* `Domain` không phụ thuộc `Infrastructure`
* `Application` phụ thuộc `Domain`
* `Infrastructure` phụ thuộc `Application` và `Domain`
* `Api` chỉ là composition root

---

## 11. Quy ước cho folder common utils trong .NET

Đây là phần quan trọng vì team xuất thân từ NodeJS thường dễ đặt `utils` quá sớm hoặc quá rộng.

### 11.1 Không tạo `utils` chung mơ hồ

Không nên có:

```text
Utils/
Helpers/
Common/
Shared/
```

nếu không có mục đích rõ ràng.

### 11.2 Nên chia theo trách nhiệm

Thay vì `utils`, dùng:

* `Primitives/`
* `Abstractions/`
* `Serialization/`
* `Extensions/`
* `Options/`
* `Exceptions/`
* `Factories/`
* `Mapping/`
* `Time/`
* `GuardClauses/`

### 11.3 Mỗi folder common phải có README.md

Ví dụ:

```text
shared/ND.SharedKernel/
├── README.md
├── Abstractions/
│   └── README.md
├── Primitives/
│   └── README.md
├── Serialization/
│   └── README.md
└── Exceptions/
    └── README.md
```

### 11.4 Nội dung README cho folder common

Mỗi README cần ghi:

* folder này dùng để làm gì
* file nào được phép đặt ở đây
* file nào không được phép đặt ở đây
* dependency allowed / forbidden
* ví dụ sử dụng

Ví dụ nội dung `README.md` cho `Abstractions/`:

* chứa interface dùng chung
* không chứa implementation
* không chứa business logic
* chỉ dùng cho contracts kỹ thuật

---

## 12. Gợi ý nội dung README cho từng service

Mỗi service nên có `README.md` riêng với nội dung tối thiểu:

* mục đích service
* input / output chính
* database file tương ứng
* mqtt topics liên quan
* device protocol hỗ trợ
* local run command
* environment variables
* health check endpoint
* common failure cases

Ví dụ:

### `services/printer-adapter/README.md`

* Printer Adapter Service làm gì
* hỗ trợ Zebra / Honeywell / TSPL
* template output là ZPL
* health check chu kỳ bao nhiêu giây
* printer failover strategy

---

## 13. Docker strategy

### 13.1 Một source có 7 service bên trong

Repo là một source duy nhất nhưng deployment có thể chạy nhiều container.

### 13.2 `docker-compose.yml`

Nên include:

* redis
* mqtt-adapter
* job-engine
* printer-adapter
* laser-adapter
* vision-service
* plc-adapter
* kiosk-ui

### 13.3 Mỗi service có Dockerfile riêng

Ví dụ:

```text
services/job-engine/docker/Dockerfile
services/printer-adapter/docker/Dockerfile
services/laser-adapter/docker/Dockerfile
services/vision-service/docker/Dockerfile
services/plc-adapter/docker/Dockerfile
services/mqtt-adapter/docker/Dockerfile
services/kiosk-ui/docker/Dockerfile
```

### 13.4 Best practice Dockerfile cho .NET

* multi-stage build
* restore trước, copy source sau
* publish self-contained nếu cần
* chạy dưới user không phải root nếu phù hợp
* expose đúng port
* dùng image tag cố định

Ví dụ pattern:

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ND.JobEngine.Api.dll"]
```

---

## 14. Database files và cách tổ chức

### 14.1 SQLite per service

Mỗi service có file SQLite riêng hoặc volume riêng.

Ví dụ:

* `data/mqtt.db`
* `data/job_engine.db`
* `data/printer.db`
* `data/laser.db`
* `data/vision.db`
* `data/plc.db`
* `data/kiosk.db`

### 14.2 Không join xuyên service bằng FK vật lý

Cross-service reference chỉ là logical reference.

### 14.3 DB migration

Mỗi service nên có migration riêng.

---

## 15. Redis usage pattern

Redis không phải source of truth.

Redis dùng cho:

* idempotency key
* distributed lock
* session cache
* device heartbeat cache
* active job cache
* realtime dashboard snapshot
* printer busy state
* PLC online state

### Quy ước key

Ví dụ:

```text
idempotency:job:{jobId}
lock:job:{jobId}
printer:status:{printerId}
laser:status:{laserId}
plc:status:{plcId}
session:{token}
dashboard:summary
```

---

## 16. Outbox pattern

Outbox table nên nằm ở service tạo event để publish ra ngoài.

Trong hệ thống này, outbox chính được gắn với **MQTT Adapter Service** hoặc service phát event trung tâm.

Mục tiêu:

* tránh mất event
* đảm bảo publish retry
* đồng bộ state ổn định

---

## 17. Documentation files cần có

### Root docs

* `README.md`
* `docs/architecture/system-overview.md`
* `docs/architecture/service-contracts.md`
* `docs/architecture/database-dictionary.md`
* `docs/architecture/sequence-flow.md`
* `docs/architecture/adr/*.md`
* `docs/coding-guidelines/dotnet-clean-code.md`
* `docs/coding-guidelines/folder-guidelines.md`
* `docs/coding-guidelines/testing-guidelines.md`
* `docs/runbooks/local-dev.md`
* `docs/runbooks/demo-kit.md`
* `docs/runbooks/troubleshooting.md`

### Service docs

Mỗi service nên có:

* `README.md`
* `appsettings.example.json`
* `docker/README.md`
* `tests/README.md`

### Common docs

* `shared/ND.SharedKernel/README.md`
* `shared/ND.Contracts/README.md`
* `shared/ND.Infrastructure/README.md`
* `shared/ND.Testing/README.md`

---

## 18. Guidance cho Codex khi sửa code

Codex phải tuân thủ:

1. Không phá kiến trúc database per service
2. Không tạo FK vật lý xuyên service
3. Không nhét business logic vào controller
4. Không tạo service mới nếu module đủ nhỏ
5. Không thêm package mới nếu package có sẵn đáp ứng được
6. Không viết helper/utils quá rộng
7. Không bỏ qua README của folder common
8. Không bỏ qua idempotency và audit log
9. Không bỏ qua retry / outbox / offline-first
10. Không đổi tên bảng nếu không có lý do rõ ràng

---

## 20. Zebra GK420t (CUPS) Health Check & Status Aggregation Architecture

Hệ thống đã chuyển từ cơ chế kiểm tra kết nối TCP thô sang giải pháp giám sát trạng thái phần cứng chuyên sâu dựa trên giao thức IPP (Internet Printing Protocol) qua HTTP để phản ánh chính xác trạng thái hoạt động thực tế của máy in vật lý Zebra.

### 20.1 Thiết lập kết nối qua Docker Network Tunnel
* Máy in vật lý được cắm qua cổng USB trên máy chủ macOS (host).
* CUPS trên host chạy ở cổng `631` nhưng chỉ lắng nghe các kết nối nội bộ.
* Docker chạy dịch vụ `station-printer-adapter` trong môi trường sandbox riêng.
* Để kết nối, một đường truyền (tunnel) bằng `socat` được thiết lập tại cổng `8631` của container, chuyển tiếp các request tới `host.docker.internal:631` trên macOS host.
* Cấu hình biến môi trường trong `docker-compose`:
  ```yaml
  CUPS_SERVER: 127.0.0.1:8631
  CUPS_HEALTH_HOST: host.docker.internal
  CUPS_HEALTH_PORT: 8631
  ```

### 20.2 Quy trình thu thập dữ liệu đa nguồn (Multi-Source Aggregator)
Lớp Adapter sử dụng `CupsPrinterStateAggregator` kế thừa `ICupsPrinterStateAggregator` để thu thập trạng thái hoạt động:
1. **Primary Source (IPP API):** Gửi một HTTP POST chứa payload binary `Get-Printer-Attributes` (IPP 1.1 - RFC 8011) đến endpoint `http://{CupsHost}:{CupsPort}/printers/{QueueName}`.
2. **Binary Parser:** Phân tích phản hồi nhị phân để trích xuất:
   * `printer-state` (3 = Idle, 4 = Processing, 5 = Stopped)
   * `printer-state-reasons` (ví dụ: `none`, `offline-report`, `media-empty`, `toner-low`, `cover-open`)
   * `queued-job-count` (số lượng job đang xếp hàng)
3. **Fallback Source (TCP Ping):** Nếu cuộc gọi IPP thất bại hoặc timeout (5s), aggregator sẽ thực hiện kết nối TCP socket trực tiếp tới cổng CUPS. Nếu TCP kết nối được, hệ thống coi máy in ở trạng thái hoạt động cơ bản (`Online`). Nếu cả TCP cũng fail, máy in được xác định là `Offline`.

### 20.3 Chu kỳ kiểm tra và Cơ chế Retry chống nhiễu
* **Chu kỳ quét:** `HeartbeatHostedService` thực hiện quét trạng thái thiết bị mỗi **3 giây**.
* **Retry Policy:** Khi gọi driver `GetStatusAsync()`, hệ thống áp dụng cơ chế retry **3 lần với khoảng giãn cách 200ms** giữa các lần thử trước khi đưa ra kết luận thiết bị mất kết nối (Offline). Việc này giúp lọc bỏ nhiễu kết nối tạm thời hoặc khoảng trễ khi CUPS reset cổng USB.

### 20.4 Chuẩn hóa trạng thái máy in (Normalization Mapping)
Trạng thái thô từ CUPS được chuẩn hóa thành `NormalizedPrinterState` và ánh xạ sang enum `PrinterDriverStatus` như sau:

| CUPS State & Reasons | Trạng thái chuẩn hóa | Trạng thái hiển thị Kiosk UI | Màu sắc / Icon tương ứng |
| :--- | :--- | :--- | :--- |
| 3 (Idle) + no bad reasons | `Online` | Sẵn sàng / Chờ | 🟢 Xanh lá (pulsing dot) |
| 4 (Processing) + `job-printing` | `Printing` | Đang in | 🔵 Xanh dương (printer icon) |
| 4 (Processing) | `Busy` | Bận | 🔵 Xanh dương (spinning ring) |
| 5 (Stopped) / queue length > 0 | `Waiting` | Chờ hàng | 🟡 Hổ phách (hourglass) |
| 3 (Idle) + `media-low`/`toner-low` | `Warning` | Cảnh báo | 🟡 Vàng (warning icon) |
| 5 (Stopped) + `offline-report` | `Offline` | Ngoại tuyến | 🔴 Đỏ (X dot) |
| 5 (Stopped) + `media-empty` / lỗi nặng | `Error` | Lỗi phần cứng | 🔴 Đỏ (warning icon) |

### 20.5 Case-Sensitivity & Đường dẫn File trong Git
* Khi đóng gói ứng dụng .NET Core trên nền tảng Docker (Linux - case-sensitive), thư mục chứa DTOs phải nhất quán là `Dtos` (chữ viết thường).
* Tránh xung đột case-sensitivity giữa macOS (case-insensitive) và Docker Linux khi tạo file mới để đảm bảo `dotnet build` và `dotnet publish` trong Dockerfile hoạt động chính xác.

---

## 21. Kết luận

Hệ thống Station Agent là một edge manufacturing platform cho in / khắc / verify / reject / audit / sync. Kiến trúc chuẩn cần bám vào 7 service, database per service, SQLite local, Redis hỗ trợ realtime/idempotency, và .NET codebase phải theo clean architecture tối giản, có dạng multi-source aggregator cho các thiết bị phần cứng thực tế (như máy in vật lý qua CUPS IPP), và được tài liệu hóa rõ ràng để AI agent và lập trình viên dễ dàng bảo trì.
