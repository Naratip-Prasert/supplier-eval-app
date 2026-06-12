-- ============================================================
--  SPE System — Seed Data  (idempotent: safe to re-run)
--  Run AFTER schema.sql
-- ============================================================

-- ============================================================
-- GRADE THRESHOLDS
-- ============================================================
INSERT INTO grade_thresholds (grade, min_score, max_score, label_th, label_en, color_hex) VALUES
  ('A', 81,  100, 'ดีมาก',       'Excellent',          '#2e7d32'),
  ('B', 61,   80, 'ดี',           'Good',               '#558b2f'),
  ('C', 51,   60, 'พอใช้',        'Acceptable',         '#f57f17'),
  ('D',  0,   50, 'ต้องปรับปรุง', 'Needs Improvement',  '#c62828')
ON CONFLICT (grade) DO NOTHING;

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
  ('EMP-001', 'สมชาย ใจดี',     (SELECT id FROM departments WHERE code='DEPT-01'), (SELECT id FROM job_titles WHERE code='JB-001'), 'BU'),
  ('EMP-002', 'สมหญิง รักงาน',  (SELECT id FROM departments WHERE code='DEPT-01'), (SELECT id FROM job_titles WHERE code='JB-002'), 'BU'),
  ('EMP-003', 'ประยุทธ์ มั่นคง', (SELECT id FROM departments WHERE code='DEPT-02'), (SELECT id FROM job_titles WHERE code='JB-003'), 'BU'),
  ('EMP-004', 'วิมล สุขใจ',      (SELECT id FROM departments WHERE code='DEPT-03'), (SELECT id FROM job_titles WHERE code='JB-001'), 'BU'),
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
-- EVALUATION CATEGORIES
-- ============================================================
INSERT INTO evaluation_categories (code, name_th, name_en, total_weight, display_order) VALUES
  ('CAT1', 'ด้านคุณภาพสินค้า/บริการ', 'Quality Performance', 40, 1),
  ('CAT2', 'ด้านการส่งมอบ',           'Delivery Performance', 30, 2)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- EVALUATION CRITERIA
