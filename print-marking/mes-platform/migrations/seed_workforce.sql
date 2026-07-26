-- ═══════════════════════════════════════════════════════════════════════════════
-- MES Platform — Workforce Seed Mockup Data (Extended Version)
--
-- Seeds Departments, Workshops, Teams, Workers, Skills, Skill Matrix, Certificates
--
-- Run: docker exec -i mes-postgres psql -U mes -d mes_platform < migrations/seed_workforce.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Clear any existing mock records to avoid foreign key/unique conflicts on seed rebuild
DELETE FROM workforce_skill_matrix;
DELETE FROM workforce_certificates;
UPDATE workforce_teams SET leader_id = NULL;
UPDATE workforce_departments SET manager_id = NULL;
DELETE FROM workforce_workers;
DELETE FROM workforce_teams;
DELETE FROM workforce_workshops;
DELETE FROM workforce_departments;
DELETE FROM workforce_skills;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DEPARTMENTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_departments (id, code, name, description, status, created_at, updated_at) VALUES
    ('10000000-0000-0000-0000-000000000001', 'DEPT-PROD', 'Production Department', 'Core manufacturing and assembly department', 'active', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000002', 'DEPT-QA',   'Quality Department',      'Inspection, testing and quality compliance', 'active', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000003', 'DEPT-MAIN', 'Maintenance Department',  'Equipment repair, calibration and facility care', 'active', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000004', 'DEPT-WH',   'Warehouse Department',    'Material storage, inventory and dispatch control', 'active', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000005', 'DEPT-ENG',  'Engineering Department',  'Routing designs, technical setups and improvements', 'active', NOW(), NOW());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. WORKSHOPS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_workshops (id, department_id, code, name, factory, description, status, created_at, updated_at) VALUES
    ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'WS-ASM-A',  'Assembly Workshop A',  'Main Factory', 'Primary manual assembly line area', 'active', NOW(), NOW()),
    ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'WS-MCH-B',  'Machining Workshop B', 'Main Factory', 'CNC milling and drilling shop', 'active', NOW(), NOW()),
    ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'WS-LAB-A',  'Testing Lab Alpha',    'Main Factory', 'Cleanroom precision inspection lab', 'active', NOW(), NOW()),
    ('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'WS-REP-M',  'Main Repair Shop',     'Main Factory', 'Mechanical and electrical tools depot', 'active', NOW(), NOW()),
    ('11000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004', 'WS-DEP-C',  'Material Depot C',     'Main Factory', 'Raw material intake and warehouse staging', 'active', NOW(), NOW()),
    ('11000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000005', 'WS-DES-S',  'Design Office Suite',  'Main Factory', 'Technical blueprinting and CAD/CAM workshop', 'active', NOW(), NOW());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TEAMS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_teams (id, workshop_id, code, name, description, status, created_at, updated_at) VALUES
    ('12000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'TM-ASM-O',  'Assembly Team Orange',   'Fast assembly specialists', 'active', NOW(), NOW()),
    ('12000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'TM-ASM-B',  'Assembly Team Blue',     'Bulk module assembly experts', 'active', NOW(), NOW()),
    ('12000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'TM-CNC-C',  'CNC Machining Crew',     'Precision lathe operators', 'active', NOW(), NOW()),
    ('12000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000003', 'TM-QC-IN',  'Quality Check Team',     'Incoming parts inspection', 'active', NOW(), NOW()),
    ('12000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000004', 'TM-ELEC-M', 'Electrical Maintenance', 'High voltage and electronics repair', 'active', NOW(), NOW()),
    ('12000000-0000-0000-0000-000000000006', '11000000-0000-0000-0000-000000000005', 'TM-LOG-S',  'Logistics Staging Crew', 'In-factory material transit handlers', 'active', NOW(), NOW()),
    ('12000000-0000-0000-0000-000000000007', '11000000-0000-0000-0000-000000000006', 'TM-ENG-P',  'Process Engineering Team','Industrial routing design specialists', 'active', NOW(), NOW());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SKILLS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_skills (id, name, code, description, created_at, updated_at) VALUES
    ('20000000-0000-0000-0000-000000000001', 'Manual Assembly',    'SKL-ASM-01',  'Competency in manual assembly methods', NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000002', 'CNC Programming',    'SKL-CNC-02',  'G-code scripting and tooling setup', NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000003', 'Quality Inspection', 'SKL-QC-03',   'Usage of micrometer and optical comparator', NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000004', 'Electrical Wiring',  'SKL-ELE-04',  'Wiring panels and reading schematics', NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000005', 'Soldering',          'SKL-SLD-05',  'High precision soldering skills', NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000006', 'Forklift Operations', 'SKL-FL-06',   'Certified heavy forklift operator inside factory floor', NOW(), NOW()),
    ('20000000-0000-0000-0000-000000000007', 'CAD modeling',       'SKL-CAD-07',  'Drafting parts routing models using SolidWorks', NOW(), NOW());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. WORKERS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_workers (
    id, first_name, last_name, email, phone, employee_code, employee_number, avatar, gender, birthday, address, employment_date, department_id, workshop_id, team_id, position, status, availability, notes, created_at, updated_at
) VALUES
    (
        '50000000-0000-0000-0000-000000000001', 'Van', 'Hoa', 
        'vanhoa@mes-platform.com', '0912345678', 'EMP-001', '20250001', '', 'male', '1990-05-15', '123 Hanoi Road', '2025-01-10T09:00:00Z',
        '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001',
        'Senior Assembler', 'active', 'available', 'Certified precision assembly leader', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000002', 'Bui', 'Duy', 
        'buiduy@mes-platform.com', '0987654321', 'EMP-002', '20250002', '', 'male', '1992-08-20', '456 Saigon Blvd', '2025-01-12T09:00:00Z',
        '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001',
        'Line Operator', 'active', 'available', 'Soldering expert', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000003', 'Nguyen', 'Minh', 
        'minh.nguyen@mes-platform.com', '0901112222', 'EMP-003', '20250003', '', 'male', '1995-12-05', '789 Da Nang St', '2025-02-01T09:00:00Z',
        '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002',
        'Assembler', 'active', 'available', '', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000004', 'Tran', 'Anh', 
        'anh.tran@mes-platform.com', '0903334444', 'EMP-004', '20250004', '', 'female', '1988-03-30', '101 Hai Phong St', '2025-01-05T09:00:00Z',
        '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000003',
        'CNC Machinist', 'active', 'available', 'Expert G-Code programmer', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000005', 'Le', 'Hoang', 
        'hoang.le@mes-platform.com', '0905556666', 'EMP-005', '20250005', '', 'male', '1991-07-22', '202 Can Tho Road', '2025-03-15T09:00:00Z',
        '10000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000004',
        'QA Inspector', 'active', 'available', 'Precision calibration spec', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000006', 'Pham', 'Tuan', 
        'tuan.pham@mes-platform.com', '0907778888', 'EMP-006', '20250006', '', 'male', '1987-11-14', '303 Nha Trang Rd', '2025-01-20T09:00:00Z',
        '10000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000004', '12000000-0000-0000-0000-000000000005',
        'Maintenance Technician', 'active', 'available', 'Licensed electrician', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000007', 'Hoang', 'Nhat', 
        'nhat.hoang@mes-platform.com', '0908889999', 'EMP-007', '20250007', '', 'male', '1994-09-18', '404 Vinh City', '2025-04-01T09:00:00Z',
        '10000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000005', '12000000-0000-0000-0000-000000000006',
        'Forklift Operator', 'active', 'available', 'Heavy machinery certified', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000008', 'Dinh', 'Quoc', 
        'quoc.dinh@mes-platform.com', '0902223333', 'EMP-008', '20250008', '', 'male', '1989-01-25', '505 Hue City', '2025-01-08T09:00:00Z',
        '10000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000006', '12000000-0000-0000-0000-000000000007',
        'CAD Engineer', 'active', 'available', 'SolidWorks expert', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000009', 'Ngo', 'Linh', 
        'linh.ngo@mes-platform.com', '0904445555', 'EMP-009', '20250009', '', 'female', '1996-04-12', '606 Bien Hoa St', '2025-05-10T09:00:00Z',
        '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001',
        'Line Operator', 'active', 'available', '', NOW(), NOW()
    ),
    (
        '50000000-0000-0000-0000-000000000010', 'Vu', 'Thao', 
        'thao.vu@mes-platform.com', '0906667777', 'EMP-010', '20250010', '', 'female', '1993-02-28', '707 Vung Tau City', '2025-02-18T09:00:00Z',
        '10000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000004',
        'QA Senior Inspector', 'active', 'available', 'Cleanroom controller', NOW(), NOW()
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ORG STRUCT LEADER / MANAGER UPDATES
-- ─────────────────────────────────────────────────────────────────────────────
-- Set Production Department Manager to Van Hoa
UPDATE workforce_departments SET manager_id = '50000000-0000-0000-0000-000000000001' WHERE id = '10000000-0000-0000-0000-000000000001';
-- Set Quality Department Manager to Vu Thao
UPDATE workforce_departments SET manager_id = '50000000-0000-0000-0000-000000000010' WHERE id = '10000000-0000-0000-0000-000000000002';

-- Set Assembly Team Orange Leader to Van Hoa
UPDATE workforce_teams SET leader_id = '50000000-0000-0000-0000-000000000001' WHERE id = '12000000-0000-0000-0000-000000000001';
-- Set CNC Machining Crew Leader to Tran Anh
UPDATE workforce_teams SET leader_id = '50000000-0000-0000-0000-000000000004' WHERE id = '12000000-0000-0000-0000-000000000003';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SKILL MATRIX
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_skill_matrix (worker_id, skill_id, proficiency_level, updated_at) VALUES
    ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, NOW()), -- Van Hoa: Expert Assembly
    ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 3, NOW()), -- Van Hoa: Advanced Soldering
    ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 3, NOW()), -- Bui Duy: Advanced Assembly
    ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 2, NOW()), -- Nguyen Minh: Intermediate Assembly
    ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 4, NOW()), -- Tran Anh: Expert CNC Programming
    ('50000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 3, NOW()), -- Le Hoang: Advanced Quality Inspection
    ('50000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', 4, NOW()), -- Pham Tuan: Expert Electrical Wiring
    ('50000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000006', 4, NOW()), -- Hoang Nhat: Forklift Operations
    ('50000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000007', 3, NOW()), -- Dinh Quoc: CAD Modeling
    ('50000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 3, NOW()), -- Ngo Linh: Advanced Assembly
    ('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000003', 4, NOW()); -- Vu Thao: Expert Quality Inspection

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CERTIFICATES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO workforce_certificates (
    id, worker_id, name, issuing_authority, certificate_number, issued_at, expires_at, document_url, created_at, updated_at
) VALUES
    (
        '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 
        'IPC-A-610 Electronics Solder Cert', 'IPC Standard Assoc', 'CERT-IPC-100223', 
        NOW() - INTERVAL '1 year', NOW() + INTERVAL '2 years', 'http://files.mes.local/certs/100223.pdf',
        NOW(), NOW()
    ),
    (
        '60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', 
        'Fanuc CNC Programmer Certificate', 'Fanuc Robotics Academy', 'CERT-CNC-509923', 
        NOW() - INTERVAL '6 months', NOW() + INTERVAL '18 months', 'http://files.mes.local/certs/509923.pdf',
        NOW(), NOW()
    ),
    (
        '60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000007', 
        'Forklift Safety Operation License', 'Vietnam safety standards', 'CERT-FL-4001', 
        NOW() - INTERVAL '3 months', NOW() + INTERVAL '9 months', 'http://files.mes.local/certs/4001.pdf',
        NOW(), NOW()
    );

COMMIT;
