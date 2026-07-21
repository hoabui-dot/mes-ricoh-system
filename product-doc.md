# TÀI LIỆU ĐẶC TẢ SẢN PHẨM & QUY TRÌNH SẢN XUẤT (PRODUCT & PROCESS SPECIFICATIONS)
## PHÂN HỆ THỰC THI HIỆN TRƯỜNG - MES MVP CORE
**Áp dụng tại:** Nhà máy Cao su Kỹ thuật Won Seal Tech (Kizuna 3, Long An)
**Tác giả:** Đội ngũ Phát triển Hệ thống MOM/MES
**Phiên bản:** 1.0.0 | **Ngày phát hành:** 20/07/2026

---

## 1. TỔNG QUAN PHẠM VI NGHIỆP VỤ (CONTEXT SCOPE)
Tài liệu này chuẩn hóa toàn bộ cấu trúc dữ liệu nền tảng (Master Data) phục vụ cho việc vận hành luồng sản xuất các sản phẩm cao su kỹ thuật cao, phụ tùng ô tô cấp 1 (Tier-1) thuộc chuỗi cung ứng toàn cầu của Won Seal Tech. Hệ thống MES MVP tập trung quản lý chặt chẽ chuỗi công đoạn từ **Luyện cán cao su thô**, **Xử lý phôi kim loại**, **Cắt tách phôi tấm mẹ-con** bằng mã QR, cho đến khâu **Ép dính lưu hóa áp lực cao** để tạo ra dòng sản phẩm cốt lõi **Cao su dính kim loại**.

---

## 2. DANH MỤC ITEM / SKU CHUẨN HÓA (MD_ITEM & MD_ITEM_REVISION)

Để hệ thống MES quản lý vòng đời và chính sách kiểm soát vật tư (Lot/Parent-Child Tracking), danh mục cấu trúc dữ liệu đối tượng cấu thành bao gồm:

### 2.1. Thành phẩm (Finished Goods - FG)
*   **Mã nhóm (ItemGroup):** `FG_RUBBER_METAL` (Cao su dính kim loại)
    *   *Sản phẩm tiêu biểu:* Cao su chân máy ô tô (`FG-WS-CM01`), Cao su ốp cân bằng, Khớp nối giảm chấn chịu lực cụm truyền động.
*   **Mã nhóm (ItemGroup):** `FG_SEALS_ORING` (Gioăng phớt / O-ring kỹ thuật)
    *   *Sản phẩm tiêu biểu:* O-ring chịu nhiệt động cơ (`FG-OR-NBR80`), Phớt chắn dầu hộp số, Nắp bạc đạn chắn mỡ vòng bi (`FG-BS-METAL`).

### 2.2. Bán thành phẩm (Semi-Finished Goods - SFG)
*   **Mã nhóm (ItemGroup):** `SFG_COMPOUND` (Bán thành phẩm cao su cán luyện)
    *   *Sản phẩm tiêu biểu:* Tấm cao su EPDM mẹ chưa lưu hóa dạng cuộn (`SFG-ROLL-EPDM`), Tấm cao su NBR định hình.
*   **Mã nhóm (ItemGroup):** `SFG_TREATED_METAL` (Lõi kim loại đã xử lý bám dính)
    *   *Sản phẩm tiêu biểu:* Xương sắt dập định hình đã phun keo liên kết (`SFG-MET-CM01`), Cột nhôm lõi giảm chấn đã bắn cát.

### 2.3. Nguyên vật liệu (Raw Materials - RM)
*   **Mã nhóm (ItemGroup):** `RM_RUBBER_BASE` (Cao su tự nhiên / tổng hợp thô): Cao su NBR, EPDM, FKM cục thô.
*   **Mã nhóm (ItemGroup):** `RM_CHEMICALS` (Hóa chất phụ gia phụ trợ): Lưu huỳnh, chất gia tốc lưu hóa, than đen tạo độ cứng.
*   **Mã nhóm (ItemGroup):** `RM_METAL_BASE` (Phôi kim loại thô): Thép tấm cán nguội, ống nhôm định hình phi tiêu chuẩn.

