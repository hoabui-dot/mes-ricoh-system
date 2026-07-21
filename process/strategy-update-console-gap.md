# CHIẾN LƯỢC CẬP NHẬT — Bổ sung "Console UI" là hạng mục bắt buộc cho mọi Cluster
**Vai trò tài liệu:** Bản vá (addendum) cho `stragegy.md` gốc, áp dụng từ Phase 1 Step 6 trở đi. Không
thay thế tài liệu gốc — chỉ bổ sung 1 hạng mục bị thiếu trong mental model ban đầu và sửa lại lộ trình
Phase 1/2/3 cho đúng.
**Lý do viết bản cập nhật này:** rà soát toàn bộ prompt đã build cho Cluster MES phát hiện: có
Kiosk Operator UI (Step 5, cho công nhân) và Unified Portal (Phase 0, chỉ là launcher), nhưng **không
có UI nào cho planner/kỹ sư công nghệ/quản lý** để thao tác Master Data và duyệt WO — dù
`TECH-STACK-DECISION.md` §5 đã đặt tên sẵn ("MES Console") và chọn sẵn stack (Remix) từ trước, và
prompt Step 5 §1 đã tự flag đây là "not-yet-scheduled deliverable". Đây là kiểu thiếu sót đúng loại mà
tài liệu chiến lược gốc mục 7 (Anti-Drift Governance) được viết ra để ngăn — nhưng lần này nó không nằm
ở tầng service/event, mà ở tầng **loại hạng mục bị bỏ sót khỏi mental model ban đầu**: mục 0 của tài
liệu gốc coi mỗi Cluster là "1 platform microservices con hoàn chỉnh", nhưng không nói rõ hoàn chỉnh
phải bao gồm cả UI vận hành cho người dùng văn phòng, chỉ ngầm định qua Unified Portal + Kiosk.

---

## 1. Sửa lại Mental Model — mỗi Cluster có tối thiểu 2 lớp UI, không phải 1

Mục 0 tài liệu gốc chỉ vẽ Cluster như 1 khối chứa nhiều service + nhiều DB. Cập nhật: mỗi Cluster có
nghiệp vụ đủ lớn (MES, và sau này WMS) thực tế cần **2 lớp giao diện khác nhau, không dùng chung 1 app**:

| Lớp UI | Đối tượng dùng | Đặc điểm | Ví dụ đã/sẽ build |
|---|---|---|---|
| **Edge/Kiosk UI** | Người vận hành tại hiện trường (công nhân, thủ kho) | Thiết bị dùng chung, mạng chập chờn, thao tác nhanh theo 1 tác vụ/1 lúc, pessimistic confirmation bắt buộc vì có hệ quả vật lý | `kiosk-operator-ui` (MES, Step 5) |
| **Console UI** | Người quản lý/lập kế hoạch (planner, kỹ sư công nghệ, quản lý) | Desktop, mạng ổn định, CRUD nhiều entity, nested routing, duyệt/approval | `mes-console` (MES, Step 6 — **mới bổ sung**) |

Nguyên tắc bổ sung vào mục 0: **1 Cluster nghiệp vụ đầy đủ = nhiều service + Edge UI (nếu có hiện
trường) + Console UI (luôn có, vì luôn có người cần quản trị dữ liệu/duyệt).** Không được coi Cluster
là "xong Phase" nếu chỉ có API mà chưa có Console — API-only không phải Definition of Done hợp lệ cho
1 Cluster nghiệp vụ, dù mọi service đứng sau nó đã pass hết integration test riêng của mình.

---

## 2. Sửa lộ trình Phase (mục 4 tài liệu gốc)

### Phase 1 — Cluster MES (cập nhật thứ tự, chèn bước cuối)
1. `mes-master-data-service`
2. `mes-traceability-service`
3. `mes-execution-service` (Stage A)
4. `mes-execution-service` (Stage B)
5. `mes-kiosk-gateway-service` + Kiosk Operator UI
6. **`mes-console` — MỚI.** Master Data Admin (Item/ItemRevision/MBOM/Routing/ProductionVersion CRUD +
   Release) và WO Planning/Approval UI (List/Create/Detail/Compute&Check/Approve/Reject), dùng Remix +
   shadcn/ui, tái dùng nguyên khối 3-layer error handling đã proven ở Kiosk UI. Đây là bước **đóng
   Phase 1**, không phải bước phụ.

