# Hướng dẫn tạo MES từ dữ liệu trống đến Work Order

Tài liệu này dành cho môi trường MES Console không có master data nghiệp vụ. Thực hiện theo thứ tự để tránh tạo record thiếu quan hệ. Các giá trị mẫu dùng namespace `EMPTY-UAT` để dễ tìm và cleanup.

## 0. Điều kiện hệ thống

Trước khi tạo dữ liệu nghiệp vụ, platform phải có migration, user/role, quyền MES và các seed nền tảng:

- Site nền tảng: `SITE-KZ3`.
- UOM: `PCS`.
- User test: `plant.manager` với quyền Master Data và Work Order.
- Ngày test: chọn một ngày tương lai có lịch, ví dụ `10/08/2026`.

Không tạo Work Order khi các service `mes-master-data-service` hoặc `mes-execution-service` chưa healthy.

## 1. Site và cấu trúc nhà máy

Nếu database thật sự trống, tạo theo thứ tự:

| Form | Giá trị gợi ý |
|---|---|
| `master-data/sites/new` | Code `EMPTY-UAT-SITE`, Tên `Nhà máy UAT trống`, trạng thái Released |
| Production Area | Code `EMPTY-UAT-AREA`, Tên `Khu vực UAT`, thuộc Site trên |
| Shopfloor/Xưởng | Code `EMPTY-UAT-SHOP`, Tên `Xưởng UAT`, thuộc Site/Area đúng cấu trúc |

Kiểm tra Site, Area và Shopfloor không bị chọn chéo. Work Center, Workstation, Employee và Production Line phải cùng Site.

## 2. UOM và nhóm vật tư

1. Mở `master-data/uoms/new`.
2. Tạo UOM:
   - Tên: `Piece`
   - Mã UOM: để hệ thống tự sinh hoặc dùng preview theo UI.
   - Decimal precision: `0`.
   - Cho phép số lẻ: `Không`.
3. Mở form Material Group và tạo:
   - Tên đa ngôn ngữ: `UAT Finished Goods`.
   - Mã nhóm vật tư: để hệ thống tự sinh.

## 3. Tạo Item và Item Revision

Tạo Item thành phẩm trước, sau đó tạo Revision:

| Field | Giá trị mẫu |
|---|---|
| Item code | `EMPTY-UAT-FG-001` |
| Item name | `Sản phẩm UAT hoàn chỉnh` |
| Item type | `Finished Good` |
| Material group | `UAT Finished Goods` |
| Revision code | `1` |
| Lifecycle | `Released` |
| Base UOM | `PCS` |
| Planning strategy | `Make To Order` |
| Procurement type | `In House` |

Nếu MBOM có nguyên vật liệu, tạo thêm Item/Revision nguyên vật liệu với `Item type = Raw Material`, ví dụ `EMPTY-UAT-RM-001` / Revision `1`.

## 4. Tạo Operation Catalog

Tạo từng công đoạn độc lập tại `master-data/operations/new`:

| Code | Tên | Cycle time | Setup | Required persons |
|---|---|---:|---:|---:|
| `EMPTY-UAT-OP-001` | Chuẩn bị nguyên liệu | 60 sec | 5 min | 1 |
| `EMPTY-UAT-OP-002` | Gia công chính | 120 sec | 10 min | 1 |
| `EMPTY-UAT-OP-003` | Kiểm tra chất lượng | 90 sec | 5 min | 1 |

Mỗi Operation cần Released, schedulable và có default skill requirement phù hợp. Đây là skill mặc định của Operation; requirement cụ thể theo Routing sẽ được xác nhận lại khi thêm operation vào Routing.

## 5. Tạo Skill và Worker

Tạo skill trước:

- Code: `EMPTY-UAT-SK-OPERATOR`
- Tên: `Công nhân vận hành UAT`
- Scope: `Employee`
- Minimum level: `L1`
- Lifecycle: `Released`

Tạo Work Center trước Worker vì Worker được gắn trực tiếp vào Work Center. Sau đó tạo worker tại `master-data/employees/new`:

| Worker code | Tên | Work Center |
|---|---|---|
| `EMPTY-UAT-EMP-001` | Nguyễn Văn A | `EMPTY-UAT-WC-001` |
| `EMPTY-UAT-EMP-002` | Trần Văn B | `EMPTY-UAT-WC-002` |

