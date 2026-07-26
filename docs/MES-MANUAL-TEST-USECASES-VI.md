# Bộ Use Case Kiểm Thử Thủ Công MES

**Sản phẩm:** S-Factory MOM Platform – MES  
**Ngôn ngữ kiểm thử:** Tiếng Việt  
**Phạm vi:** SSO, Master Data, tạo Work Order, kiểm tra sẵn sàng, phê duyệt, phân bổ tài nguyên, thực thi công đoạn và liên kết WMS/QMS  
**Ngày cập nhật:** 2026-07-25

Tài liệu này dùng cho người kiểm thử thủ công, planner, plant manager, operator và QA. Mỗi use case phải được thực hiện trên giao diện người dùng thật, không chỉ kiểm tra bằng API. Khi cần xác nhận side effect, người kiểm thử có thể kiểm tra màn hình liên quan ở WMS/QMS hoặc log/audit sau khi đã ghi nhận kết quả UI.

## 1. Chuẩn bị môi trường

### 1.1 Địa chỉ truy cập

Chạy lệnh sau tại repository để lấy các URL Cloudflare đang sống:

```bash
npm run cloudflare:urls
```

Kết quả cần có các dòng `Portal`, `MES`, `WMS`, `QMS`, `API`, `SSO` với URL `https://...trycloudflare.com`. Không sử dụng hostname cũ đã lưu trong tài liệu hoặc ảnh chụp màn hình. Nếu một dòng là `NONE`, đánh dấu môi trường kiểm thử **BLOCKED**, không kết luận use case thất bại.

Khi kiểm thử nội bộ, có thể dùng:

| Thành phần | Cổng nội bộ |
|---|---:|
| Portal | `13000` |
| MES Console | `13052` |
| WMS Console | `13091` |
| QMS Console | `13130` |
| Kong API | `18000` |
| Keycloak SSO | `18080` |

### 1.2 Tài khoản demo

Chỉ dùng các tài khoản này trong môi trường demo, không dùng cho production:

| Tài khoản | Mật khẩu | Vai trò chính | Dùng cho |
|---|---|---|---|
| `admin` | `Admin@123!` | `EXECUTIVE` | Kiểm tra toàn hệ thống |
| `plant.manager` | `Manager@123!` | `PLANT_MANAGER` | Master Data, Work Order, phê duyệt |
| `operator01` | `Operator@123!` | `OPERATOR` | Thực thi sản xuất/kiosk |
| `qc.tech01` | `Quality@123!` | `QC_TECHNICIAN` | Công đoạn QC và QMS |

### 1.3 Dữ liệu đầu vào cần có

Trước khi chạy luồng chính, xác nhận dữ liệu sau đã tồn tại:

- Item hoặc Item Revision thành phẩm `FG-WS-CM01` ở trạng thái `Released`.
- Production Version mặc định ở trạng thái `Released`.
- MBOM và Routing liên kết cùng Item Revision và Site.
- Routing có các công đoạn: `OP-MIX`, `OP-PREP`, `OP-CUT`, `OP-MOLD`, `OP-TRIM`, `OP-QC`.
- Work Center, Workstation, Machine, Capability, Shift và Work Calendar cùng Site.
- Ít nhất một Employee đang `Active`, có Worker Skill phù hợp nếu resource planning yêu cầu.
- UOM của thành phẩm hiển thị đúng mã và tên, ví dụ `PCS` / `Piece`.
- Nếu kiểm thử material staging: WMS có tồn kho phù hợp cho các material trong MBOM.
- Nếu kiểm thử QC: QMS có Inspection Plan/Result hoặc fixture tương ứng cho Item/Lot.

## 2. Quy ước kết quả

Mỗi bước ghi một trong các trạng thái:

- **PASS:** UI và dữ liệu sau thao tác đúng với kết quả mong đợi.
- **FAIL:** UI crash, sai trạng thái, sai tên/mã, cho phép thao tác trái rule, mất dữ liệu hoặc side effect sai.
- **BLOCKED:** môi trường, SSO, tunnel, database hoặc dữ liệu đầu vào chưa sẵn sàng.
- **WARNING:** thao tác thành công nhưng có vấn đề không chặn luồng, ví dụ cảnh báo layout hoặc bản dịch thiếu.