---

## 3. ĐẶC TẢ HỆ THỐNG CÔNG ĐOẠN HIỆN TRƯỜNG (MD_OPERATION)

Hệ thống Kiosk/Tablet tại hiện trường điều phối luồng thực thi dựa trên cấu hình trạng thái đóng/mở của các công đoạn chuẩn hóa dưới đây:

| Mã Công Đoạn (`OperationCode`) | Tên Công Đoạn | Loại Công Đoạn (`OperationType`) | Chế Độ Ghi Nhận (`ConfirmationMode`) | Yêu Cầu Quét Vật Tư (`RequiresMaterialScan`) | Yêu Cầu Tem Đầu Ra (`RequiresOutputLabel`) | Quy Tắc Kiểm Soát Đặc Thù |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **OP-MIX** | Luyện cán cao su | Production | StartFinish | Yes (Quét hóa chất/cao su thô) | Yes (In mã vạch lô cao su mẹ) | Kiểm soát nghiêm ngặt thời gian trộn nhiệt độ buồng kín Banbury. |
| **OP-PREP** | Xử lý lõi kim loại | Production | QuantityOnly | Yes (Quét phôi thép thô) | No (Luân chuyển theo pallet) | Đếm số lượng qua công đoạn bắn cát và bồn phun keo kết dính Primer. |
| **OP-CUT** | Cắt tách phôi tấm mẹ-con | Production | StartFinish | Yes (Quét QR Tấm Mẹ) | Yes (Kích hoạt hàng loạt tem QR Con) | **Áp dụng điểm chặn vật chất QR Split Rule**. Phân rã cân bằng diện tích/khối lượng. |
| **OP-MOLD** | Ép dính và Lưu hóa | Production | StartFinish | Yes (Quét QR Con + Quét Pallet Thép) | Yes (In tem thành phẩm lô/thùng) | Khóa chặt thông số chu kỳ nhiệt (Curing Time) từ $150^\circ\text{C}$ - $180^\circ\text{C}$. |
| **OP-TRIM** | Cắt bavia / Định hình | Production | QuantityOnly | No | No | Loại bỏ phần cao su thừa rìa khuôn, tính toán tỷ lệ phế liệu hao hụt thực tế. |
| **OP-QC** | Kiểm tra chất lượng | Inspection | StartFinish | No | Yes (Chỉ dán tem Đạt - PASS) | Bắt buộc nhập mã nguyên nhân lỗi (`ReasonCode`) nếu phát hiện bong keo, khuyết liệu. |

---

## 4. CẤU TRÚC ĐỊNH MỨC SẢN XUẤT ĐA CẤP (MD_MBOM_HEADER & LINE)

Dưới đây là mô hình cấu trúc MBOM của sản phẩm phức hợp tiêu biểu **"Cao su chân máy ô tô WS-CM01"** được thiết lập trên cơ sở dữ liệu để chạy thuật toán bung nhu cầu vật tư vật lý khi mở Lệnh sản xuất (WO):

*   **Sản lượng cơ sở (BaseQuantity):** `100.000000`
*   **Đơn vị tính cơ sở (BaseUOM):** `PCS` (Cái)

### Chi tiết các dòng định mức vật tư (MD_MBOM_LINE):

| STT (`Seq`) | Mã SKU Thành Phần (`ComponentRevisionID`) | Tên Vật Tư Tham Chiếu | Định Mức Cần (`QuantityPer`) | Đơn Vị (`UOM`) | Hao Hụt (`ScrapRate`) | Công Đoạn Tiêu Hao (`IssueOperationID`) | Tự Động Trừ Kho (`BackflushFlag`) | Cấu Hình Cây Đa Cấp (`PhantomFlag`) |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 10 | `SFG-MET-CM01-R1` | Lõi thép đã xử lý keo dính | 100.000000 | PCS | 0.0100 (1%) | `OP-MOLD` | Yes | No |
| 20 | `SFG-RUB-CM01-R1` | Phôi cao su định lượng (Con) | 102.000000 | PCS | 0.0200 (2%) | `OP-MOLD` | Yes | No |
| 30 | `RM-STL-05-R1` | Thép tấm định hình thô | 101.000000 | PCS | 0.0050 (0.5%)| `OP-PREP` | No (Cấp tay) | No |
| 40 | `RM-CHEM-BOND-R1` | Keo lưu hóa đặc chủng | 1.500000 | KG | 0.0500 (5%) | `OP-PREP` | Yes | No |
| 50 | `SFG-ROLL-EPDM-R1`| Tấm cao su mẹ EPDM (dạng cuộn)| 15.500000 | M2 | 0.0300 (3%) | `OP-CUT` | Yes | **Yes (Phantom)** |

