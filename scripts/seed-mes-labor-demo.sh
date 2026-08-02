#!/usr/bin/env bash
set -euo pipefail

# Idempotent MES labor demo seed. It only inserts/updates master-data fixtures;
# it does not truncate employees, shifts, or schedules.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT_DIR/infra/docker-compose.yml")

"${COMPOSE[@]}" exec -T mes-master-data-db psql -v ON_ERROR_STOP=1 -U mes_master_data_user -d mes_master_data_db <<'SQL'
BEGIN;

DO $$
DECLARE
  v_system_user CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  site_id UUID;
  shift_a UUID;
  shift_b UUID;
  shift_c UUID;
  wc_mixing UUID;
  wc_cutting UUID;
  wc_mold UUID;
  wc_qc UUID;
  skill_mix UUID;
  skill_vulcan UUID;
  skill_qc UUID;
  v_employee_id UUID;
  employee_code TEXT;
  employee_wc UUID;
  v_employee_skill UUID;
  employee_level TEXT;
  employee_index INTEGER;
  schedule_shift UUID;
  schedule_date DATE;
  schedule_status TEXT;
BEGIN
  SELECT master_id INTO site_id FROM md_site WHERE code = 'SITE-KZ3' AND version_no = 1;
  SELECT master_id INTO shift_a FROM md_shift WHERE code = 'SHIFT-A' AND version_no = 1;
  SELECT master_id INTO wc_mixing FROM md_work_center WHERE code = 'WC-MIXING' AND version_no = 1;
  SELECT master_id INTO wc_cutting FROM md_work_center WHERE code = 'WC-CUTTING' AND version_no = 1;
  SELECT master_id INTO wc_mold FROM md_work_center WHERE code = 'WC-VULCAN-MOLD' AND version_no = 1;
  SELECT master_id INTO wc_qc FROM md_work_center WHERE code = 'WC-QC' AND version_no = 1;
  SELECT master_id INTO skill_mix FROM md_skill WHERE code = 'SK-EMP-MIX-MASTER' AND version_no = 1;
  SELECT master_id INTO skill_vulcan FROM md_skill WHERE code = 'SK-EMP-VULCAN-OPERATOR' AND version_no = 1;
  SELECT master_id INTO skill_qc FROM md_skill WHERE code = 'SK-EMP-INSPECTION' AND version_no = 1;

  IF site_id IS NULL OR shift_a IS NULL OR wc_mixing IS NULL OR wc_cutting IS NULL OR wc_mold IS NULL OR wc_qc IS NULL
     OR skill_mix IS NULL OR skill_vulcan IS NULL OR skill_qc IS NULL THEN
    RAISE EXCEPTION 'Base MES master data is missing; run mes-master-data-service seed first';
  END IF;

  INSERT INTO md_shift (code, name, version_no, lifecycle_status, site_id, start_time, end_time, crosses_midnight, created_by, approved_by, approved_at)
  VALUES
    ('SHIFT-B', 'Evening Shift', 1, 'Released', site_id, '16:00', '00:30', TRUE, v_system_user, v_system_user, NOW()),
    ('SHIFT-C', 'Night Shift', 1, 'Released', site_id, '00:00', '08:00', FALSE, v_system_user, v_system_user, NOW())
  ON CONFLICT (code, version_no) DO UPDATE SET site_id = EXCLUDED.site_id, start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time, crosses_midnight = EXCLUDED.crosses_midnight, lifecycle_status = 'Released';
  SELECT master_id INTO shift_b FROM md_shift WHERE code = 'SHIFT-B' AND version_no = 1;
  SELECT master_id INTO shift_c FROM md_shift WHERE code = 'SHIFT-C' AND version_no = 1;

  FOR employee_index IN 1..8 LOOP
    employee_code := format('EMP-%s', lpad(employee_index::TEXT, 3, '0'));
    employee_wc := CASE
      WHEN employee_index IN (1, 2) THEN wc_mixing
      WHEN employee_index IN (3, 4) THEN wc_cutting
      WHEN employee_index IN (5, 6) THEN wc_mold
      ELSE wc_qc
    END;
    INSERT INTO md_employee (code, name, version_no, lifecycle_status, site_id, default_work_center_id, employee_status, hired_date, created_by)
    VALUES (employee_code, format('Demo Employee %s', lpad(employee_index::TEXT, 2, '0')), 1, 'Released', site_id, employee_wc, 'Active', CURRENT_DATE - (employee_index * 120), v_system_user)
    ON CONFLICT (code, version_no) DO UPDATE SET site_id = EXCLUDED.site_id, default_work_center_id = EXCLUDED.default_work_center_id,
      employee_status = 'Active', lifecycle_status = 'Released';
    SELECT master_id INTO v_employee_id FROM md_employee WHERE code = employee_code AND version_no = 1;

    v_employee_skill := CASE WHEN employee_index IN (1, 2) THEN skill_mix WHEN employee_index IN (7, 8) THEN skill_qc ELSE skill_vulcan END;
    employee_level := CASE WHEN employee_index IN (1, 5, 7) THEN 'L3' WHEN employee_index IN (2, 6, 8) THEN 'L2' ELSE 'L1' END;
    INSERT INTO md_employee_skill (employee_id, skill_id, level, created_by)
    VALUES (v_employee_id, v_employee_skill, employee_level, v_system_user)
    ON CONFLICT (employee_id, skill_id) WHERE active_flag = TRUE AND effective_to IS NULL
    DO UPDATE SET level = EXCLUDED.level, updated_by = v_system_user, updated_at = NOW();

    schedule_shift := CASE WHEN employee_index IN (1, 3, 5, 7) THEN shift_a WHEN employee_index IN (2, 4, 6) THEN shift_b ELSE shift_c END;
    FOR schedule_date IN SELECT day::DATE FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE + 90, INTERVAL '1 day') AS day WHERE EXTRACT(ISODOW FROM day) BETWEEN 1 AND 5 LOOP
      schedule_status := CASE WHEN employee_index = 8 AND schedule_date = CURRENT_DATE + 1 THEN 'OnLeave' ELSE 'Scheduled' END;
    INSERT INTO md_employee_shift_schedule (employee_id, shift_id, work_center_id, schedule_date, schedule_status, created_by)
      VALUES (v_employee_id, schedule_shift, employee_wc, schedule_date, schedule_status, v_system_user)
      ON CONFLICT ON CONSTRAINT md_employee_shift_schedule_employee_id_schedule_date_key DO UPDATE SET shift_id = EXCLUDED.shift_id, work_center_id = EXCLUDED.work_center_id,
        schedule_status = EXCLUDED.schedule_status, updated_by = v_system_user, updated_at = NOW();
    END LOOP;
  END LOOP;
END $$;

COMMIT;

SELECT 'employees' AS fixture, COUNT(*) FROM md_employee WHERE code LIKE 'EMP-%'
UNION ALL SELECT 'shifts', COUNT(*) FROM md_shift WHERE code IN ('SHIFT-A', 'SHIFT-B', 'SHIFT-C')
UNION ALL SELECT 'work_calendar_weekdays', COUNT(*) FROM md_employee_shift_schedule s JOIN md_employee e ON e.master_id = s.employee_id WHERE e.code LIKE 'EMP-%';
SQL

echo "MES labor demo seed completed."