Không coi việc request trả HTTP 200 là đủ để PASS. Phải kiểm tra nội dung hiển thị, trạng thái nghiệp vụ, thông báo lỗi và dữ liệu ở bước tiếp theo.

## 3. UC-MES-01 – Đăng nhập SSO và vào MES

**Tác nhân:** Plant Manager hoặc Executive  
**Mục tiêu:** Đăng nhập một lần qua Keycloak và mở đúng MES Console.

### Các bước

1. Mở URL Portal lấy từ `npm run cloudflare:urls`.
2. Chọn đăng nhập và quan sát chuyển hướng sang Keycloak realm `wonsealtech`.
3. Đăng nhập bằng `plant.manager`.
4. Quan sát Portal sau khi Keycloak trả về.
5. Chọn **MES** nếu Portal hiển thị application chooser.
6. Mở thêm WMS trong tab mới, không đăng nhập lại nếu Keycloak session còn hiệu lực.

### Kỳ vọng UI

- Trang login là Keycloak, không phải một form login giả lập của từng console.
- Sau đăng nhập, Portal hiển thị đúng các ứng dụng theo realm role.
- Plant Manager thấy MES, WMS và QMS; operator thông thường không tự nhiên được cấp toàn bộ ứng dụng.
- MES mở được mà không gặp `Keycloak instance can only be initialized once`.
- Khi mở console thứ hai, SSO được tái sử dụng hoặc chỉ redirect ngắn, không hỏi lại mật khẩu bất thường.
- Header hiển thị người dùng hiện tại và language toggle; tiếng Việt là mặc định.
- Không có lỗi 401/403 lặp vô hạn, màn hình trắng hoặc redirect loop.

### Kiểm tra lỗi

- Đăng xuất rồi mở trực tiếp URL MES: phải được redirect qua Keycloak và quay lại MES.
- Đăng nhập bằng `operator01`: phải bị giới hạn application theo role, không được xem chức năng quản trị nếu UI/backend yêu cầu quyền manager.

## 4. UC-MES-02 – Chuyển ngôn ngữ và kiểm tra bản dịch tĩnh

**Tác nhân:** Mọi người dùng  
**Mục tiêu:** Đảm bảo ngôn ngữ thay đổi ở client và không làm mất state form.

### Các bước

1. Tại MES, chọn language toggle `VI`, kiểm tra mặc định là tiếng Việt.
2. Chuyển lần lượt sang English, Japanese, Korean.
3. Mở `/master-data/items`, `/master-data/work-centers`, `/master-data/routings`, `/master-data/mboms`, `/master-data/production-versions` và `/work-orders`.
4. Đổi ngôn ngữ khi đang mở form tạo hoặc modal detail.
5. Refresh trang rồi kiểm tra locale đã chọn.

### Kỳ vọng UI

- Header, sidebar, breadcrumbs, tiêu đề, subtitle, button, tab, badge, table header, empty state, error state và tooltip đều được dịch.
- Status không hiện raw enum như `Released`, `Inactive`, `OnLeave` ở nơi UI đã có translation.
- Type và operation name hiển thị tên nghiệp vụ đã dịch; code chỉ là thông tin phụ khi cần.
- Tên localized của Item, Work Center, Operation, MBOM và Routing dùng locale hiện tại, fallback hợp lý nếu thiếu bản dịch.
- Đổi ngôn ngữ không reset dữ liệu người dùng đã nhập trong form.
- Không thấy key dạng `skills.workerTab`, `status.wo.Draft` hoặc text tiếng Anh sót trong giao diện tiếng Việt.
- Không có chữ xám nhạt trên nền sáng gây không đọc được, button action không có nền đen khó phân biệt.

## 5. UC-MES-03 – Kiểm tra Master Data trước khi tạo Work Order

**Tác nhân:** Plant Manager  
**Mục tiêu:** Xác nhận cấu hình sản xuất đủ điều kiện.

### Các bước

1. Vào **Master Data → Items**.
2. Tìm `FG-WS-CM01`, mở detail và kiểm tra Item Name, Item Type, Base UOM, Item Revision và lifecycle status.
3. Vào **Master Data → Production Versions**.
4. Mở Production Version của `FG-WS-CM01`.
5. Kiểm tra Item Revision, Site, MBOM, Routing và trạng thái của từng liên kết.
6. Mở MBOM và Routing tương ứng.
7. Trong Routing detail, kiểm tra flow theo sequence tăng dần và predecessor.
8. Mở Work Center/Workstation/Machine và kiểm tra cùng Site, capability, scheduling mode và active period.

