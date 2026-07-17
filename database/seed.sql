-- ============================================================
--  SPE System — Seed Data  (idempotent: safe to re-run)
--  Run AFTER schema.sql
-- ============================================================

-- ============================================================
-- GRADE THRESHOLDS
-- ============================================================
-- Matches src/constants.js getGrade() exactly (5-grade scheme incl. F) —
-- this used to be a stale 4-grade version with different boundaries.
INSERT INTO grade_thresholds (grade, min_score, max_score, label_th, label_en, color_hex) VALUES
  ('A', 90,    100,   'ผ่านการรับรอง',    'Approved',             '#1b5e20'),
  ('B', 80,    89.99, 'ผ่านเงื่อนไข',     'Conditional',          '#1565c0'),
  ('C', 70,    79.99, 'ต้องปรับปรุง',     'Improvement Required', '#e65100'),
  ('D', 60,    69.99, 'ไม่ผ่าน — ระงับ',  'Suspended',            '#b71c1c'),
  ('F',  0,    59.99, 'ไม่ผ่าน — ตัดออก', 'Disqualified',         '#4a0000')
ON CONFLICT (grade) DO UPDATE SET
  min_score = EXCLUDED.min_score,
  max_score = EXCLUDED.max_score,
  label_th  = EXCLUDED.label_th,
  label_en  = EXCLUDED.label_en,
  color_hex = EXCLUDED.color_hex;

-- ============================================================
-- DEPARTMENTS
-- ============================================================
INSERT INTO departments (code, name_th, name_en) VALUES
  ('DEPT-01', 'ฝ่ายจัดซื้อ', 'Procurement'),
  ('DEPT-02', 'ฝ่ายการเงิน', 'Finance'),
  ('DEPT-03', 'ฝ่ายวิศวะ',   'Engineering'),
  ('DEPT-04', 'อื่นๆ',       'Other')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- JOB TITLES
-- ============================================================
INSERT INTO job_titles (code, name_th, name_en) VALUES
  ('JB-001', 'จัดซื้อวัสดุสำนักงาน', 'Office Supply Procurement'),
  ('JB-002', 'จัดซื้ออุปกรณ์ IT',    'IT Equipment Procurement'),
  ('JB-003', 'จัดซื้อวัตถุดิบ',       'Raw Material Procurement'),
  ('JB-004', 'อื่นๆ',                 'Other')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- EMPLOYEES
-- ============================================================
INSERT INTO employees (employee_id, full_name, department_id, job_title_id, role) VALUES
  ('EMP-001', 'สมชาย ใจดี',     (SELECT id FROM departments WHERE code='DEPT-01'), (SELECT id FROM job_titles WHERE code='JB-001'), 'USER'),
  ('EMP-002', 'สมหญิง รักงาน',  (SELECT id FROM departments WHERE code='DEPT-01'), (SELECT id FROM job_titles WHERE code='JB-002'), 'USER'),
  ('EMP-003', 'ประยุทธ์ มั่นคง', (SELECT id FROM departments WHERE code='DEPT-02'), (SELECT id FROM job_titles WHERE code='JB-003'), 'USER'),
  ('EMP-004', 'วิมล สุขใจ',      (SELECT id FROM departments WHERE code='DEPT-03'), (SELECT id FROM job_titles WHERE code='JB-001'), 'USER'),
  ('GCP-001', 'ธนา จัดซื้อ',    (SELECT id FROM departments WHERE code='DEPT-01'), (SELECT id FROM job_titles WHERE code='JB-001'), 'GCP'),
  ('GCP-002', 'นภา ประสานงาน',  (SELECT id FROM departments WHERE code='DEPT-01'), (SELECT id FROM job_titles WHERE code='JB-002'), 'GCP')
ON CONFLICT (employee_id) DO NOTHING;

-- ============================================================
-- SUPPLIERS
-- ============================================================
INSERT INTO suppliers (vendor_code, supplier_name, product_type) VALUES
  ('SUP-001', 'ABC Supply Co., Ltd.',       'goods'),
  ('SUP-002', 'XYZ Services Co., Ltd.',     'services'),
  ('SUP-003', 'TechParts International',    'goods'),
  ('SUP-004', 'Global Logistics Co., Ltd.', 'both'),
  ('SUP-005', 'Prime Materials Co., Ltd.',  'goods')
ON CONFLICT (vendor_code) DO NOTHING;

-- ============================================================
-- EMPLOYEE–SUPPLIER PERMISSIONS
-- ============================================================
INSERT INTO employee_supplier_permissions (employee_id, supplier_id)
SELECT e.id, s.id
  FROM employees e, suppliers s
 WHERE e.role = 'GCP'
ON CONFLICT (employee_id, supplier_id) DO NOTHING;

INSERT INTO employee_supplier_permissions (employee_id, supplier_id)
SELECT e.id, s.id
  FROM employees e
  JOIN suppliers s ON s.vendor_code IN ('SUP-001','SUP-002','SUP-003')
 WHERE e.employee_id IN ('EMP-001','EMP-002')
ON CONFLICT (employee_id, supplier_id) DO NOTHING;

INSERT INTO employee_supplier_permissions (employee_id, supplier_id)
SELECT e.id, s.id
  FROM employees e
  JOIN suppliers s ON s.vendor_code IN ('SUP-004','SUP-005')
 WHERE e.employee_id IN ('EMP-003','EMP-004')
ON CONFLICT (employee_id, supplier_id) DO NOTHING;

