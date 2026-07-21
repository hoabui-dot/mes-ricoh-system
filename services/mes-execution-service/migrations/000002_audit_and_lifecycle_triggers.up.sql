CREATE OR REPLACE FUNCTION fn_stamp_audit_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_user_id UUID;
BEGIN
  BEGIN v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN v_user_id := '00000000-0000-0000-0000-000000000001'::UUID; END;
  IF v_user_id IS NULL THEN v_user_id := '00000000-0000-0000-0000-000000000001'::UUID; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW(); NEW.updated_at := NOW();
    NEW.created_by := v_user_id; NEW.updated_by := v_user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at; NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW(); NEW.updated_by := v_user_id;
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_wo_operation ON wo_operation;
DROP TRIGGER IF EXISTS trg_audit_wo_material_requirement ON wo_material_requirement;

DROP TRIGGER IF EXISTS trg_audit_wo_header ON wo_header;
CREATE TRIGGER trg_audit_wo_header BEFORE INSERT OR UPDATE ON wo_header FOR EACH ROW EXECUTE FUNCTION fn_stamp_audit_fields();
