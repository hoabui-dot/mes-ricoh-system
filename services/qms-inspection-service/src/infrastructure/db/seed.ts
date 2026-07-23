import type { Pool } from 'pg';

export async function seedQmsInspection(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO qms_defect_code (defect_code, defect_name, defect_category)
    VALUES
      ('SURF-CRACK', '{"vi":"Nứt bề mặt","en":"Surface crack","ja":"表面クラック","ko":"표면 균열"}', 'Critical'),
      ('DIM-OUT', '{"vi":"Sai kích thước","en":"Out of dimension","ja":"寸法不良","ko":"치수 불량"}', 'Major'),
      ('VIS-MARK', '{"vi":"Vết ngoại quan","en":"Visual mark","ja":"外観痕","ko":"외관 자국"}', 'Minor')
    ON CONFLICT (defect_code) DO UPDATE SET defect_name = EXCLUDED.defect_name, defect_category = EXCLUDED.defect_category, updated_at = NOW()
  `);
}