**Definition of Done Phase 1 (sửa lại):** ngoài luồng nghiệp vụ MES MVP chạy end-to-end qua các service
tách biệt (đã đạt), bổ sung điều kiện: **1 planner thật (role `PLANT_MANAGER`) có thể tạo Item → Release
MBOM/Routing → tạo WO → duyệt WO hoàn toàn qua UI, không cần gọi API bằng tay.** Nếu điều kiện này chưa
đạt, Phase 1 chưa được đánh dấu Completed dù mọi service phía sau đã xanh.

### Phase 2 — Cluster WMS (cập nhật để không lặp lại lỗi tương tự)
Lộ trình gốc chỉ liệt kê `wms-master-data-service` → `wms-inventory/inbound/outbound-service`, không có
dòng UI riêng — đúng lỗ hổng mental model đã sửa ở mục 1. Cập nhật lộ trình:
1. `wms-master-data-service`
2. `wms-inventory-service`, `wms-inbound-service`, `wms-outbound-service`
3. **`wms-console` — bổ sung tường minh ngay từ bây giờ**, không đợi tới lúc rà soát lại như MES. Tái
   dùng đúng pattern Remix/shadcn/3-layer error handling đã chốt ở `mes-console` — đây chính là lý do
   Console được build riêng cho MES trước: để WMS/QMS Console chỉ còn là lặp lại pattern, không phải
   thiết kế lại.
4. Nếu WMS có nhu cầu Edge UI riêng (ví dụ thiết bị cầm tay quét khi picking) — đánh giá ở đầu Phase 2,
   không để tới cuối mới phát hiện thiếu như đã xảy ra với MES Console.

### Phase 3 — Cluster QMS (cập nhật tương tự, gộp gọn hơn vì quy mô nhỏ)
1. `qms-inspection-service`, `qms-nonconformance-service`
2. `qms-console` — cùng pattern, gộp chung 1 step vì khối lượng UI nhỏ hơn WMS (chỉ 2 service, ít bảng
   hơn nhiều so với 26 bảng Master Data của MES).

---

## 3. Sửa mục 7 (Anti-Drift Governance) — thêm 1 mục kiểm tra mới

Bổ sung vào Definition of Ready (mục 7.5 tài liệu gốc) — điều kiện thêm trước khi đánh dấu **bất kỳ
Cluster nào** là hoàn thành:

> **Console/UI Readiness Check**: Cluster chỉ được đánh dấu hoàn thành khi có xác nhận tường minh
> (không suy luận) rằng đã có ít nhất 1 UI cho phép người dùng vận hành (không phải qua curl/API) thực
> hiện được toàn bộ luồng nghiệp vụ cốt lõi của Cluster đó — nếu chưa có, phải ghi rõ vào
> `PROJECT_WORKLOAD_PROGRESS.md` là "API-only, Console pending" thay vì đánh dấu ✅ Completed.

Lý do bổ sung: đây chính xác là thứ đã bị bỏ sót ở MES cho tới khi rà soát thủ công — thêm bước kiểm
tra tường minh này vào governance để không phải dựa vào việc "tình cờ nhớ ra" ở các Cluster sau.

---

## 4. Việc cần làm ngay (thay thế mục 8 cho giai đoạn hiện tại)

1. Build `mes-console` theo prompt Phase 1 Step 6 đã viết — đây là điều kiện đóng Phase 1.
2. Sau khi `mes-console` đạt Definition of Done, cập nhật `PROJECT_WORKLOAD_PROGRESS.md` đánh dấu Phase
   1 `Completed ✅` toàn phần (bao gồm cả Console, không chỉ backend/kiosk).
3. Trước khi bắt đầu Phase 2 Step 1 (`wms-master-data-service`), viết Bounded Context Canvas cho
   `wms-console` song song với các service WMS khác — không để Console bị thiết kế sau cùng như đã xảy
   ra với MES.
4. Áp dụng "Console/UI Readiness Check" (mục 3 ở trên) làm điều kiện Definition of Done cho mọi Cluster
   từ nay về sau, bắt đầu từ Phase 2.