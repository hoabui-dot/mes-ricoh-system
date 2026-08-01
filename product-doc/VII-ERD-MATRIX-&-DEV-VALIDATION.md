# PHẦN VII: MA TRẬN QUAN HỆ VÀ VALIDATION CHO DEV (ERD MATRIX & DEV VALIDATION)

Tài liệu đặc tả các quan hệ bắt buộc giữa các bảng Master Data, danh mục quy tắc kiểm tra (Checklist) khi Release cấu hình sản xuất và các ràng buộc dữ liệu toàn vẹn dành cho đội ngũ phát triển phần mềm (Software Engineers).

---

## 1. MA TRẬN QUAN HỆ CÁC BẢNG MASTER DATA (ERD RELATIONSHIP MATRIX)

| Thực thể nguồn | Thực thể đích | Tỷ lệ quan hệ (Cardinality) | Quy tắc nghiệp vụ & Ràng buộc toàn vẹn |
| :--- | :--- | :---: | :--- |
| `MD_ITEM` | `MD_ITEM_REVISION` | `1 : N` | Lệnh sản xuất (WO) bắt buộc phải tham chiếu trực tiếp đến `ItemRevisionID` cụ thể, không chỉ dùng `ItemID` chung. |
| `MD_ITEM_REVISION` | `MD_MBOM_HEADER` | `Không có quan hệ trực tiếp` | MBOM là master data độc lập. Production Version là nơi liên kết Item Revision, MBOM và Routing. |
| `MD_MBOM_HEADER` | `MD_MBOM_LINE` | `1 : N` (Cây) | Sử dụng trường `ParentLineID` để thiết lập cây định mức đa cấp. Hệ thống bắt buộc phải kiểm tra chống vòng lặp (Cycle Check). |
| `[ItemRevision + MBOM + Routing]` | `MD_PRODUCTION_VERSION` | `N : 1` | `Production Version` là bộ khóa cấu hình chính thức duy nhất được phép sử dụng để phát hành Lệnh sản xuất (WO); ba thực thể được chọn độc lập và phải thỏa các điều kiện hiệu lực/Site được nêu rõ. |
| `MD_ROUTING_HEADER` | `MD_ROUTING_OPERATION` | `1 : N` | Thứ tự thực hiện công đoạn được xác định bởi `SequenceNo` và danh sách phụ thuộc `PredecessorSeq`. |
| `MD_ROUTING_OPERATION` | `MD_WORK_CENTER` | `N : 1` | `Work Center` đóng vai trò là cụm tài nguyên năng lực logic mặc định để gán cho từng bước công đoạn. |
| `Work Center` $\leftrightarrow$ `Workstation` $\leftrightarrow$ `Equipment` | `MD_RESOURCE_ASSIGNMENT` | `N : N` | Mối quan hệ gán giữa cụm máy logic, trạm thực thi và máy vật lý được quản lý qua bảng gán có hiệu lực thời gian (`EffectiveFrom`/`To`). |
| `[Item / Operation]` $\leftrightarrow$ `Resource` | `MD_RESOURCE_CAPABILITY` | `N : N` | Chỉ những tài nguyên có cấu hình `Eligibility = True` trong bảng Capability mới được phép phân bổ chạy WO. |
| `[Item / Operation / Resource]` | `MD_PRODUCTION_STANDARD` | `N : 1` | Định mức thời gian hiệu lực: Hệ thống ưu tiên áp dụng định mức theo `EquipmentID` cụ thể trước, nếu không có mới dùng định mức chung của `WorkCenterID`. |
| `[Item / ItemGroup]` | `MD_TRACEABILITY_POLICY` | `N : 1` | Quy tắc đè: Cấu hình chính sách truy xuất chi tiết cho `ItemID` sẽ ghi đè cấu hình chung của `ItemGroup`. |
| `MD_TRACEABILITY_POLICY` | `[Split Rule / Number Rule / Label Template]` | `1 : N` | Kích hoạt đúng luồng quy tắc tách, quy tắc sinh mã và mẫu tem QR theo đúng SKU và công đoạn được phép. |
| `MD_TERMINAL` | `MD_WORKSTATION` | `N : 1` | Thiết bị hiện trường (`Terminal`) lọc danh sách WO và gửi lệnh in tem trực tiếp tới trạm thực thi (`Workstation`) tương ứng. |
| `UserID` | `MD_USER_RESOURCE_SCOPE` | `1 : N` | Quyền chức năng hành động (`Role Permission`) kết hợp cùng phạm vi phân vùng tài nguyên dữ liệu (`Resource Scope`) để kiểm soát truy cập. |

