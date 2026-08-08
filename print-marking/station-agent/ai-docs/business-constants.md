# Business Constants — Print-Marking Edge Station

Used across the codebase for production workflows and payload evaluations. Never use hardcoded magic strings; reference the constants in `ND.UnifiedContracts.Constants.BusinessConstants` (or equivalent types on frontend).

---

## 1. Operation & Sequence Types

Used in the `operation.type` data tag within orders to determine the execution workflow sequence.

| Operation Code | Description | Sequence Path |
|---|---|---|
| `PRINT_ONLY` | Print-only operation | Printer Adapter → Vision Scanner |
| `MARK_ONLY` | Laser-marking only | Laser Adapter → Vision Scanner |
| `PRINT_AND_MARK` | Printing & engraving | Printer Adapter → Laser Adapter → Vision Scanner |
| `VERIFY_ONLY` | Vision-only inspection | Vision Scanner |
| `REWORK` | Re-executing failed job | Runs based on rework recipe |

---

## 2. Marking Types

Used in `marking.type` tag within the Gateway order payload.

- **`LASER_ETCHING`**: Standard laser surface engraving.
- **`LASER_DOT_PEEN`**: Mechanical dot impact marking.
- **`LASER_SERIALIZATION`**: Automated serial number generation and engraving.
- **`LASER_QR_MARKING`**: Engraves scannable 2D QR codes.
- **`LASER_BARCODE_MARKING`**: Engraves scannable 1D barcodes.

---

## 3. Print Types

Used in `print.type` tag within the Gateway order payload.

- **`LABEL_PRINT`**: Standard label template execution.
- **`QR_LABEL`**: Label focusing primarily on a QR code.
- **`BARCODE_LABEL`**: Label focusing on a 1D barcode.
- **`PRODUCT_LABEL`**: Thermal label applied directly onto the item.
- **`PACKAGING_LABEL`**: Large carton label for shipping packs.

---

## 4. Quality Control & Verification States

Represents outcomes of the machine vision QC check on serials, barcodes, and layouts.

- **`VERIFIED_PASS`**: Vision scan checks successfully match expected values. The item is approved.
- **`VERIFIED_FAIL`**: Mismatch or unreadable print detected. Production halt; operator action required.
- **`VERIFIED_RETRY`**: Scan could not be completed due to lighting or camera errors. Triggers auto-retry.
- **`VERIFIED_BYPASS`**: QC check skipped by a supervisor. Logged with user ID, timestamps, and reason codes.
