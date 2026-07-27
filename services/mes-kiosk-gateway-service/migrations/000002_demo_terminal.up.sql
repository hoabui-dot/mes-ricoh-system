INSERT INTO terminal (terminal_id, terminal_code, site_id, work_center_id, status)
VALUES ('a1000000-0000-0000-0000-000000000007', 'KIOSK-DEMO-01', '9f785cbd-98aa-4b2c-98ef-287a189e760c', '40000000-0000-0000-0000-000000000004', 'OFFLINE')
ON CONFLICT (terminal_code) DO NOTHING;