---

## 2. VALIDATION CHECKLIST KHI RELEASE CẤU HÌNH SẢN XUẤT

Trước khi chuyển trạng thái một cấu hình sản xuất (`Production Version` / `MBOM` / `Routing`) sang `Status = Released` để cho phép tạo Lệnh sản xuất (WO), hệ thống backend phải thực thi kiểm tra danh mục 10 điều kiện bắt buộc dưới đây. **Nếu vi phạm bất kỳ điều kiện nào, hệ thống phải chặn Release và trả về lỗi cụ thể**:

| STT | Bảng / Đối tượng kiểm tra | Điều kiện kiểm tra toàn vẹn | Hành vi hệ thống khi vi phạm |
| :---: | :--- | :--- | :--- |
| **1** | **Item Revision** | Phải ở trạng thái `Status = Released` và thời gian hiện tại nằm trong khoảng `[EffectiveFrom, EffectiveTo]`. | **Block Release:** Báo lỗi phiên bản kỹ thuật sản phẩm chưa được phê duyệt hoặc đã hết hiệu lực. |
| **2** | **MBOM** | MBOM Header Released/effective phải chứa ít nhất 1 dòng chi tiết; không bị vòng lặp cây BOM; định mức `QuantityPer > 0`; đơn vị `UOMID` hợp lệ. MBOM không bị kiểm tra theo Item Revision. | **Block Release:** Báo lỗi cấu trúc BOM rỗng, sai định mức hoặc vi phạm vòng lặp dữ liệu. |
| **3** | **Phantom Component** | Dòng vật tư có cờ `PhantomFlag = Yes` bắt buộc phải có một MBOM con ở trạng thái `Released` còn hiệu lực. | **Block Release:** Báo lỗi bán thành phẩm ảo (Phantom) thiếu cấu trúc định mức cấp dưới. |
| **4** | **Routing** | Routing Header phải chứa ít nhất 1 công đoạn; không trùng `SequenceNo`; danh sách `PredecessorSeq` không tạo vòng lặp logic. | **Block Release:** Báo lỗi quy trình công nghệ rỗng, trùng bước hoặc phụ thuộc vòng lặp. |
| **5** | **Work Center** | Cụm máy mặc định (`DefaultWorkCenterID`) phải ở trạng thái `Status = Active` và thuộc đúng Nhà máy (`SiteID`). | **Block Release:** Báo lỗi Work Center không tồn tại, bị khóa hoặc sai lệch phân vùng nhà máy. |
| **6** | **Resource Capability** | Phải tồn tại ít nhất một tài nguyên (Work Center hoặc Equipment) có `Eligibility = True` cho công đoạn tương ứng. | **Block Release:** Báo lỗi không tìm thấy máy/trạm hợp lệ có đủ khả năng chạy công đoạn. |
| **7** | **Production Standard** | Bắt buộc phải có bản ghi định mức thời gian (`SetupTimeMin`, `CycleTimeSec > 0`) cho các công đoạn có chế độ lập lịch. | **Block Release:** Báo lỗi thiếu định mức thời gian năng suất để hệ thống tính toán tải. |
| **8** | **Resource Calendar** | Bắt buộc phải khai báo lịch ca làm việc khả dụng (`MD_RESOURCE_CALENDAR`) của tài nguyên trong kỳ lập kế hoạch. | **Block Release:** Báo lỗi tài nguyên chưa được gán lịch làm việc khả dụng. |
| **9** | **Traceability Rules** | Sản phẩm quản lý cấp độ `TrackingLevel = ParentChild` bắt buộc phải có đủ `QR Split Rule`, `Numbering Rule` và `Label Template` hợp lệ. | **Block Release:** Báo lỗi thiếu cấu hình quy tắc QR / Mẫu tem đối với sản phẩm quản lý mẹ-con. |
| **10** | **Permissions & Scope** | Phải tồn tại vai trò có quyền duyệt/phát hành (`Approve`/`Release`) và người dùng thực thi được gán phạm vi tại Workstation. | **Block Release:** Báo lỗi vi phạm cấu hình phân quyền hoặc thiếu nhân sự thực thi trạm. |

