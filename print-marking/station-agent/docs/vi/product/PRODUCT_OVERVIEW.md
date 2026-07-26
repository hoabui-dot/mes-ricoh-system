# Tổng quan sản phẩm — Nền tảng Trạm biên in ấn và khắc nhãn (Print-Marking Edge Station Platform)

> **QUY TẮC AI (AI RULE)**: Đọc tài liệu này trước khi triển khai bất kỳ tính năng nào. Sự hiểu biết về nghiệp vụ phải đi trước việc sinh mã (code generation).

---

## Hệ thống này là gì?

**Trạm biên in ấn và khắc nhãn (Print-Marking Edge Station)** là một **Nền tảng tính toán biên công nghiệp (Industrial Edge Computing Platform)** được triển khai trực tiếp trên sàn sản xuất của nhà máy, đặt cạnh các máy móc sản xuất.

Nó đóng vai trò là **lớp xử lý thông minh cục bộ (local intelligence layer)** giữa Cổng nhà máy (Factory Gateway - hệ thống trung tâm/đám mây) và các thiết bị sản xuất vật lý.

### Mô hình triển khai (Deployment Context)

```
┌─────────────────────────────────────────────────────────┐
│              FACTORY GATEWAY (Trung tâm/Đám mây)        │
│   - Tích hợp ERP            - Lệnh sản xuất             │
│   - Quản lý công thức       - CS Dữ liệu truy xuất      │
└──────────────────────────┬──────────────────────────────┘
                           │ MQTT (TLS)
                           ▼
┌─────────────────────────────────────────────────────────┐
│         TRẠM BIÊN IN ẤN VÀ KHẮC NHÃN (EDGE STATION)     │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ MQTT Adapter │  │  Job Engine  │  │  Kiosk UI    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Printer Adapt │  │ Laser Adapt  │  │Vision Service│  │
│  │ (gồm Studio  │  │              │  │              │  │
│  │  Templates)  │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │  PLC Adapter │  │ Dev Simulator│                     │
│  │              │  │ (gồm Studio  │                     │
│  │              │  │  Designer)   │                     │
│  └──────────────┘  └──────────────┘                     │
└──────┬────────────────┬──────────────┬──────────────────┘
       │                │              │
       ▼                ▼              ▼
 ┌──────────┐   ┌──────────┐   ┌──────────┐
 │ MÁY IN   │   │ MÁY KHẮC │   │ CAMERA QC│
 │ (TCP9100)│   │ (TCP/SDK)│   │(TCP/REST)│
 └──────────┘   └──────────┘   └──────────┘
       │
       ▼
 ┌──────────┐
 │   PLC    │
 │(Modbus)  │
 └──────────┘
```

---

## Mục đích chính

Trạm thực hiện các **hoạt động in ấn và/hoặc khắc nhãn (print and/or marking operations)** trên các sản phẩm được sản xuất, đảm bảo mọi sản phẩm đều được định danh, dán nhãn và xác thực một cách chính xác.

### Vòng lặp thực thi 8 bước (8-Step Execution Loop)

```
1. RECEIVE (NHẬN)     → Nhận sự kiện sản xuất từ Factory Gateway qua MQTT
2. CREATE (TẠO)       → Tạo một công việc (Job) với tất cả các thông số yêu cầu
3. GENERATE (TẠO ND)  → Tạo nội dung in/khắc (ZPL, số sê-ri, mã QR)
4. EXECUTE PRINT (IN) → Gửi nội dung in tới Máy in nhãn
5. EXECUTE MARK (KHẮC)→ Gửi nội dung khắc tới Máy khắc laser
6. VERIFY (XÁC THỰC)  → Xác nhận kết quả qua Hệ thống thị giác/OCR
7. PERSIST (LƯU TRỮ)  → Lưu kết quả vào cơ sở dữ liệu SQLite cục bộ
8. SYNC (ĐỒNG BỘ)     → Đồng bộ hóa kết quả ngược lại Factory Gateway qua MQTT
```

Không phải tất cả các bước đều bắt buộc đối với mọi hoạt động. Xem [MANUFACTURING_WORKFLOW.md](./MANUFACTURING_WORKFLOW.md) để biết các luồng chi tiết.

---

## Các phân vùng nghiệp vụ cốt lõi (Core Business Domains)

### 1. Định danh sản phẩm (Product Identification)

Mỗi sản phẩm được sản xuất phải nhận được một mã định danh duy nhất được tạo ra bởi trạm.

**Ví dụ về định dạng:**
```
FC-WP-RO100G-B-998822       → Mã nhà máy + Sản phẩm + Số sê-ri
FC-SHAMPOO-250ML-000112     → Mã nhà máy + SKU + Số thứ tự
FC-LOTION-500ML-883722      → Mã nhà máy + SKU + Số sê-ri
```

**Quy tắc:**
- Mã định danh là duy nhất trên toàn cầu trong phạm vi lô sản xuất (production batch).
- Định dạng được xác định bởi công thức sản xuất (recipe) nhận từ Factory Gateway.
- Trạm không được tạo ra mã định danh trùng lặp.

---

