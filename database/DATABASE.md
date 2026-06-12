# Database Documentation — Supplier Performance Evaluation System (SPE)

> PostgreSQL Schema v2.0 (Migrated from MongoDB)  
> Provider: Neon.tech (Free Tier, ap-southeast-1)

---

## สารบัญ

1. [ภาพรวม (Overview)](#1-ภาพรวม-overview)
2. [ER Diagram (Text)](#2-er-diagram-text)
3. [รายละเอียดตารางทั้งหมด](#3-รายละเอียดตารางทั้งหมด)
   - [departments](#31-departments)
   - [job_titles](#32-job_titles)
   - [employees](#33-employees)
   - [suppliers](#34-suppliers)
   - [employee_supplier_permissions](#35-employee_supplier_permissions)
   - [evaluation_categories](#36-evaluation_categories)
   - [evaluation_criteria](#37-evaluation_criteria)
   - [score_level_descriptions](#38-score_level_descriptions)
   - [evaluation_sessions](#39-evaluation_sessions)
   - [evaluations](#310-evaluations)
   - [evaluation_scores](#311-evaluation_scores)
   - [grade_thresholds](#312-grade_thresholds)
4. [Relationships ระหว่างตาราง](#4-relationships-ระหว่างตาราง)
5. [Functions & Triggers](#5-functions--triggers)
6. [Indexes](#6-indexes)
7. [การทำงานของระบบ (Business Flows)](#7-การทำงานของระบบ-business-flows)
8. [Seed Data เริ่มต้น](#8-seed-data-เริ่มต้น)
9. [Constraints & Business Rules](#9-constraints--business-rules)

---

## 1. ภาพรวม (Overview)

ระบบ SPE ใช้ PostgreSQL แบ่งออกเป็น **3 กลุ่มหลัก**:

| กลุ่ม | ตาราง | หน้าที่ |
|-------|-------|---------|
| **Master Data** | `departments`, `job_titles`, `employees`, `suppliers` | ข้อมูลอ้างอิงหลักของระบบ |
| **Permission** | `employee_supplier_permissions` | ควบคุมว่า BU คนไหนประเมิน Supplier ได้บ้าง |
| **Evaluation Config** | `evaluation_categories`, `evaluation_criteria`, `score_level_descriptions`, `grade_thresholds` | โครงสร้างแบบประเมินและเกณฑ์การให้คะแนน |
| **Evaluation Data** | `evaluation_sessions`, `evaluations`, `evaluation_scores` | ข้อมูลการประเมินจริง |

---

## 2. ER Diagram (Text)

```
departments ─────────────────┐
    │ (1)                     │
    │ has many                │
    ▼ (N)                     │
employees ◄──────────────────┘ (job_titles also links here)
    │ (1)
    │ has many
    ▼ (N)
employee_supplier_permissions ────────► suppliers
    (BU only; GCP bypasses this table)      │
                                            │ (1)
                                            │ has many
                                            ▼ (N)
                                   evaluation_sessions
                                            │ (1)
                                            │ has many
                                            ▼ (N)
                                       evaluations (BU | GCP)
                                            │ (1)
                                            │ has many
                                            ▼ (N)
                                     evaluation_scores
                                            │ (N)
                                            │ references
                                            ▼ (1)
                                    evaluation_criteria
                                            │ (N)
                                            │ belongs to
                                            ▼ (1)
                                   evaluation_categories
                                            │ (1)
                                            │ has many
                                            ▼ (N)
                                  score_level_descriptions

grade_thresholds  (standalone lookup — used by trigger)
```

---

## 3. รายละเอียดตารางทั้งหมด

---

### 3.1 `departments`

**หน้าที่**: Lookup table สำหรับชื่อแผนก ใช้ auto-fill เมื่อกรอก Employee ID

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated ด้วย `gen_random_uuid()` |
| `code` | VARCHAR(20) | UNIQUE NOT NULL | รหัสแผนก เช่น `DEPT-01` |
| `name_th` | VARCHAR(200) | NOT NULL | ชื่อแผนกภาษาไทย เช่น `ฝ่ายจัดซื้อ` |
| `name_en` | VARCHAR(200) | — | ชื่อแผนกภาษาอังกฤษ |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |

**Requirement ที่รองรับ**: Req 11 (Employee ID auto-fills department)

---

### 3.2 `job_titles`

**หน้าที่**: Lookup table สำหรับชื่องาน/ตำแหน่ง ใช้ auto-fill เมื่อกรอก Employee ID

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `code` | VARCHAR(20) | UNIQUE NOT NULL | รหัสชื่องาน เช่น `JB-001` |
| `name_th` | VARCHAR(300) | NOT NULL | ชื่องานภาษาไทย เช่น `จัดซื้อวัสดุสำนักงาน` |
| `name_en` | VARCHAR(300) | — | ชื่องานภาษาอังกฤษ |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |

**Requirement ที่รองรับ**: Req 11 (Employee ID auto-fills job name)

---

### 3.3 `employees`

**หน้าที่**: ตาราง master พนักงานทั้งหมด ใช้ validate รหัสพนักงานก่อนเริ่มประเมิน และระบุ role ว่าเป็น BU หรือ GCP

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `employee_id` | VARCHAR(20) | UNIQUE NOT NULL | รหัสพนักงาน เช่น `EMP-001`, `GCP-001` |
| `full_name` | VARCHAR(200) | NOT NULL | ชื่อ-นามสกุล |
| `department_id` | UUID | FK → `departments.id` | แผนกที่สังกัด (SET NULL ถ้าแผนกถูกลบ) |
| `job_title_id` | UUID | FK → `job_titles.id` | ตำแหน่งงาน (SET NULL ถ้าตำแหน่งถูกลบ) |
| `role` | VARCHAR(10) | CHECK IN ('BU','GCP','ADMIN') | บทบาท: BU = ผู้ใช้งาน, GCP = เจ้าหน้าที่จัดซื้อ |
| `is_active` | BOOLEAN | DEFAULT TRUE | ยังทำงานอยู่หรือไม่ |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่แก้ไขล่าสุด (auto-update ด้วย trigger) |

**Indexes**: `employee_id`, `role`

**Requirement ที่รองรับ**: Req 2 (validate employee ID), Req 11 (auto-fill dept + job)

---

### 3.4 `suppliers`

**หน้าที่**: ตาราง master ข้อมูล Supplier ใช้ validate Vendor Code และชื่อ Supplier

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `vendor_code` | VARCHAR(50) | UNIQUE NOT NULL | รหัสผู้ขาย เช่น `SUP-001` |
| `supplier_name` | VARCHAR(300) | NOT NULL | ชื่อบริษัท/ผู้ขาย |
| `product_type` | VARCHAR(20) | CHECK IN ('goods','services','both') | ประเภทสินค้า/บริการ |
| `is_active` | BOOLEAN | DEFAULT TRUE | ยังใช้งานอยู่หรือไม่ |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่แก้ไขล่าสุด (auto-update ด้วย trigger) |

**Indexes**: `vendor_code`, `supplier_name`

**Requirement ที่รองรับ**: Req 8 (validate vendor code + supplier name)

---

### 3.5 `employee_supplier_permissions`

**หน้าที่**: ตาราง Junction (Many-to-Many) ควบคุมสิทธิ์ว่า BU คนไหนสามารถประเมิน Supplier ใดได้บ้าง  
GCP ไม่ต้องใช้ตารางนี้ — GCP ประเมินได้ทุก Supplier

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `employee_id` | UUID | FK → `employees.id` ON DELETE CASCADE | พนักงาน BU |
| `supplier_id` | UUID | FK → `suppliers.id` ON DELETE CASCADE | Supplier ที่มีสิทธิ์ประเมิน |
| `granted_by` | UUID | FK → `employees.id` ON DELETE SET NULL | ผู้อนุมัติสิทธิ์ (ADMIN) |
| `granted_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่ให้สิทธิ์ |
| — | — | UNIQUE(employee_id, supplier_id) | ห้ามมีสิทธิ์ซ้ำ |

**Indexes**: `employee_id`, `supplier_id`

**Requirement ที่รองรับ**: Req 1 (BU สามารถประเมินได้เฉพาะ Supplier ที่ได้รับอนุญาต)

---

### 3.6 `evaluation_categories`

**หน้าที่**: หมวดหมู่หลักของแบบประเมิน เช่น ด้านคุณภาพ, ด้านการส่งมอบ

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `code` | VARCHAR(20) | UNIQUE NOT NULL | รหัสหมวด เช่น `CAT1`, `CAT2` |
| `name_th` | VARCHAR(200) | NOT NULL | ชื่อหมวดภาษาไทย |
| `name_en` | VARCHAR(200) | — | ชื่อหมวดภาษาอังกฤษ |
| `total_weight` | DECIMAL(5,2) | NOT NULL DEFAULT 0 | น้ำหนักรวมของหมวด (%) เช่น 40.00 |
| `display_order` | INTEGER | NOT NULL | ลำดับการแสดงผล |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |

---

### 3.7 `evaluation_criteria`

**หน้าที่**: หัวข้อประเมินแต่ละข้อภายในหมวดหมู่ มี `default_weight` ที่ผู้ประเมินสามารถแก้ไขได้ในแต่ละรอบ

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `category_id` | UUID | FK → `evaluation_categories.id` ON DELETE CASCADE | หมวดหมู่ที่สังกัด |
| `code` | VARCHAR(20) | UNIQUE NOT NULL | รหัสหัวข้อ เช่น `1.1`, `2.2` |
| `name_th` | VARCHAR(400) | NOT NULL | ชื่อหัวข้อภาษาไทย |
| `name_en` | VARCHAR(400) | — | ชื่อหัวข้อภาษาอังกฤษ |
| `detail_th` | TEXT | — | รายละเอียด/เกณฑ์การประเมินแบบเต็ม |
| `default_weight` | DECIMAL(5,2) | NOT NULL DEFAULT 0 | น้ำหนักเริ่มต้น (%) สามารถ override ได้ใน `evaluation_scores` |
| `display_order` | INTEGER | NOT NULL | ลำดับการแสดงผล |
| `is_active` | BOOLEAN | DEFAULT TRUE | ใช้งานอยู่หรือไม่ |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |

**Requirement ที่รองรับ**: Req 9 (configurable weights per evaluation item)

---

### 3.8 `score_level_descriptions`

**หน้าที่**: คำอธิบายสำหรับคะแนนระดับ 1-5 ของแต่ละหัวข้อประเมิน เพื่อให้ผู้ประเมินเข้าใจว่าระดับนั้นๆ หมายถึงอะไร

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `criterion_id` | UUID | FK → `evaluation_criteria.id` ON DELETE CASCADE | หัวข้อที่เป็นเจ้าของ |
| `level` | INTEGER | CHECK BETWEEN 1 AND 5 | ระดับคะแนน |
| `description` | TEXT | NOT NULL | คำอธิบายระดับนั้น เช่น "ไม่มี Claim ในรอบประเมิน" |
| — | — | UNIQUE(criterion_id, level) | แต่ละหัวข้อมีคำอธิบายได้แค่ 1 ต่อระดับ |

**ตัวอย่าง**: หัวข้อ `1.1` มี 5 แถว (level 1-5) อธิบายความหมายของแต่ละคะแนน

---

### 3.9 `evaluation_sessions`

**หน้าที่**: หนึ่ง "รอบการประเมิน" ของ Supplier หนึ่งราย กลุ่ม BU evaluation + GCP evaluation เข้าไว้ด้วยกัน เพื่อคำนวณ `final_score` เป็นค่าเฉลี่ย

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `supplier_id` | UUID | FK → `suppliers.id` | Supplier ที่ถูกประเมิน |
| `eval_type` | VARCHAR(20) | CHECK IN ('new_supplier','re_evaluation') | ประเภท: ซัพพลายเออร์ใหม่ / ประเมินซ้ำ |
| `period` | VARCHAR(50) | — | รอบการประเมิน เช่น `Monthly`, `Quarterly` |
| `status` | VARCHAR(20) | DEFAULT 'pending', CHECK IN ('pending','in_progress','completed') | สถานะ session |
| `final_score` | DECIMAL(5,2) | — | คะแนนสุดท้าย = (BU score + GCP score) / 2 (คำนวณโดย trigger) |
| `final_grade` | VARCHAR(5) | — | เกรดสุดท้าย A/B/C/D (คำนวณโดย trigger) |
| `initiated_by` | UUID | FK → `employees.id` ON DELETE SET NULL | พนักงานที่เริ่ม session |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่อัปเดตล่าสุด |
| `completed_at` | TIMESTAMPTZ | — | วันที่ประเมินเสร็จสมบูรณ์ (ทั้ง BU + GCP saved) |

**Indexes**: `supplier_id`, `status`, `eval_type`, `created_at DESC`

**Status Flow**:
```
pending → in_progress → completed
   │            │
   │      (เมื่อฝ่ายใดฝ่ายหนึ่ง save)
   │                    │
   └────────────────────┘
              (เมื่อทั้ง BU + GCP save แล้ว trigger จะ update)
```

**Requirement ที่รองรับ**: Req 3 (final score = average BU + GCP), Req 6 (history), Req 7 (new_supplier/re_evaluation)

---

### 3.10 `evaluations`

**หน้าที่**: บันทึกการประเมินของบุคคลหนึ่งคน (BU หรือ GCP) ใน session หนึ่ง  
- `status = 'draft'` = ยังแก้ไขได้ (Req 4)  
- `status = 'saved'` = ล็อคแล้ว หลัง confirm (Req 10)

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `session_id` | UUID | FK → `evaluation_sessions.id` ON DELETE CASCADE | Session ที่สังกัด |
| `employee_id` | UUID | FK → `employees.id` | พนักงานที่ประเมิน |
| `role` | VARCHAR(10) | CHECK IN ('BU','GCP') | บทบาทในการประเมิน |
| `product_type` | VARCHAR(20) | CHECK IN ('goods','services','both') | ประเภทสินค้า/บริการ |
| `status` | VARCHAR(10) | DEFAULT 'draft', CHECK IN ('draft','saved') | สถานะ |
| `total_score` | DECIMAL(5,2) | — | คะแนนรวม 0-100 (คำนวณจาก evaluation_scores) |
| `grade` | VARCHAR(5) | — | เกรด A/B/C/D |
| `submitted_at` | TIMESTAMPTZ | — | เวลาที่กด save จริง |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่อัปเดต |
| — | — | UNIQUE(session_id, role) | 1 session มีได้แค่ 1 BU eval + 1 GCP eval |

**Indexes**: `session_id`, `employee_id`, `status`

**Requirement ที่รองรับ**: Req 4 (edit before save), Req 10 (confirmation before lock)

---

### 3.11 `evaluation_scores`

**หน้าที่**: คะแนนรายหัวข้อของการประเมินหนึ่งชุด ผู้ประเมินสามารถปรับ `weight` ให้ต่างจากค่า default ได้

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `evaluation_id` | UUID | FK → `evaluations.id` ON DELETE CASCADE | การประเมินที่สังกัด |
| `criterion_id` | UUID | FK → `evaluation_criteria.id` | หัวข้อประเมิน |
| `weight` | DECIMAL(5,2) | NOT NULL | น้ำหนักที่ตกลงกันในรอบนี้ (อาจต่างจาก default) |
| `score` | INTEGER | CHECK BETWEEN 1 AND 5 | คะแนน (NULL = ยังไม่ได้กรอก) |
| `note` | TEXT | — | หมายเหตุ/ความเห็นเพิ่มเติม |
| `weighted_score` | DECIMAL(8,4) | **GENERATED STORED** | `(score / 5.0) × weight` คำนวณอัตโนมัติ |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่สร้าง |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | วันที่อัปเดต |
| — | — | UNIQUE(evaluation_id, criterion_id) | แต่ละหัวข้อมีคะแนนได้ครั้งเดียวต่อการประเมิน |

**GENERATED COLUMN**: `weighted_score` เป็น PostgreSQL Generated Column — ไม่ต้อง INSERT ค่านี้ DB คำนวณให้อัตโนมัติ:
```sql
weighted_score = CASE WHEN score IS NOT NULL
                 THEN (score::DECIMAL / 5.0) * weight
                 ELSE 0
                 END
```

**Indexes**: `evaluation_id`, `criterion_id`

**Requirement ที่รองรับ**: Req 9 (configurable weights)

---

### 3.12 `grade_thresholds`

**หน้าที่**: กำหนดช่วงคะแนนของแต่ละเกรด ปรับได้โดย Admin โดยไม่ต้องแก้โค้ด

| Column | Type | Constraint | คำอธิบาย |
|--------|------|-----------|----------|
| `id` | UUID | PK | Auto-generated |
| `grade` | VARCHAR(5) | UNIQUE NOT NULL | เกรด: `A`, `B`, `C`, `D` |
| `min_score` | DECIMAL(5,2) | NOT NULL | คะแนนขั้นต่ำ |
| `max_score` | DECIMAL(5,2) | NOT NULL | คะแนนสูงสุด |
| `label_th` | VARCHAR(100) | — | ป้ายภาษาไทย เช่น `ดีมาก` |
| `label_en` | VARCHAR(100) | — | ป้ายภาษาอังกฤษ เช่น `Excellent` |
| `color_hex` | VARCHAR(10) | — | สีสำหรับ UI เช่น `#2e7d32` |
| — | — | CHECK(min_score <= max_score) | min ต้องไม่เกิน max |

**ค่า Default**:
| Grade | Min | Max | ความหมาย |
|-------|-----|-----|---------|
| A | 81 | 100 | ดีมาก |
| B | 61 | 80 | ดี |
| C | 51 | 60 | พอใช้ |
| D | 0 | 50 | ต้องปรับปรุง |

---

## 4. Relationships ระหว่างตาราง

```
departments (1) ─────── (N) employees (N) ─────── (N) suppliers
                                                          │
job_titles (1) ──────── (N) employees           (via employee_supplier_permissions)
                                │
                     ┌──────────┴──────────────────────────────────┐
                     │ initiates                                    │ evaluates
                     ▼                                             ▼
              evaluation_sessions (1) ──────────────────── (N) evaluations
                                                                    │
                                                                    │ (1)
                                                                    ▼ (N)
                                                          evaluation_scores
                                                                    │ (N)
                                                                    ▼ (1)
                                                         evaluation_criteria
                                                                    │ (N)
                                                                    ▼ (1)
                                                        evaluation_categories
                                                                    │ (1)
                                                                    ▼ (N)
                                                      score_level_descriptions

grade_thresholds ◄──── (used by trigger to map score → grade)
```

### Cardinality Summary

| จาก | ไปยัง | ความสัมพันธ์ |
|-----|-------|------------|
| `departments` | `employees` | One-to-Many |
| `job_titles` | `employees` | One-to-Many |
| `employees` | `employee_supplier_permissions` | One-to-Many |
| `suppliers` | `employee_supplier_permissions` | One-to-Many |
| `suppliers` | `evaluation_sessions` | One-to-Many |
| `evaluation_sessions` | `evaluations` | One-to-Many (max 2: BU + GCP) |
| `employees` | `evaluations` | One-to-Many |
| `evaluations` | `evaluation_scores` | One-to-Many |
| `evaluation_criteria` | `evaluation_scores` | One-to-Many |
| `evaluation_categories` | `evaluation_criteria` | One-to-Many |
| `evaluation_criteria` | `score_level_descriptions` | One-to-Many (exactly 5) |

---

## 5. Functions & Triggers

### 5.1 `update_updated_at()` — Auto-timestamp Trigger

**วัตถุประสงค์**: อัปเดต `updated_at` อัตโนมัติทุกครั้งที่มีการ UPDATE แถว  
**ติดตั้งบน**: `employees`, `suppliers`, `evaluation_sessions`, `evaluations`, `evaluation_scores`

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**ทำงานเมื่อ**: `BEFORE UPDATE` บนตารางที่ติดตั้ง

---

### 5.2 `recalculate_session_final_score()` — Final Score Trigger

**วัตถุประสงค์**: คำนวณ `final_score` และ `final_grade` ของ session อัตโนมัติ เมื่อทั้ง BU และ GCP save การประเมินแล้ว

**ทำงานเมื่อ**: `AFTER UPDATE OF status ON evaluations` และ `NEW.status = 'saved'`

**Logic การทำงาน**:

```
เมื่อ evaluations.status เปลี่ยนเป็น 'saved':
  1. ดึง total_score ของ BU ใน session เดียวกัน (ถ้า saved)
  2. ดึง total_score ของ GCP ใน session เดียวกัน (ถ้า saved)
  
  ถ้า BU saved และ GCP saved:
    final_score = ROUND((bu_score + gcp_score) / 2, 2)
    final_grade = lookup จาก grade_thresholds
    session.status = 'completed'
    session.completed_at = NOW()
  
  ถ้ามีฝ่ายเดียว saved:
    session.status = 'in_progress'  (ถ้าเคยเป็น pending)
```

**ตัวอย่าง**:
- BU total_score = 75.00
- GCP total_score = 83.00
- final_score = (75 + 83) / 2 = **79.00** → Grade **B**

---

## 6. Indexes

| ตาราง | Index | Column(s) | วัตถุประสงค์ |
|-------|-------|-----------|------------|
| `employees` | `idx_employees_employee_id` | `employee_id` | ค้นหาพนักงานด้วยรหัส (Req 2, 11) |
| `employees` | `idx_employees_role` | `role` | Filter BU / GCP |
| `suppliers` | `idx_suppliers_vendor_code` | `vendor_code` | ค้นหา Supplier ด้วย Vendor Code (Req 8) |
| `suppliers` | `idx_suppliers_supplier_name` | `supplier_name` | ค้นหาด้วยชื่อ |
| `employee_supplier_permissions` | `idx_permissions_employee` | `employee_id` | ดูสิทธิ์ของพนักงาน (Req 1) |
| `employee_supplier_permissions` | `idx_permissions_supplier` | `supplier_id` | ดูว่าใครประเมิน Supplier นี้ได้ |
| `evaluation_sessions` | `idx_sessions_supplier` | `supplier_id` | ประวัติการประเมินของ Supplier (Req 6) |
| `evaluation_sessions` | `idx_sessions_status` | `status` | Filter pending/in_progress/completed |
| `evaluation_sessions` | `idx_sessions_eval_type` | `eval_type` | Filter new/re-evaluation (Req 7) |
| `evaluation_sessions` | `idx_sessions_created_at` | `created_at DESC` | เรียงตามวันที่ล่าสุด |
| `evaluations` | `idx_evaluations_session` | `session_id` | Join session → evaluations |
| `evaluations` | `idx_evaluations_employee` | `employee_id` | ประวัติของพนักงาน |
| `evaluations` | `idx_evaluations_status` | `status` | Filter draft/saved |
| `evaluation_scores` | `idx_scores_evaluation` | `evaluation_id` | ดูคะแนนทั้งหมดของการประเมิน |
| `evaluation_scores` | `idx_scores_criterion` | `criterion_id` | สถิติรายหัวข้อ |

---

## 7. การทำงานของระบบ (Business Flows)

### 7.1 Flow การประเมิน Supplier

```
[ผู้ใช้กรอก Employee ID]
        │
        ▼
GET /api/employees/:id
  └─ Query: employees JOIN departments JOIN job_titles
  └─ Return: fullName, department, jobTitle, role
        │
        ▼
[ผู้ใช้กรอก Vendor Code]
        │
        ▼
GET /api/suppliers
  └─ ค้นหา vendor_code → auto-fill supplier name
        │
        ▼
GET /api/suppliers/:vendorCode/permission?employeeId=
  └─ ถ้า role = GCP → อนุญาตเสมอ
  └─ ถ้า role = BU → ตรวจ employee_supplier_permissions
        │
        ▼
GET /api/criteria
  └─ ส่ง categories + criteria + levels + defaultWeight
        │
        ▼
[ผู้ใช้กรอกคะแนน + ปรับน้ำหนัก + กด Submit]
        │
        ▼
[หน้า Result แสดงผล + Confirmation Modal]
        │
        ▼
POST /api/evaluations
  1. Validate employee → supplier → permission
  2. หา session ที่ยังไม่ complete หรือสร้างใหม่
  3. INSERT evaluations (status='draft' ก่อน)
  4. INSERT evaluation_scores (ทุก criterion)
  5. UPDATE evaluations.status = 'saved'
     └─ TRIGGER recalculate_session_final_score() ทำงาน
        └─ ถ้าครบทั้ง BU + GCP:
           UPDATE evaluation_sessions SET final_score, final_grade, status='completed'
```

### 7.2 Flow การดูประวัติ (History)

```
[หน้า Result แสดง History ของ Supplier]
        │
        ▼
GET /api/sessions?vendorCode=SUP-001&status=completed
  └─ JOIN: evaluation_sessions → suppliers
  └─ JOIN: evaluations (BU + GCP ของแต่ละ session)
  └─ Return: รายการ sessions พร้อม final_score, final_grade, วันที่
        │
        ▼
GET /api/sessions/:id
  └─ JOIN: evaluations → evaluation_scores → evaluation_criteria
  └─ Return: รายละเอียดคะแนนรายหัวข้อของทั้ง BU และ GCP
```

### 7.3 Flow การคำนวณคะแนน

```
ระดับคะแนนที่ผู้ประเมินเลือก (1-5) × น้ำหนัก
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ = weighted_score (GENERATED COLUMN)
                    5

total_score = (Σ weighted_scores / Σ weights) × 100

final_score = (BU total_score + GCP total_score) / 2

final_grade = lookup จาก grade_thresholds
              (A: 81-100, B: 61-80, C: 51-60, D: 0-50)
```

**ตัวอย่างจริง**:
| หัวข้อ | คะแนน | น้ำหนัก | weighted_score |
|--------|-------|---------|---------------|
| 1.1 | 4 | 14 | (4/5)×14 = 11.20 |
| 1.2 | 3 | 8 | (3/5)×8 = 4.80 |
| 1.3 | 5 | 8 | (5/5)×8 = 8.00 |
| 1.4 | 4 | 10 | (4/5)×10 = 8.00 |
| 2.1 | 3 | 15 | (3/5)×15 = 9.00 |
| 2.2 | 4 | 15 | (4/5)×15 = 12.00 |
| **รวม** | — | **70** | **53.00** |

total_score = (53.00 / 70) × 100 = **75.71** → Grade **B**

---

## 8. Seed Data เริ่มต้น

ไฟล์: `database/seed.sql` (idempotent — รันซ้ำได้ ใช้ `ON CONFLICT DO NOTHING`)

| ตาราง | จำนวน | รายละเอียด |
|-------|-------|-----------|
| `grade_thresholds` | 4 | A, B, C, D |
| `departments` | 4 | จัดซื้อ, การเงิน, วิศวะ, อื่นๆ |
| `job_titles` | 4 | จัดซื้อวัสดุสำนักงาน, IT, วัตถุดิบ, อื่นๆ |
| `employees` | 6 | EMP-001 ถึง EMP-004 (BU), GCP-001 ถึง GCP-002 (GCP) |
| `suppliers` | 5 | SUP-001 ถึง SUP-005 |
| `employee_supplier_permissions` | — | GCP ทุกคนประเมินได้ทุก Supplier, EMP-001/002 → SUP-001/002/003, EMP-003/004 → SUP-004/005 |
| `evaluation_categories` | 2 | CAT1 (Quality 40%), CAT2 (Delivery 30%) |
| `evaluation_criteria` | 6 | 1.1, 1.2, 1.3, 1.4, 2.1, 2.2 |
| `score_level_descriptions` | 30 | 5 ระดับ × 6 หัวข้อ |

---

## 9. Constraints & Business Rules

| Rule | Implementation |
|------|---------------|
| BU ประเมินได้เฉพาะ Supplier ที่ได้รับอนุญาต | `employee_supplier_permissions` + API permission check |
| GCP ประเมินได้ทุก Supplier | `employees.role = 'GCP'` bypass permission table |
| 1 Session มีได้แค่ 1 BU + 1 GCP evaluation | `UNIQUE(session_id, role)` ใน `evaluations` |
| แต่ละหัวข้อมีคะแนนเดียวต่อการประเมิน | `UNIQUE(evaluation_id, criterion_id)` ใน `evaluation_scores` |
| คะแนนต้องอยู่ระหว่าง 1-5 | `CHECK(score BETWEEN 1 AND 5)` |
| น้ำหนักต้อง min <= max | `CHECK(min_score <= max_score)` ใน `grade_thresholds` |
| role ต้องเป็น BU, GCP, หรือ ADMIN | `CHECK(role IN ('BU','GCP','ADMIN'))` |
| product_type ต้องเป็น goods, services, หรือ both | `CHECK(product_type IN (...))` |
| session status ต้องเป็นค่าที่กำหนด | `CHECK(status IN ('pending','in_progress','completed'))` |
| ลบ employee → permission ถูกลบตาม | `ON DELETE CASCADE` ใน `employee_supplier_permissions` |
| ลบ supplier → permission ถูกลบตาม | `ON DELETE CASCADE` ใน `employee_supplier_permissions` |
| ลบ session → evaluations ถูกลบตาม | `ON DELETE CASCADE` ใน `evaluations` |
| ลบ evaluation → scores ถูกลบตาม | `ON DELETE CASCADE` ใน `evaluation_scores` |
| `weighted_score` คำนวณอัตโนมัติ | `GENERATED ALWAYS AS ... STORED` — ห้าม INSERT โดยตรง |
| `final_score` คำนวณอัตโนมัติ | Trigger `recalculate_session_final_score` |
| `updated_at` อัปเดตอัตโนมัติ | Trigger `update_updated_at` |