> **Giải thích nghiệp vụ DB cho Dev:** Dòng dữ liệu số `50` chứa cờ `PhantomFlag = Yes`. Khi chạy lệnh tạo WO, MES sẽ không tạo một Lệnh độc lập cho việc lưu kho tấm cao su cuộn EPDM này, mà hệ thống sẽ bung trực tiếp lượng diện tích ($M^2$) cần thiết để tính toán lượng phôi cao su con tại công đoạn cắt `OP-CUT`, giúp công nhân thao tác cắt trích ly tại chỗ theo luồng QR mẹ-con liên tục.

---

## 5. ĐỊNH MỨC NĂNG LỰC NHÂN CÔNG & THIẾT BỊ (MD_PRODUCTION_STANDARD)

Ma trận phân bổ thời gian chuẩn phối hợp giữa Cụm năng lực logic (`WorkCenter`), Máy vật lý (`Equipment`) và tay nghề nhân công hiện trường:

### 5.1. Phân cấp năng lực vận hành (MD_SKILL)
*   `SK_MIX_MASTER`: Kỹ thuật luyện cán cao cấp (Yêu cầu cấp độ tay nghề tối thiểu: `L3`).
*   `SK_VULCAN_OPERATOR`: Vận hành máy ép lưu hóa áp lực cao (Yêu cầu cấp độ tay nghề tối thiểu: `L2`).
*   `SK_INSPECTION`: Kỹ thuật viên đo lường, thử nghiệm lực bóc tách mối bám dính (Yêu cầu cấp độ tay nghề tối thiểu: `L2`).

### 5.2. Định mức thời gian chu kỳ sản xuất (MD_PRODUCTION_STANDARD)
Cấu hình mẫu cho cụm máy ép khuôn cao su dính kim loại:

*   **Sản phẩm:** `FG-WS-CM01` | **Công đoạn:** `OP-MOLD`
*   **Work Center mặc định:** `WC-VULCAN-MOLD` (Cụm máy ép thủy lực gia nhiệt)

| Thiết bị cụ thể (`EquipmentID`) | Số lượng nhân công (`LaborCount`) | Kỹ năng bắt buộc (`SkillID`) | Cấp độ tối thiểu (`MinimumLevel`) | Thời gian chuẩn bị (`SetupTimeMin`) | Thời gian chạy 1 khối (`CycleTimeSec`) | Hệ số hiệu suất thực tế (`EfficiencyFactor`) |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| `EQ-MOLD-HYD01` (Máy ép 500 tấn) | 1 | `SK_VULCAN_OPERATOR` | L2 | 15.000 | 45.000 | 0.9200 (92%) |
| `EQ-MOLD-HYD02` (Máy ép 300 tấn) | 1 | `SK_VULCAN_OPERATOR` | L2 | 12.000 | 60.000 | 0.8800 (88%) |
| `Bất kỳ máy nào thuộc cụm` | 1 | `SK_VULCAN_OPERATOR` | L1 | 20.000 | 75.000 | 0.8000 (Chuẩn sàn) |

---

## 6. QUY TẮC QUẢN LÝ TÁCH MÃ QR MẸ-CON (MD_QR_SPLIT_RULE)

Đây là logic nghiệp vụ xương sống xử lý transaction tại hiện trường khi phân tách tấm cao su cuộn thô thành các miếng phôi con trước khi đưa vào lòng khuôn ép với phôi kim loại.