-- ============================================================
-- PRE / POST / FUNCTION MODULE CRITERIA — intentionally NOT seeded here.
-- evaluation_main_criteria / evaluation_sub_criteria rows for
-- criteria_set IN ('pre', 'post', 'pre_m1'..'pre_m7', 'post_m1'..'post_m7')
-- are seeded automatically on every backend startup, from the single
-- source of truth shared/criteria-data.json — see
-- backend/utils/seedCriteriaFromConstants.ts (called from server.ts
-- before app.listen). A hand-written copy here would just drift from
-- that file over time the same way the old CAT1/CAT2 'legacy'
-- placeholder rows did (removed 2026-07-17 — used stale pre-rename
-- codes '1.1'/'2.1'/etc. and were never read by any route).
-- Fresh install: run schema.sql + seed.sql, then start the backend once
-- to populate these tables.
-- ============================================================

-- ============================================================
-- SERVICE EVALUATION CRITERIA (cross-evaluation #3/#4 — see
-- database/CROSS_EVALUATION_SPEC.md section 3.4)
-- 4 starter items, criteria_set = 'service' — meant to be edited/
-- expanded later via the existing Criteria Editor, same as any
-- other criteria_set.
-- ============================================================
INSERT INTO evaluation_main_criteria (code, name_th, name_en, total_weight, display_order) VALUES
  ('SVC', 'การให้บริการ', 'Service', 100, 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO evaluation_sub_criteria (category_id, code, name_th, name_en, detail_th, default_weight, display_order, criteria_set)
VALUES
  (
    (SELECT id FROM evaluation_main_criteria WHERE code = 'SVC'),
    'SVC1.1', 'ความรวดเร็วในการตอบสนอง', 'Responsiveness',
    'ความรวดเร็วในการตอบกลับและดำเนินการเมื่อมีการติดต่อหรือร้องขอ',
    25, 1, 'service'
  ),
  (
    (SELECT id FROM evaluation_main_criteria WHERE code = 'SVC'),
    'SVC1.2', 'การสื่อสารและความชัดเจน', 'Communication',
    'ความชัดเจน ถูกต้อง และสม่ำเสมอในการสื่อสารระหว่างการทำงานร่วมกัน',
    25, 2, 'service'
  ),
  (
    (SELECT id FROM evaluation_main_criteria WHERE code = 'SVC'),
    'SVC1.3', 'ความเป็นมืออาชีพ', 'Professionalism',
    'มารยาท ความสุภาพ และความเป็นมืออาชีพในการทำงานร่วมกัน',
    25, 3, 'service'
  ),
  (
    (SELECT id FROM evaluation_main_criteria WHERE code = 'SVC'),
    'SVC1.4', 'ความสามารถในการแก้ไขปัญหา', 'Problem-Solving',
    'ความสามารถในการรับมือและแก้ไขปัญหาที่เกิดขึ้นระหว่างการทำงานร่วมกัน',
    25, 4, 'service'
  )
ON CONFLICT (criteria_set, code) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_sub_criteria, (VALUES
  (1, 'ไม่ตอบสนองหรือใช้เวลานานมาก'),
  (2, 'ตอบสนองช้า'),
  (3, 'ตอบสนองปานกลาง'),
  (4, 'ตอบสนองเร็ว'),
  (5, 'ตอบสนองทันที')
) AS t(level, txt)
WHERE evaluation_sub_criteria.criteria_set = 'service' AND evaluation_sub_criteria.code = 'SVC1.1'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_sub_criteria, (VALUES
  (1, 'สื่อสารไม่ชัดเจน เข้าใจผิดบ่อยครั้ง'),
  (2, 'สื่อสารพอเข้าใจได้ แต่ไม่สม่ำเสมอ'),
  (3, 'สื่อสารชัดเจนในระดับปานกลาง'),
  (4, 'สื่อสารชัดเจน ครบถ้วนเกือบทุกครั้ง'),
  (5, 'สื่อสารชัดเจน ถูกต้อง และสม่ำเสมอทุกครั้ง')
) AS t(level, txt)
WHERE evaluation_sub_criteria.criteria_set = 'service' AND evaluation_sub_criteria.code = 'SVC1.2'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_sub_criteria, (VALUES
  (1, 'ขาดความเป็นมืออาชีพอย่างชัดเจน'),
  (2, 'มีข้อบกพร่องด้านมารยาท/ความสุภาพบ่อยครั้ง'),
  (3, 'เป็นมืออาชีพในระดับปานกลาง'),
  (4, 'เป็นมืออาชีพเกือบทุกครั้ง'),
  (5, 'เป็นมืออาชีพอย่างสม่ำเสมอทุกครั้ง')
) AS t(level, txt)
WHERE evaluation_sub_criteria.criteria_set = 'service' AND evaluation_sub_criteria.code = 'SVC1.3'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_sub_criteria, (VALUES
  (1, 'ไม่สามารถแก้ไขปัญหาได้ หรือเพิกเฉย'),
  (2, 'แก้ไขปัญหาได้ช้า ต้องติดตามหลายครั้ง'),
  (3, 'แก้ไขปัญหาได้ในระดับปานกลาง'),
  (4, 'แก้ไขปัญหาได้ดี ใช้เวลาพอสมควร'),
  (5, 'แก้ไขปัญหาได้รวดเร็วและมีประสิทธิภาพ')
) AS t(level, txt)
WHERE evaluation_sub_criteria.criteria_set = 'service' AND evaluation_sub_criteria.code = 'SVC1.4'
ON CONFLICT (criterion_id, level) DO NOTHING;