### Kỳ vọng UI

- Business name là display chính; code là display phụ, không lộ UUID.
- Item Revision trong các select hiển thị tên bản dịch, không chỉ UUID hoặc raw database object.
- Production Version detail hiển thị đầy đủ Item, Revision, Site, MBOM và Routing.
- Routing detail hiển thị đúng flow: Mixing → Metal Preparation → Cutting → Molding → Trimming → Quality Inspection.
- Sequence hiển thị theo dữ liệu nghiệp vụ, không tự đổi thành index sai.
- Record chưa Released hoặc hết hiệu lực không được xem là ready.
- Nếu dữ liệu thiếu, UI nêu rõ trường nào thiếu và không cho người dùng hiểu nhầm là đã sẵn sàng.

## 6. UC-MES-04 – Tạo Work Order với cấu hình sản xuất hợp lệ

**Tác nhân:** Planner hoặc Plant Manager  
**Mục tiêu:** Tạo Draft Work Order từ Production Version hợp lệ.

### Các bước

1. Vào **Work Orders → Create Work Order**.
2. Gõ `FG-WS-CM01` trong ô **Product to manufacture**.
3. Chọn một option hợp lệ từ combobox.
4. Nhập quantity, ví dụ `100`.
5. Chọn target date hợp lệ trong thời gian hiệu lực của master data.
6. Kiểm tra Readiness Summary trước khi submit.
7. Bấm **Create Work Order** một lần.
8. Theo dõi modal tiến trình tạo Work Order đến trạng thái thành công.
9. Bấm **Open Work Order**.

### Kỳ vọng UI sau khi chọn Product

Ngay sau khi chọn option:

- Product name hiển thị đúng localized name.
- Readiness Summary không còn `Select a product`.
- Item Revision hiển thị revision code và tên phù hợp.
- Production Version, MBOM và Routing được điền ngay.
- UOM hiển thị đúng tên/mã, ví dụ `PCS`, không phải `undefined`.
- Site được lưu trong state form.
- Required IDs `item_revision_id`, `production_version_id`, `base_uom_id`, `site_id` được giữ trong state gửi backend.
- Nút Create chỉ disabled khi thiếu product, quantity không hợp lệ, target date không hợp lệ hoặc đang submit.

### Kỳ vọng tiến trình tạo

- UI hiển thị trạng thái kết nối workflow: connecting/connected/reconnecting/unavailable.
- Các bước readiness, create header, explode MBOM, snapshot routing và hoàn tất hiển thị theo thứ tự.
- Nếu workflow chạy thành công, hiển thị Work Order code nghiệp vụ, operation count và material count.
- Code Work Order được backend sinh, không cho người dùng nhập code authoritative.
- Bấm nút nhiều lần hoặc refresh trong lúc workflow chạy không tạo duplicate Work Order.
- Error message có nội dung cho người dùng và technical reference, không hiện stack trace hoặc UUID không có ngữ cảnh.

## 7. UC-MES-05 – Compute & Check và xử lý dữ liệu thiếu

**Tác nhân:** Plant Manager  
**Mục tiêu:** Kiểm tra Work Order trước phê duyệt.

### Luồng hợp lệ

1. Mở Work Order vừa tạo.
2. Kiểm tra header code, product, quantity, UOM, target date và status `Draft`.
3. Bấm **Compute & Check**.
4. Chờ kết quả hoàn tất rồi mở các phần Operations, Materials và Readiness.

**Kỳ vọng:**

- Button có loading state, không cho submit trùng.
- Kết quả hiển thị material demand, operation demand, standard time/capacity và cảnh báo nếu có.
- Work Order vẫn giữ đúng code và snapshot sau Compute & Check.
- UI hiển thị lỗi bằng toast/panel có thể đọc được; không crash do response body đã đọc hoặc response shape khác dự kiến.

### Luồng thiếu master data

1. Tạo hoặc chọn một cấu hình thiếu MBOM, Routing, Site, UOM hoặc capability.
2. Thử tạo hoặc Compute & Check.