-- ============================================================
INSERT INTO evaluation_criteria (category_id, code, name_th, name_en, detail_th, default_weight, display_order)
VALUES
  (
    (SELECT id FROM evaluation_categories WHERE code = 'CAT1'),
    '1.1', 'อัตราการ Reject/Claim ที่ลูกค้าแจ้งกลับ', 'Rejection/Claim Rate',
    'วัดสัดส่วนของสินค้าหรือบริการที่ถูกปฏิเสธ (Reject) หรือถูกเคลม (Claim) จากจำนวนที่จัดส่งทั้งหมดในรอบการประเมินนั้นๆ',
    14, 1
  ),
  (
    (SELECT id FROM evaluation_categories WHERE code = 'CAT1'),
    '1.2', 'ความสมบูรณ์ของเอกสารกำกับสินค้า (COA, Lot No., Label)', 'Document Completeness',
    'ตรวจสอบความถูกต้อง ครบถ้วน และความชัดเจนของเอกสารที่แนบมาพร้อมกับสินค้า เช่น ใบรายงานผลการวิเคราะห์ หมายเลขล็อตผลิตและป้ายบ่งชี้สินค้า',
    8, 2
  ),
  (
    (SELECT id FROM evaluation_categories WHERE code = 'CAT1'),
    '1.3', 'ความรวดเร็วในการแก้ไขปัญหาและตอบสนองต่อ Complaint', 'Problem Response Speed',
    'ความเร็วและประสิทธิภาพในการเข้ามาจัดการปัญหาของซัพพลายเออร์เมื่อมีสินค้าเสียหาย การเปลี่ยนสินค้าหรือการส่งรายงานวิเคราะห์หาสาเหตุ',
    8, 3
  ),
  (
    (SELECT id FROM evaluation_categories WHERE code = 'CAT1'),
    '1.4', 'อัตราการ Reject/Claim ที่ลูกค้าแจ้งกลับ (ซ้ำ)', 'Repeat Rejection/Claim Rate',
    'วัดสัดส่วนของสินค้าหรือบริการที่ถูกปฏิเสธ (Reject) หรือถูกเคลม (Claim) ซ้ำ จากจำนวนที่จัดส่งทั้งหมดในรอบการประเมินนั้นๆ',
    10, 4
  ),
  (
    (SELECT id FROM evaluation_categories WHERE code = 'CAT2'),
    '2.1', 'ความตรงต่อเวลาในการส่งมอบ', 'On-Time Delivery',
    'วัดสัดส่วนของการส่งมอบสินค้าหรือบริการตรงตามกำหนดเวลาที่ตกลงไว้',
    15, 1
  ),
  (
    (SELECT id FROM evaluation_categories WHERE code = 'CAT2'),
    '2.2', 'ความครบถ้วนของปริมาณสินค้า', 'Order Quantity Completeness',
    'ตรวจสอบความครบถ้วนของปริมาณสินค้าที่จัดส่งเทียบกับใบสั่งซื้อ',
    15, 2
  )
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SCORE LEVEL DESCRIPTIONS (1-5 per criterion)
-- ============================================================

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_criteria, (VALUES
  (1, 'Claim > 3 ครั้งหรือมีของเสียที่ส่งผลกระทบการผลิต'),
  (2, 'Claim 3 ครั้ง'),
  (3, 'Claim 2 ครั้ง ไม่มีผลกระทบรายแรง'),
  (4, 'Claim เล็กน้อย 1 ครั้ง แก้ไขได้รวดเร็ว'),
  (5, 'ไม่มี Claim ในรอบประเมิน')
) AS t(level, txt)
WHERE evaluation_criteria.code = '1.1'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_criteria, (VALUES
  (1, 'ขาดเอกสารสำคัญบ่อยครั้ง >3 ครั้ง/รอบ'),
  (2, 'ขาดเอกสาร 2-3 ครั้ง/รอบ'),
  (3, 'ขาดบางครั้ง 1 ครั้ง/รอบ แต่แก้ไขได้'),
  (4, 'เอกสารครบเกือบทุกครั้ง มีข้อผิดพลาดเล็กน้อย'),
  (5, 'เอกสารครบถ้วนสมบูรณ์ทุกครั้ง')
) AS t(level, txt)
WHERE evaluation_criteria.code = '1.2'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_criteria, (VALUES
  (1, 'ไม่ตอบสนองหรือใช้เวลานานมาก >7 วัน'),
  (2, 'ตอบสนองช้า 5-7 วัน'),
  (3, 'ตอบสนองปานกลาง 3-5 วัน'),
  (4, 'ตอบสนองเร็ว 1-3 วัน'),
  (5, 'ตอบสนองทันทีภายใน 24 ชั่วโมง')
) AS t(level, txt)
WHERE evaluation_criteria.code = '1.3'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_criteria, (VALUES
  (1, 'Claim ซ้ำ > 3 ครั้ง ส่งผลกระทบการผลิต'),
  (2, 'Claim ซ้ำ 3 ครั้ง'),
  (3, 'Claim ซ้ำ 2 ครั้ง ไม่มีผลกระทบรายแรง'),
  (4, 'Claim ซ้ำเล็กน้อย 1 ครั้ง แก้ไขได้รวดเร็ว'),
  (5, 'ไม่มี Claim ซ้ำในรอบประเมิน')
) AS t(level, txt)
WHERE evaluation_criteria.code = '1.4'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_criteria, (VALUES
  (1, 'ส่งล่าช้า >3 ครั้ง'),
  (2, 'ส่งล่าช้า 3 ครั้ง'),
  (3, 'ส่งล่าช้า 2 ครั้ง'),
  (4, 'ส่งล่าช้า 1 ครั้ง'),
  (5, 'ส่งตรงเวลาทุกครั้ง')
) AS t(level, txt)
WHERE evaluation_criteria.code = '2.1'
ON CONFLICT (criterion_id, level) DO NOTHING;

INSERT INTO score_level_descriptions (criterion_id, level, description)
SELECT id, level, txt FROM evaluation_criteria, (VALUES
  (1, 'ขาดปริมาณ >3 ครั้ง'),
  (2, 'ขาดปริมาณ 3 ครั้ง'),
  (3, 'ขาดปริมาณ 2 ครั้ง'),
  (4, 'ขาดปริมาณ 1 ครั้ง'),
  (5, 'ครบถ้วนทุกครั้ง')
) AS t(level, txt)
WHERE evaluation_criteria.code = '2.2'
ON CONFLICT (criterion_id, level) DO NOTHING;
