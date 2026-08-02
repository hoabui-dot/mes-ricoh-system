   # Luồng nghiệp vụ WMS quản lý kho hiện tại

   ## 1. Mục đích và phạm vi

   Tài liệu mô tả **trạng thái đang được cài đặt trong codebase**, không phải thiết kế WMS mục tiêu. Nội dung được đối chiếu từ toàn bộ tài liệu Markdown trong repository và các nguồn thực thi chính:

   - `services/wms-master-data-service`
   - `services/wms-inbound-service`
   - `services/wms-inventory-service`
   - `services/wms-outbound-service`
   - `services/wms-console`
   - phần tích hợp WMS trong `services/mes-execution-service`
   - migration, seed, Kafka consumer, Kong/Compose và service manifest liên quan

   WMS hiện tập trung vào dòng vật tư phục vụ sản xuất: khai báo cấu trúc kho, nhập lô vào kho trung tâm, theo dõi tồn, chuyển vật tư sang staging của Work Center theo yêu cầu MES, rồi trừ tồn khi MES báo tiêu hao.

   ## 2. Bounded context và trách nhiệm

   | Thành phần | Trách nhiệm hiện tại | Cơ sở dữ liệu sở hữu |
   |---|---|---|
   | WMS Master Data | Warehouse, Zone, Storage Location, Bin, ánh xạ UOM; nhận Item Revision từ MES | `wms_master_data_db` |
   | WMS Inbound | Tạo và xác nhận phiếu nhập | `wms_inbound_db` |
   | WMS Inventory | Lot, balance, movement ledger, discrepancy; FEFO; nhận và trừ tồn | `wms_inventory_db` |
   | WMS Outbound | Yêu cầu cấp vật tư, kiểm tra staging/tồn trung tâm, điều chuyển và báo thiếu | `wms_outbound_db` |
   | WMS Console | Giao diện master data, bản đồ kho, tồn, movement, inbound, outbound | Không sở hữu DB |
   | MES Execution | Sinh nhu cầu vật tư theo WO, gọi WMS staging, phát sự kiện tiêu hao | `mes_execution_db` |

   Mỗi service sở hữu dữ liệu riêng. Quan hệ xuyên service là tham chiếu UUID hoặc local read model, không phải foreign key xuyên database.

   ## 3. Mô hình vị trí kho

   ```text
   Warehouse
   └── Zone
      └── Storage Location
         └── Bin
   ```

   - `Warehouse` thuộc một `site_id`.
   - `Zone` thuộc Warehouse và có loại: `Receiving`, `Storage`, `Picking`, `Staging`, hoặc `Shipping`.
   - `Storage Location` thuộc Zone và có một trong hai mục đích:
   - `Storage`: vị trí lưu kho trung tâm, được phép nhận hàng.
   - `WorkCenterStaging`: vị trí cấp phát cạnh sản xuất, phải tham chiếu một MES Work Center.
   - Mỗi Work Center chỉ có tối đa một location staging do unique index trên `staging_for_work_center_ref`.
   - `Bin` thuộc location và có thể khai báo sức chứa.

   Lưu ý quan trọng: giao dịch tồn hiện dừng ở cấp `location_id`. `bin_id`, sức chứa bin và `capacity_uom_id` chưa tham gia vào receipt, balance, transfer hoặc consumption.

   ## 4. Luồng chuẩn đầu-cuối

   ```mermaid
   flowchart LR
      A[MES release Item Revision] -->|Kafka| B[WMS local item read models]
      C[Tạo cấu trúc Warehouse → Zone → Location → Bin] --> D[Location Created event]
      D -->|Kafka| E[Inventory/Outbound location read models]
      F[Tạo phiếu nhập Draft] --> G[Xác nhận phiếu nhập]
      G -->|HTTP từng dòng| H[Inventory tạo Lot]
      H --> I[Balance tại Storage]
      H --> J[Movement RECEIPT]
      K[MES WO Released/InProgress] --> L[Stage materials]
      L --> M[Outbound material request]
      M --> N{Đủ tại staging?}
      N -->|Có| O[Staged, không chuyển thêm]
      N -->|Không| P{Storage đủ phần thiếu?}
      P -->|Không| Q[Shortage, không chuyển một phần]
      P -->|Có| R[FEFO transfer]
      R --> S[Balance Storage giảm]
      R --> T[Balance WorkCenterStaging tăng]
      R --> U[Movement TRANSFER_TO_STAGING]
      V[MES xác nhận tiêu hao] -->|Kafka MaterialConsumed| W[Inventory FEFO consume staging]
      W --> X[Balance staging giảm]
      W --> Y[Movement CONSUMPTION]
      W -->|Không đủ| Z[Discrepancy log]
   ```

   ## 5. Luồng 1 — Đồng bộ master data từ MES

   ### 5.1 Item Revision

   1. MES phát `MES.MasterData.ItemRevisionReleased.v2`.
   2. Master Data, Inventory và Outbound WMS consume sự kiện vào bảng `rm_item_revision` riêng.
   3. WMS dùng UUID của Item Revision làm định danh vật tư; tên/mã chỉ là dữ liệu hiển thị/read model.
   4. Master Data chỉ cho tạo Item UOM Mapping khi Item Revision đã tồn tại trong read model của service đó.

   ### 5.2 Vị trí kho

   1. Người dùng tạo Warehouse → Zone → Location → Bin qua WMS Console/API.
   2. Master Data ghi dữ liệu và outbox trong cùng transaction.
   3. Khi tạo location, service phát `WMS.MasterData.LocationCreated.v1`.
   4. Inventory và Outbound consume sự kiện này để tạo `rm_storage_location`.
   5. Outbound dựa vào read model để tìm staging location của Work Center; Inventory dùng read model để kiểm tra location nhận hàng và chọn nguồn Storage.

   Các API cập nhật master data hiện có, nhưng không phát sự kiện `Updated`. Vì vậy thay đổi code, tên, purpose, Work Center mapping hoặc status sau khi tạo có thể không tự đồng bộ sang read model Inventory/Outbound.

   ## 6. Luồng 2 — Khai báo cấu trúc kho

   ### 6.1 Warehouse

   - Tạo/sửa mã, tên đa ngôn ngữ, mô tả, `site_id`, trạng thái.
   - Mã Warehouse là duy nhất toàn hệ thống Master Data.
   - Trạng thái: `Active` hoặc `Inactive`.

   ### 6.2 Zone

   - Tạo dưới một Warehouse.
   - Mã Zone duy nhất trong Warehouse.
   - Bắt buộc chọn `zone_type`.

   ### 6.3 Storage Location

   - Tạo dưới một Zone.
   - Mã Location duy nhất trong Zone.
   - `Storage` không được có `staging_for_work_center_ref`.
   - `WorkCenterStaging` bắt buộc có `staging_for_work_center_ref`.
   - Cùng một Work Center không thể có hai staging location.

   Tham chiếu Work Center chỉ là UUID; WMS Master Data chưa có local read model/validation để kiểm tra Work Center thực sự tồn tại và active tại MES.

   ### 6.4 Bin

   - Tạo dưới một Location.
   - Mã Bin duy nhất trong Location.
   - Có thể khai báo `capacity_qty` và `capacity_uom_id`.
   - Không có nghiệp vụ xóa; runtime role chủ động bị thu hồi quyền `DELETE`.

   ## 7. Luồng 3 — Khai báo UOM lưu kho

   1. Chọn Item Revision đã được đồng bộ từ MES.
   2. Khai báo `storage_uom_code`, `conversion_factor` và sức chứa bin mặc định tùy chọn.
   3. Một Item Revision không thể có hai mapping cùng `storage_uom_code`.

   Trong code hiện tại:

   - mapping chỉ được tạo và đọc, chưa có cập nhật;
   - receipt, transfer, balance và consumption dùng trực tiếp `uom_code` trên request/lot;
   - chưa có bước quy đổi quantity bằng `conversion_factor`;
   - chưa kiểm tra UOM của receipt/material request có khớp mapping;
   - chưa có khóa ngoại tới một bảng UOM chuẩn.

   ## 8. Luồng 4 — Nhập kho

   ### 8.1 Tạo phiếu Draft

   Người dùng nhập:

   - mã phiếu (hoặc hệ thống sinh `RCV-{timestamp}`);
   - `warehouse_location_id`;
   - một hoặc nhiều dòng gồm Item Revision, lot code, quantity, UOM và expiry date.

   Inbound tạo:

   - một `inbound_receipt` trạng thái `Draft`;
   - các `inbound_receipt_line`.

   Console chỉ cho chọn location `Active` có purpose `Storage`. Backend Inbound chỉ kiểm tra location là chuỗi không rỗng khi tạo Draft; kiểm tra location thực tế diễn ra khi Inventory nhận từng dòng.

   ### 8.2 Xác nhận phiếu

   1. Inbound khóa header bằng `FOR UPDATE`.
   2. Phiếu phải tồn tại và đang `Draft`.
   3. Inbound lần lượt gọi HTTP `POST /api/wms/inventory/movements/receipt` cho từng dòng.
   4. Inventory kiểm tra input và location phải có purpose `Storage`.
   5. Với mỗi dòng, Inventory tạo:
      - `inv_lot`;
      - movement `RECEIPT`;
      - `inv_balance` tại location nhận.
   6. Sau khi tất cả lời gọi thành công, Inbound đổi phiếu thành `Confirmed`.

   Điểm cần lưu ý:

   - mỗi lot code là duy nhất toàn Inventory;
   - một lần receipt tạo một lot mới; không cộng thêm vào lot code đã tồn tại;
   - không xác thực Item Revision tồn tại trong `rm_item_revision` trước khi ghi lot;
   - không dùng bin;
   - xác nhận phiếu là transaction trong Inbound nhưng các dòng đã ghi sang Inventory qua HTTP không nằm trong cùng transaction phân tán. Nếu dòng sau lỗi, các dòng trước có thể đã nhập tồn trong khi phiếu vẫn `Draft`;
   - backend chưa có endpoint danh sách phiếu và chưa trả các dòng trong endpoint chi tiết; màn hình danh sách hiện hiển thị `backend gap`.

   ## 9. Luồng 5 — Theo dõi tồn và sổ movement

   ### 9.1 Lot

   Lot lưu Item Revision, ngày nhận, hạn dùng, số lượng ban đầu, UOM và trạng thái:

   - `Active`
   - `Expired`
   - `Quarantined`
   - `Consumed`

   Code chưa có command/API chuyển trạng thái lot. Việc loại trừ hết hạn chủ yếu dựa trên `expiry_date`, không tự động cập nhật status thành `Expired`.

   ### 9.2 Balance

   - Khóa logic: `(lot_id, location_id)`.
   - `on_hand_qty` không âm.
   - Receipt tăng balance tại Storage.
   - Transfer giảm Storage và tăng WorkCenterStaging.
   - Consumption giảm WorkCenterStaging.
   - `row_version` tăng khi balance thay đổi.

   ### 9.3 Movement ledger

   Các loại được schema cho phép:

   - `RECEIPT`
   - `TRANSFER_TO_STAGING`
   - `CONSUMPTION`
   - `ADJUSTMENT`

   Hiện chỉ có luồng ghi ba loại đầu. Chưa có API nghiệp vụ tạo adjustment.

   Console có thể lọc movement theo location, lot, WO, Work Center và Item Revision. Warehouse Map hiển thị cấu trúc kho, balance và movement theo location.

   ## 10. Luồng 6 — MES yêu cầu cấp vật tư

   ### 10.1 Sinh nhu cầu ở MES

   1. WO phải ở trạng thái `Released` hoặc `InProgress`.
   2. MES lấy material requirement:
      - bỏ phantom component;
      - bỏ requirement đã `Staged`;
      - yêu cầu quantity dương;
      - dùng Work Center tại issue operation, nếu thiếu thì dùng Work Center của operation đầu tiên.
   3. MES gộp các requirement theo `(item_revision_id, work_center_id)`.
   4. MES gọi WMS Outbound một lần cho mỗi nhóm.

   ### 10.2 Xử lý ở Outbound

   1. Validate WO, Work Center, Item Revision và quantity.
   2. Dùng advisory lock theo business identity.
   3. Nếu đã có request cùng `(wo_id, work_center_ref, item_revision_id, required_qty)`, trả lại kết quả cũ, không tạo transfer lần hai.
   4. Tìm location `WorkCenterStaging`, `Active`, được gán cho Work Center.
   5. Gọi Inventory lấy toàn bộ balance của Item Revision.
   6. Bỏ qua lot không `Active`, hết hạn hoặc quantity không dương.
   7. Tính:
      - `already_staged_qty`: tồn đã có tại đúng staging location;
      - `shortfall_qty = max(required_qty - already_staged_qty, 0)`;
      - `available_qty`: tồn hợp lệ tại các location purpose `Storage`.

   ### 10.3 Kết quả

   **Đã đủ staging**

   - Không transfer thêm.
   - Ghi material request `Staged`.
   - Phát `WMS.Outbound.MaterialStaged.v1`.

   **Thiếu staging nhưng kho trung tâm đủ**

   - Outbound gọi Inventory transfer đúng phần thiếu.
   - Inventory chọn lot theo FEFO: expiry gần nhất trước, lot không expiry sau; cùng nhóm thì received time sớm trước.
   - Toàn bộ transfer chạy trong một transaction Inventory.
   - Ghi balance hai đầu và movement `TRANSFER_TO_STAGING`.
   - Outbound ghi request `Staged` và phát sự kiện staged.

   **Kho trung tâm không đủ**

   - Không transfer một phần.
   - Ghi request `Shortage`, chi tiết requested/already staged/shortfall/available.
   - Phát `WMS.Outbound.MaterialShortageDeclared.v1`.
   - HTTP trả `409 Conflict`.

   MES cập nhật `stock_check_status` và `stock_check_detail` trên các requirement thành `Staged` hoặc `Shortage`. Lỗi phụ thuộc/validation để requirement ở `NotChecked`.

   ## 11. Luồng 7 — Tiêu hao vật tư tại sản xuất

   1. MES ghi nhận tiêu hao hoặc backflush khi xác nhận operation.
   2. MES phát `MES.Execution.MaterialConsumed.v1`, gồm WO, component revision, quantity và Work Center.
   3. Inventory consumer tìm staging location của Work Center.
   4. Inventory chọn các lot `Active`, chưa hết hạn tại staging theo FEFO.
   5. Balance staging giảm và movement `CONSUMPTION` được ghi theo từng lot.
   6. Nếu quantity yêu cầu lớn hơn tồn staging hợp lệ:
      - Inventory tiêu hao phần đang có;
      - ghi `inv_discrepancy_log` loại `STAGING_OVER_CONSUMPTION`;
      - commit thay vì rollback.

   Consumer hiện log lỗi rồi tiếp tục khi không tìm được staging location hoặc consumption thất bại. Chưa có dead-letter/retry nghiệp vụ thể hiện trong module này và chưa có API đọc discrepancy log.

   ## 12. Trạng thái UI hiện tại

   WMS Console hiện có:

   - Dashboard;
   - Warehouse Map;
   - CRUD/update cho Warehouse, Zone, Location, Bin;
   - tạo/đọc Item UOM Mapping;
   - danh sách balance, lot detail dựa trên balance/movement, movement ledger;
   - tạo và xác nhận receipt bằng ID;
   - danh sách/tạo/chi tiết material request;
   - chi tiết fulfillment từ movement và hierarchy.

   Các khoảng trống được UI thể hiện hoặc suy ra trực tiếp từ API:

   - danh sách receipt chưa triển khai backend;
   - receipt detail không trả receipt lines;
   - discrepancy list chưa có backend;
   - chưa có put-away theo bin, replenishment, picking/shipping, cycle count, adjustment command, reservation/allocation, return hoặc cancellation workflow;
   - chưa có nghiệp vụ outbound thành phẩm/khách hàng; “outbound” hiện là cấp vật tư sang Work Center staging.

   ## 13. Quy tắc dữ liệu và nhất quán đáng chú ý

   - Dữ liệu tên master WMS dùng `LocalizedText` JSONB và bắt buộc có `vi` không rỗng.
   - Các bảng master data, lot, balance, movement không cho runtime role xóa.
   - Movement được dùng như ledger append-only; balance là projection hiện tại.
   - FEFO loại lot có `expiry_date <= CURRENT_DATE`; lot hết hạn đúng ngày hiện tại không được dùng.
   - Material request có unique business identity để chống cấp lặp.
   - `available_qty` là ảnh chụp tại thời điểm request, không phải reservation tồn.
   - Outbound kiểm tra đủ hàng trước rồi Inventory khóa balance trong lúc transfer; Inventory vẫn là nơi quyết định cuối cùng dưới cạnh tranh.

   ## 14. Các rủi ro/gap cần ưu tiên nếu phát triển tiếp

   1. Bổ sung event `Updated/StatusChanged` hoặc cơ chế rebuild read model cho Location và Item Revision.
   2. Làm confirm receipt idempotent và tránh partial commit xuyên Inbound–Inventory, ví dụ inbox/outbox hoặc command có idempotency key theo receipt line.
   3. Bổ sung list/detail lines/cancel cho inbound receipt.
   4. Xác thực Item Revision, UOM mapping và nhất quán UOM khi receipt/stage/consume.
   5. Quyết định rõ inventory ở cấp location hay bin; nếu ở cấp bin cần đưa `bin_id` vào balance và movement.
   6. Bổ sung discrepancy API/UI và quy trình xử lý sai lệch.
   7. Bổ sung retry/DLQ/idempotency cho Kafka consumption.
   8. Làm rõ ownership theo Site/Warehouse khi Outbound đang cộng tồn của mọi location `Storage` trong read model, chưa lọc theo Warehouse/Site.