**Kỳ vọng:**

- Backend trả lỗi nghiệp vụ 4xx/422 phù hợp.
- UI chỉ rõ thiếu cấu hình nào.
- Không tạo Draft một phần, không tạo duplicate, không chuyển trạng thái sang Released.
- Khi quay lại form, dữ liệu người dùng không bị mất ngoài field không hợp lệ.

## 8. UC-MES-06 – Phê duyệt hoặc từ chối Work Order

**Tác nhân:** Plant Manager/Executive  
**Mục tiêu:** Kiểm tra quyền và lifecycle của Work Order.

### Phê duyệt

1. Mở Work Order đang `Draft`.
2. Kiểm tra đã Compute & Check và không còn blocking error.
3. Bấm **Approve**.
4. Xác nhận action nếu dialog xuất hiện.

**Kỳ vọng:**

- Nút Approve chỉ xuất hiện với role phù hợp và status phù hợp.
- Có loading/disable trong lúc request.
- Sau thành công, badge chuyển sang `Approved` hoặc `Released` theo lifecycle thực tế của hệ thống.
- Approval history có actor, thời gian, action và comment.
- Không thể Approve lại một Work Order đã approved/completed.

### Từ chối

1. Mở một Work Order `Draft`.
2. Bấm **Reject**.
3. Để trống comment và submit.
4. Nhập lý do, ví dụ `Thiếu xác nhận nguyên liệu cao su`, rồi submit.

**Kỳ vọng:**

- UI bắt buộc reject reason, không cho từ chối với comment rỗng.
- Khi thành công, status chuyển `Rejected`, history lưu reason.
- Không phát sinh staging hoặc execution cho Work Order bị reject.

## 9. UC-MES-07 – Phân bổ Work Center, Workstation và Machine

**Tác nhân:** Planner/Plant Manager  
**Mục tiêu:** Gán tài nguyên hợp lệ cho từng operation.

### Các bước

1. Mở Work Order đã được release/approved.
2. Mở phần **Resource Planning** của từng operation.
3. Bấm **Recommend resources** hoặc tải candidates.
4. Kiểm tra Work Center, Workstation, Machine/Machine Group, Shift, planned start và capacity.
5. Chọn một candidate và bấm **Select and commit**.
6. Refresh Work Order detail.

### Kỳ vọng UI

- Candidate chỉ thuộc đúng Site/Work Center hierarchy và thời gian hiệu lực.
- Machine inactive, out of service, thiếu quantity hoặc hết capacity không được hiển thị như candidate hợp lệ.
- UI hiển thị tên và code nghiệp vụ, không hiển thị raw UUID.
- Sau commit, operation hiển thị `Allocated`, cùng Work Center/Workstation/Machine đã chọn.
- Có idempotency khi click nhiều lần; không tạo allocation trùng.
- Nếu row version conflict, UI yêu cầu refresh/reload thay vì ghi đè dữ liệu mới.
- Nếu không có candidate, UI hiển thị `No eligible candidates found`, không để panel trống.

## 10. UC-MES-08 – Stage material request sang WMS

**Tác nhân:** Plant Manager/Planner  
**Mục tiêu:** Gửi material demand từ MES sang WMS.

### Các bước

1. Mở Work Order đã `Released` hoặc `InProgress`.
2. Kiểm tra Material Requirements: material, required quantity, UOM, issue mode, phantom/backflush/manual issue.
3. Bấm **Stage materials**.
4. Xác nhận nếu UI yêu cầu.
5. Mở WMS bằng cùng browser session.
6. Vào Outbound/Material Requests và tìm theo Work Order code.

### Kỳ vọng MES UI

- Button Stage materials chỉ xuất hiện ở lifecycle cho phép.
- Có loading state và không gửi duplicate request khi click nhiều lần.
- Thành công hiển thị toast `Material request sent to WMS` và danh sách request/result.
- Nếu thiếu stock, UI hiển thị warning shortage nhưng không báo thành công giả.
- Work Order detail vẫn giữ material requirement và liên kết request bằng business code.

### Kỳ vọng WMS UI

- Request có Work Order code, Work Center, material name/code, required quantity và UOM.
- Không có request duplicate cho cùng Work Order/operation/material do retry.
- Khi WMS fulfill/stage xong, MES có thể refresh để thấy trạng thái handoff tương ứng.