### 2. In nhãn (Label Printing)

Trạm gửi các lệnh in đến các máy in nhãn được kết nối với dây chuyền sản xuất.

**Các loại nội dung có thể in:**
| Loại nội dung | Ví dụ |
|---|---|
| Mã QR (QR Code) | URL sản phẩm hoặc mã truy xuất nguồn gốc |
| Mã vạch (Barcode) | GS1 128, Code 39, EAN-13 |
| Văn bản (Text) | Số lô, ngày hết hạn, SKU |
| Số lô (Lot Number) | LOT-2026-06-A-001 |
| Ngày sản xuất | 2026-06-16 |
| Ngày hết hạn | 2028-06-16 |

**Giao thức:** Cổng TCP 9100, ngôn ngữ lệnh ZPL hoặc EPL.

---

### 3. Khắc Laser (Laser Marking)

Trạm gửi các lệnh khắc đến các máy laser để khắc thông tin trực tiếp lên bao bì sản phẩm hoặc chính sản phẩm.

**Các loại nội dung có thể khắc:**
| Loại nội dung | Ví dụ |
|---|---|
| Số lô | 2026-BATCH-A |
| Mã ngày | 260616 |
| Số sê-ri | SN-0001234 |
| Mã truy xuất nguồn gốc | TRC-FC-WP-RO100G-998822 |
| Mã QR | QR được khắc bằng laser |
| Mã vạch | Mã vạch kiểu gõ chấm (Dot-peen barcode) |

---

### 4. Xác thực (Verification)

Sau khi in/khắc, trạm sẽ xác thực kết quả đầu ra bằng Hệ thống thị giác (Vision System).

**Phương pháp xác thực:**
| Phương pháp | Công cụ | Trường hợp sử dụng |
|---|---|---|
| OCR | Camera + Công cụ OCR | Kiểm tra khả năng đọc văn bản |
| Quét mã vạch | Máy quét | Khả năng giải mã mã vạch |
| Quét QR | Camera | Tính toàn vẹn của mã QR |
| Kiểm tra thị giác | Camera + AI | Vị trí nhãn, phát hiện lỗi |

**Kết quả xác thực:** VERIFIED_PASS, VERIFIED_FAIL, VERIFIED_RETRY, VERIFIED_BYPASS

---

### 5. Truy xuất nguồn gốc (Traceability)

Mỗi hoạt động được thực hiện trên từng sản phẩm phải được ghi lại vĩnh viễn.

**Những gì được ghi lại:**
- Thời gian tạo công việc (Job) và các tham số
- Từng bước thực thi kèm theo dấu thời gian (timestamp)
- Thiết bị được sử dụng
- Kết quả (pass/fail)
- Người vận hành đã phê duyệt bất kỳ lệnh ghi đè (overwrite) nào
- Tất cả các lần thử lại (retries) và kết quả tương ứng

**Lý do:** Tuân thủ quy định, đánh giá chất lượng, điều tra thu hồi sản phẩm lỗi.

---

## Vai trò dịch vụ (Tham khảo nhanh)

| Dịch vụ | Vai trò |
|---|---|
| **MQTT Adapter** | Cổng kết nối giữa MQTT của nhà máy và bus sự kiện nội bộ |
| **Job Engine** | Điều phối cốt lõi: tạo, lập lịch và theo dõi công việc |
| **Printer Adapter** | Giao tiếp với máy in nhãn (ZPL/TCP), lưu trữ mẫu thiết kế JSON, lưu lịch sử phiên bản mẫu nhãn và thực thi kết xuất mã ZPL theo thiết kế động |
| **Laser Adapter** | Giao tiếp với máy khắc laser |
| **Vision Service** | Giao tiếp với camera/OCR để xác thực kết quả |
| **PLC Adapter** | Đọc trạng thái PLC (tín hiệu kích hoạt, trạng thái máy, trạng thái dây chuyền) |
| **Kiosk UI** | Giao diện người vận hành để giám sát và ghi đè thủ công |
| **Device Simulator** | Giả lập các thiết bị phần cứng (Máy in, Máy khắc laser, PLC, Camera QC) và cung cấp giao diện Zebra Label Studio để thiết kế nhãn trực quan và in thử nghiệm |

---

## Các quy tắc nghiệp vụ chính (Key Business Rules)

1. **Không sản xuất nếu không có công việc (Job)** — không được điều khiển trực tiếp các thiết bị; mọi hoạt động phải thông qua Job Engine.
2. **Tất cả các sự kiện phải được ghi nhật ký (log)** — không cho phép các hoạt động diễn ra âm thầm.
3. **Xác thực thất bại phải dừng dây chuyền** — trừ khi được bỏ qua (bypass) rõ ràng bởi người vận hành được ủy quyền.
4. **Mỗi lần đồng bộ lên Gateway phải được xác nhận (acknowledge)** — bắt buộc phải thử lại nếu thất bại.
5. **Các hoạt động ghi đè yêu cầu phê duyệt của người vận hành** — REPRINT, RELASER, FORCE_PASS, FORCE_COMPLETE đều yêu cầu phê duyệt có ghi nhật ký hệ thống.