---

## 3. LUỒNG TRUY VẤN MASTER DATA TRONG TRANSACTIONAL FLOW (MVP EXECUTION)

Dưới đây là trình tự backend service đọc dữ liệu Master Data qua 7 bước thực thi chính của hệ thống MES MVP:

[Khởi tạo WO] ➔ [Bung Operation & Thời lượng] ➔ [Xếp tải & Phân bổ máy] ➔ [Tải danh sách Kiosk]
➔ [Thực thi & Báo sản lượng] ➔ [Cắt quét QR Mẹ] ➔ [In & Kích hoạt QR Con]
1. **Bước 1 (Tạo WO):** Hệ thống truy vấn `MD_ITEM_REVISION`, `MD_PRODUCTION_VERSION`, `MD_MBOM_HEADER` và `MD_ROUTING_HEADER` để xác định cấu hình sản xuất được phép chạy.
2. **Bước 2 (Bung công đoạn & thời gian):** Đọc `MD_ROUTING_OPERATION` để lấy chuỗi bước thực hiện, kết hợp `MD_PRODUCTION_STANDARD` và `MD_SHIFT` để tính toán thời gian chạy dự kiến (`Planned Duration`).
3. **Bước 3 (Lập lịch & Chọn máy):** Đọc `MD_WORK_CENTER`, `MD_RESOURCE_ASSIGNMENT`, `MD_RESOURCE_CAPABILITY` và `MD_RESOURCE_CALENDAR` để kiểm tra máy khả dụng và tính toán tải.
4. **Bước 4 (Hiển thị Kiosk):** Đăng nhập Kiosk xác thực qua `MD_TERMINAL`, `MD_WORKSTATION`, `MD_USER_RESOURCE_SCOPE` và `MD_ROLE_PERMISSION` để lọc đúng danh sách WO được phép xem.
5. **Bước 5 (Ghi nhận thực thi):** Công nhân Start/Finish job, hệ thống ghi nhận kết quả căn cứ theo cấu hình `MD_OPERATION`, `MD_PRODUCTION_STANDARD`, `MD_REASON_CODE` và hiển thị `MD_WORK_INSTRUCTION`.
6. **Bước 6 (Quét QR Mẹ):** Tại trạm cắt, hệ thống kiểm tra `MD_TRACEABILITY_POLICY`, `MD_QR_SPLIT_RULE` và `MD_UOM_CONVERSION` để xác thực cuộn/tấm mẹ và kiểm soát hạn mức sai số vật chất.
7. **Bước 7 (In & Kích hoạt QR Con):** MES sinh chuỗi mã theo `MD_NUMBERING_RULE`, định dạng lệnh in qua `MD_LABEL_TEMPLATE` và gửi tới `PrinterEndpointRef` của Kiosk.

## D4. Current MBOM/WO validation rules (2026-07-29)

`MD_MBOM_HEADER.structure_version` prevents lost structure updates. `MD_MBOM_LINE` is effective-dated and hierarchical; active sibling sequences are unique within a parent. Released MBOMs cannot be edited and create-new-version copies current lines only. Work Order material requirements retain `MBOMHeaderID`, `MBOMVersion`, `MBOMLineID`, `SourceParentLineID`, `QuantityPer`, `ScaledQuantity`, `ScrapRate` and `OptionalFlag`.

The WMS material-request model is still a legacy flat aggregate and is not yet documented as the final parent/line requisition model; it remains an open implementation gap.