## 11. UC-MES-09 – Operator thực thi happy path

**Tác nhân:** Operator `operator01`  
**Mục tiêu:** Thực hiện Work Order qua routing snapshot.

Luồng thực thi có thể nằm trên MES Kiosk/operator UI thay vì màn hình planner. Không đánh dấu FAIL chỉ vì planner console không có nút Start/Confirm; cần kiểm tra đúng màn hình operator được triển khai.

### Luồng công đoạn

| Thứ tự | Công đoạn | Thao tác chính | Kỳ vọng |
|---:|---|---|---|
| 1 | `OP-MIX` Mixing | Start, scan nguyên liệu, nhập thời gian/nhiệt độ, Finish | Ghi nhận quantity, scan và output/mother label nếu cấu hình yêu cầu |
| 2 | `OP-PREP` Metal Preparation | Scan raw steel, xác nhận quantity | Không yêu cầu output label nếu cấu hình không yêu cầu |
| 3 | `OP-CUT` Cutting | Scan mother QR, xác nhận quantity/finish | Gọi split, sinh child label và lưu traceability reference |
| 4 | `OP-MOLD` Molding | Scan child QR và pallet, nhập thông số cure | Consume child label, issue output label, ghi nhận curing window |
| 5 | `OP-TRIM` Trimming | Nhập good/scrap quantity | Lưu scrap quantity/rate; không yêu cầu material scan |
| 6 | `OP-QC` Quality Inspection | Nhập PASS hoặc FAIL và reason nếu FAIL | PASS issue label; FAIL bắt buộc reason và không issue PASS label |

### Kỳ vọng chung trên UI

- Operator chỉ thấy Work Order được gán/được phép xem.
- Operation bị khóa nếu predecessor chưa hoàn tất.
- Start chuyển operation sang `In Progress`; Finish chuyển sang `Finished`.
- Không cho Finish khi thiếu scan, thiếu quantity, thiếu reason hoặc thiếu dữ liệu bắt buộc.
- Button đang gửi request bị disabled, retry cùng idempotency key không tạo xác nhận/label trùng.
- Hiển thị rõ good quantity, scrap quantity, UOM, operator, thời gian và trạng thái.
- Lỗi từ traceability/WMS có thông báo retryable, không chuyển operation sang Finished giả.
- Sau `OP-QC` PASS, Work Order cuối cùng chuyển `Completed` khi mọi operation đã Finished.

## 12. UC-MES-10 – Kiểm thử nhánh lỗi thực thi

Thực hiện trên một Work Order demo riêng, không phá dữ liệu của happy path.

| Tình huống | Thao tác | Kỳ vọng UI |
|---|---|---|
| Predecessor chưa xong | Start `OP-CUT` khi `OP-PREP` chưa Finished | Bị từ chối, nêu rõ operation trước chưa hoàn tất |
| Thiếu material scan | Finish operation yêu cầu scan nhưng không nhập label | Không đổi sang Finished; field/validation dễ thấy |
| Scrap không có reason | Nhập scrap > 0 nhưng bỏ reason | Không cho submit, hiển thị reason bắt buộc |
| QC FAIL không có reason | Chọn FAIL và submit rỗng | Không gửi kết quả; không phát hành PASS label |
| Sai quantity | Nhập 0, số âm hoặc vượt quantity hợp lệ | Validation client và server cùng chặn |
| Resource inactive | Chọn machine/workstation đã inactive | Không xuất hiện trong candidate hoặc commit bị reject rõ ràng |
| Double click | Bấm Confirm/Approve/Stage hai lần nhanh | Chỉ có một business result; button có loading/disabled |
| Network timeout | Ngắt mạng trong lúc confirm | Hiển thị retryable error; refresh không tạo bản ghi trùng |
| Session abort | Start rồi Abort | Session thành `ABORTED`, không xóa lịch sử và operation không Finished |

## 13. UC-MES-11 – Worker Skills và qualification

**Tác nhân:** Plant Manager  
**Mục tiêu:** Kiểm tra kỹ năng công nhân trong tab Skill Management.

### Các bước

