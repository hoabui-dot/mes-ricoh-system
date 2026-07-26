# Prompt: Refactor Label Template Seed Data (Cleanup + Recreate Vietnamese Templates)

## Objective

The current Label Template Management page already contains injected templates, but the content, naming convention, descriptions, categories, metadata, and business meaning do **not** match the actual manufacturing label standards required by the project.

Before making any changes, perform a **complete analysis of the existing codebase, database schema, seed scripts, import scripts, and Label Template Management module** to fully understand how label templates are currently managed.

**Do NOT blindly execute DELETE or INSERT statements.**

The implementation must be safe, idempotent, and fully verified before execution.

---

# Phase 1 — Analyze Current System

First, inspect the entire Label Template Management implementation.

Review:

- Database schema
- SQLite tables
- Entity models
- Seed scripts
- Import scripts
- Label Template API
- Versioning
- Default template logic
- Printer assignment logic
- Existing references
- Foreign keys
- Any production dependencies

Determine:

- How templates are identified
- How printers reference templates
- Whether TemplateId is referenced elsewhere
- Whether deletion is safe
- Whether soft delete exists
- Whether templates are imported through SQL or application code
- Whether duplicated template names are allowed
- How default templates are selected
- How versions are managed

Before generating any SQL, produce a short verification report describing:

- Current schema
- Existing relationships
- Safe cleanup strategy
- Risk analysis
- Migration strategy

Only continue after the analysis confirms the operation is safe.

---

# Phase 2 — Cleanup Existing Seed Data

The current injected templates are incorrect.

Remove every sample/demo template that does not belong to the official manufacturing template list.

Examples include (but are not limited to):

- Industrial Product QR Label
- Shelf / Rack Location Label
- Parent Rubber Sheet Label
- Child Rubber Sheet Label
- Roll / Material Reel Label
- Internal Production Label
- Shipping Label
- Inspection Label
- etc.

Cleanup must preserve:

- Database integrity
- Foreign keys
- Printer assignments (if necessary)
- Audit history (if applicable)

Never delete system configuration accidentally.

---

# Phase 3 — Create New Official Templates

Replace them with exactly these official templates.

**All names, descriptions, notes, and business terminology MUST remain in Vietnamese exactly as provided below.**

Do NOT translate template names.

---

## 1. Vị trí kho / kệ / ô chứa

Category

Kho

Barcode Type

Code 128 hoặc QR

Template Size

50 × 30 mm

Barcode Area

Barcode 40 × 12 mm

hoặc

QR 20 × 20 mm

Description

Tem định vị dùng để nhận diện vị trí lưu trữ trong kho, kệ hoặc ô chứa.

Note

Dán cố định tại kệ, ô kho.

---

## 2. Bó sắt / kiện sắt

Category

Thành phẩm

Barcode Type

Code 128

Template Size

100 × 60 mm

Barcode Area

Barcode 70 × 25 mm

Description

Tem nhận diện bó hoặc kiện sắt phục vụ quản lý kho và truy xuất.

Note

Nên có mã vật tư, lot, khối lượng.

---

## 3. Tấm sắt / cuộn sắt

Category

Nguyên vật liệu

Barcode Type

Code 128

Template Size

100 × 80 mm

hoặc

Thẻ treo 120 × 80 mm

Barcode Area

Barcode 80 × 30 mm

Description

Tem quản lý tấm hoặc cuộn sắt.

Note

Dùng tem PET hoặc thẻ treo vì bề mặt khó dán.

---

## 4. Pallet hàng

Category

Pallet

Barcode Type

Code 128 hoặc QR

Template Size

100 × 150 mm

Barcode Area

Barcode 80 × 35 mm

hoặc

QR 45 × 45 mm

Description

Tem nhận diện pallet hàng phục vụ xuất nhập kho.

Note

Dễ quét từ xa bằng PDA.

---

## 5. Tấm cao su lớn

Category

Tấm cao su

Barcode Type

QR Code

Template Size

80 × 50 mm

hoặc

100 × 60 mm

QR Size

35 × 35 mm

hoặc

40 × 40 mm

Description

Tem quản lý tấm cao su lớn.

Note

Quản lý mã tấm cha Parent Sheet ID.

---

## 6. Tấm cao su nhỏ sau khi cắt

Category

Tấm cao su

Barcode Type

QR Code

Template Size

35 × 22 mm

QR Size

15 × 15 mm

Description

Tem quản lý từng tấm cao su sau khi cắt.

Note

Mỗi tấm con có mã riêng.

---

## 7. Bán thành phẩm/WIP trong MES

Category

WIP

Barcode Type

QR Code

Template Size

60 × 40 mm

QR Size

30 × 30 mm

Description

Tem theo dõi bán thành phẩm trong quá trình sản xuất.

Note

Dùng để theo dõi theo công đoạn.

---

## 8. Phiếu cấp liệu / phiếu xuất kho

Category

WMS

Barcode Type

Code 128 + QR

Template Size

A5

hoặc

100 × 60 mm

Barcode Area

Barcode 70 × 25 mm

QR 30 × 30 mm

Description

Tem phục vụ cấp liệu và xuất kho.

Note

Dùng cho WMS cấp liệu sang MES.

---

# Phase 4 — Generate Safe Seed Script

After understanding the schema, generate a complete migration/seed script.

Requirements:

- Idempotent
- Transaction-based
- Rollback safe
- No duplicate templates
- Preserve Version field
- Preserve Published status
- Correct Default template
- Correct Categories
- Correct Notes
- Correct Description
- Correct Size
- Correct Barcode Type

The script should be executable multiple times safely.

---

# Phase 5 — Verify Everything

Before finishing, verify:

- Exactly 8 templates exist.
- No legacy demo templates remain.
- Categories are correct.
- Vietnamese names match 100%.
- Descriptions match.
- Notes match.
- Sizes match.
- Barcode types match.
- No duplicate template exists.
- Printer Assignment still works.
- Import/Export still works.
- Preview still works.
- Printing still works.
- Template Version remains valid.
- Published status remains correct.

Produce a final verification checklist confirming every item above.

Do not finish until every verification passes.
