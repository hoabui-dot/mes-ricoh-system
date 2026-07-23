ALTER TABLE wo_material_requirement
  ADD COLUMN IF NOT EXISTS stock_check_detail jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_wo_material_requirement_stock_check_status'
  ) THEN
    ALTER TABLE wo_material_requirement
      ADD CONSTRAINT chk_wo_material_requirement_stock_check_status
      CHECK (stock_check_status IN ('NotChecked', 'Staged', 'Shortage'));
  END IF;
END $$;