1. Vào **Master Data → Skills**.
2. Chọn tab **Worker Skills**.
3. Kiểm tra các skill có `scope = Employee` hiển thị ở đây.
4. Chọn một skill để xem assignment.
5. Gán skill cho một Employee với level `L1/L2/L3`, qualification status và expiry date.
6. Kết thúc assignment.
7. Refresh và xem lại assignment history.

### Kỳ vọng UI

- Có đủ bốn tab: Machine, Workstation, Work Center, Worker.
- Employee skill không xuất hiện trong ba tab resource.
- Skill name và worker name hiển thị dạng business name; không lộ UUID.
- Assignment mới hiển thị level, qualification status và expiry date.
- Kết thúc assignment không xóa lịch sử; row chuyển trạng thái ended/inactive.
- Skill đang được tham chiếu không thể delete vĩnh viễn; UI đề nghị deactivate.
- Scope Employee không thể bị đổi sau khi skill đã được sử dụng.

## 14. UC-MES-12 – Kiểm thử giao diện và tính an toàn dữ liệu

### Kiểm tra trên mọi trang MES

- Breadcrumb không hiển thị `Không tìm thấy route` ở route hợp lệ.
- Trang lỗi runtime hiển thị error boundary/404 thân thiện thay vì màn hình trắng.
- Modal có thể đóng bằng nút close, không che mất header và không tạo nested modal khó thao tác.
- Table có header dịch, giá trị đủ tương phản ở light mode, pagination và empty state rõ ràng.
- Select/combobox có nền option, trạng thái selected và focus dễ đọc.
- Button action màu safety amber/orange, primary structure deep navy/slate, text đủ tương phản.
- Không có raw `undefined`, `[object Object]`, UUID hoặc key i18n trong business display.
- Refresh trang detail không crash nếu backend trả record cũ hoặc field optional bị thiếu.
- Tên dài, localized text và status không tràn khỏi card/table cell.

### Kiểm tra không mất dữ liệu

- Tạo hoặc sửa localized field chỉ lưu khi Vietnamese bắt buộc đã có giá trị.
- Code Item/Revision/MBOM/Routing/Work Order do backend sinh và không bị client ghi đè.
- Release/Approve/Reject/Deactivate/Delete luôn có validation và confirmation phù hợp.
- Không hard-delete record đã được tham chiếu bởi Work Order, operation, skill assignment hoặc traceability.
- Refresh sau mỗi thao tác phải hiển thị đúng dữ liệu đã lưu từ backend, không chỉ dữ liệu tạm trong React state.

## 15. Mẫu ghi nhận kết quả

| Trường | Nội dung cần ghi |
|---|---|
| Test run ID | Ví dụ `MES-MANUAL-20260725-01` |
| Người kiểm thử | Tên người thực hiện |
| Tài khoản/role | Không ghi mật khẩu |
| URL | URL MES từ `npm run cloudflare:urls` |
| Browser/device | Chrome/Edge, desktop/tablet |
| Locale | VI/EN/JA/KO |
| Use case | Ví dụ `UC-MES-04` |
| Dữ liệu | Item code, WO code, operation code nếu có |
| Kết quả | PASS/FAIL/BLOCKED/WARNING |
| Expected | Kết quả mong đợi của bước |
| Actual | Kết quả thực tế và text UI |
| Evidence | Screenshot, timestamp, workflow reference, không chụp token/mật khẩu |
| Defect | Route, role, request action, error message, severity |

## 16. Tiêu chí kết thúc một lần kiểm thử MES

Một lần kiểm thử được xem là đạt khi:

1. SSO vào đúng console và role không vượt quyền.
2. Master Data liên kết cùng Item Revision/Site và trạng thái Released hợp lệ.
3. Work Order chọn product làm đầy đủ readiness state, UOM và required IDs.
4. Workflow tạo Work Order hoàn tất một lần, không duplicate.
5. Compute & Check, approval/rejection và resource allocation hiển thị đúng lifecycle.
6. Material staging tạo đúng handoff sang WMS khi dùng case tích hợp.
7. Operator execution tôn trọng predecessor, scan, quantity, scrap/reason và idempotency.
8. QC PASS/FAIL phản ánh đúng label/NCR expectation.
9. Các màn hình tiếng Việt không còn text/key/enum tiếng Anh ngoài business code được phép hiển thị.
10. Không có crash React, lỗi CORS, 502/503 không giải thích được hoặc thông báo thành công giả.