Vào `master-data/skills/workers` và gán `EMPTY-UAT-SK-OPERATOR`, level `L2`, qualification `Active` cho cả hai worker. Worker phải có status `Active`.

## 6. Tạo ca và lịch làm việc cho Work Center

Ca là bộ thời gian dùng lại; lịch nhân sự mới là record theo từng worker, Work Center và ngày cụ thể.

1. Tạo shift set cho từng Work Center tại `master-data/shifts/new`:
   - Work Center: `EMPTY-UAT-WC-001`
   - Tên bộ ca: `Ca UAT Work Center 001`
   - Ca 1: `08:00 - 16:00`
   - Mã bộ ca: view-only, hệ thống tự sinh.
2. Lặp lại cho `EMPTY-UAT-WC-002`.
3. Vào `master-data/work-calendar` và phân ca:
   - Work Center: chọn đúng Work Center trong form phân ca.
   - Ngày bắt đầu: `10/08/2026`.
   - Ngày kết thúc: `10/08/2026`.
   - Ngày trong tuần: `Thứ Hai`.
   - Worker 001/002: chọn ca `08:00 - 16:00`.

Không phân lịch vào quá khứ. Không tạo hai ca overlap trong cùng Work Center. Nếu một worker không có skill, không Active hoặc không có schedule đúng ngày, labor readiness sẽ fail.

## 7. Tạo Machine vật lý và Downtime nếu cần

Tạo machine group tại `master-data/machines/new`:

| Field | Giá trị |
|---|---|
| Tên máy | `Máy ép UAT 500T` |
| Loại máy | `Press` |
| Số lượng physical machine | `2` |
| Serial 1 | `EMPTY-UAT-PRESS-SN-001` |
| Serial 2 | `EMPTY-UAT-PRESS-SN-002` |
| Trạng thái | `Available` |

Mỗi physical machine phải có serial unique, `Identified`, active và planning-resource enabled.

Nếu cần test downtime, vào `master-data/resource-calendars/new`:

- Resource type: `Machine`.
- Resource: chọn đúng serial machine.
- Bắt đầu downtime: `12:00 10/08/2026`.
- Kết thúc downtime: `14:00 10/08/2026`.
- Lý do: `Bảo trì định kỳ UAT`.

Không tạo downtime overlap trên cùng serial. Nếu test WO thành công, không tạo downtime trong khung giờ WO; nếu test hold/fallback, có thể dùng downtime để làm resource không sẵn sàng.

## 8. Tạo Work Center

Tạo tại `master-data/work-centers/new`:

- Code: `EMPTY-UAT-WC-001`.
- Tên: `Work Center UAT 001`.
- Site/Area/Shopfloor: chọn đúng quan hệ đã tạo.
- Resource type: `Machine`.
- Capacity model: `Time Based`.
- Finite capacity: `Có`.
- Max concurrent jobs: `1`.

Tạo Work Center thứ hai `EMPTY-UAT-WC-002` nếu cần backup line. Kiểm tra shift set, worker và machine đều thuộc đúng Work Center.

## 9. Tạo Workstation và gắn Machine

Tạo tại `master-data/workstations/new`:

- Code: để hệ thống sinh.
- Tên: `Workstation UAT 001`.
- Work Center: `EMPTY-UAT-WC-001`.
- Workstation type: `Production`.
- Execution mode: `Manual` hoặc `Kiosk` theo môi trường.
- Machine requirement: `Có`.

Trong bảng **Yêu cầu máy vật lý**, chọn từng serial machine cần gắn. Không chọn machine group chung thay cho serial. Một Workstation có thể chứa nhiều serial thuộc nhiều Equipment khác nhau. Lặp lại cho Workstation/Work Center backup.

## 10. Kiểm tra resource readiness

Trước khi tạo Production Line, cần có đủ:

- Work Center active/released.
- Workstation active/released.
- Machine serial available/identified.
- Resource assignment hợp lệ trong Workstation.
- Resource capability cho từng Operation và Work Center.
- Production standard có setup/cycle/base quantity/yield/efficiency.
- Resource calendar khả dụng trong ngày test.
- Worker active, skill Active và employee schedule đúng Work Center/ngày/ca.

Nếu một mục thiếu, không chuyển sang Production Version; hãy sửa master data trước.

## 11. Tạo Routing độc lập

Tại `master-data/routings/new`, Routing không chọn Item Revision:

| Field | Giá trị |
|---|---|
| Routing name | `Routing UAT sản phẩm 001` |
| Routing type | `Standard` |
| Version | `1` |
| Effective from | `10/08/2026` |
| Effective to | để trống |
| Purpose | `Sản xuất` |

Thêm ba operation theo thứ tự `10`, `20`, `30`. Khi chọn operation, mở phần **Định mức sản xuất**, nhập cycle/setup/labor/standard và chọn Work Center/Workstation phù hợp. Không cần chọn công đoạn trước; thứ tự sequence là nguồn xác định flow.

## 12. Tạo MBOM một transaction

Tại `master-data/mboms/new`:

- Output Item: `EMPTY-UAT-FG-001`.
- Nếu chỉ muốn test form tối thiểu, thêm một component `EMPTY-UAT-RM-001`, quantity `1 PCS`.
- Map issue operation vào operation `10`.
- Save một lần; header và lines phải cùng thành công hoặc cùng rollback.

MBOM không có factory field. MBOM chỉ có một version và structure được validate ngay khi save.

## 13. Tạo Production Version

Tại `master-data/production-versions/new`:

- Item: `EMPTY-UAT-FG-001`.
- Revision: `1`.
- MBOM: `EMPTY-UAT-MBOM-...`.
- Routing: `EMPTY-UAT-ROUTING-...`.
- Site: chọn site của Item Revision.
- Min lot: `1`.
- Max lot: `1000`.
- Lifecycle: tạo Released theo quyền hệ thống.

Sau khi save, dùng validation/readiness preview. Production Version chỉ hợp lệ khi MBOM, Routing, line eligibility và resource/labor readiness không có ERROR.

## 14. Tạo Production Line và gán hai line

Tại `master-data/production-lines/new`, tạo aggregate một lần:

- Tên: `Primary Line UAT`.
- Site/Area/Shopfloor: cùng cấu trúc với Work Center.
- Line type: chọn option `Production`.
- Workstations: chọn `Workstation UAT 001` và các workstation thuộc line.

Tạo line thứ hai `Backup Line UAT` với Workstation 002. Sau đó tại Production Version, gán hai line:

- Primary: `Primary Line UAT`, priority `1`.
- Backup: `Backup Line UAT`, priority `2`.
- Selection mode: `Auto Primary Then Backup`.

## 15. Chạy Work Order

1. Mở `work-orders/new`.
2. Chọn ngày `10/08/2026`.
3. Chọn Production Version vừa Released.
4. Nhập quantity `1` hoặc `2`, không để trống.
5. Submit.
6. Pipeline phải qua request validation, master-data readiness, transaction và outbox.
7. Kiểm tra WO detail: selected line, worker assignment, operation resources và readiness.

Để test fallback, làm Primary không ready bằng downtime/capability có kiểm soát, rồi tạo WO và xác nhận Backup được chọn. Để test cả hai line hold, làm cùng một blocker trên cả hai line; WO phải vào `RESOURCE_HOLD`, không được chọn line sai.

## 16. Checklist kết quả

- Không có route/field bắt buộc bị ẩn hoặc raw UUID trong form.
- Không có worker shortage khi dữ liệu đã đủ.
- Không có `WORK_ORDER_SHIFT_NOT_RESOLVED` khi target date có shift/resource calendar.
- Không có `LINE_RESOURCE_CALENDAR_MISSING` cho line hợp lệ.
- WO snapshot giữ nguyên Production Version, MBOM, Routing và selected line.
- Cleanup test không còn Work Order hoặc orphan resource allocation.

## 17. Seed nhanh cho UAT hai line

Nếu mục tiêu là test nhanh thay vì tạo thủ công từ database trống:

```bash
npm run reset:seed:mes:wo-line-scenarios
```

Lệnh này tạo sẵn hai line, resource, worker, skill, employee schedule và ba Production Version UAT. Dùng tài liệu `MES-WO-THREE-LINE-SELECTION-CONSOLE-SCENARIOS-VI.md` để chọn đúng ba PV.
