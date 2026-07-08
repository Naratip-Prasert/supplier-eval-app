# Database Design — Supplier Performance Evaluation System (SPES)
## PostgreSQL / Supabase Schema v2.0

---

## Entity-Relationship Overview

```
departments ──────────────────┐
                              │ (belongs to)
job_titles ────────────────── employees ──────────────────────────┐
                              │                                   │
                              │ (has permissions)                 │ (initiates)
                              ▼                                   ▼
suppliers ──── employee_supplier_permissions    evaluation_sessions
    │                                               │        │
    │ (evaluated in)                                │        │ (has two evaluations)
    └──────────────────────────────────────────────►┘        │
                                                             ▼
                                                        evaluations ─── employees
                                                             │
                                                             │ (has scores)
                                                             ▼
                                                      evaluation_scores
                                                             │
                                                             │ (references)
                                                             ▼
                                              evaluation_sub_criteria ── evaluation_main_criteria
                                              score_level_descriptions

grade_thresholds (standalone lookup)
```

---

## Tables

### 1. `departments`
Lookup table for department names.

| Column    | Type         | Constraints  | Notes               |
|-----------|--------------|--------------|---------------------|
| id        | UUID         | PK           | auto-generated      |
| code      | VARCHAR(20)  | UNIQUE, NOT NULL | e.g. "DEPT-01" |
| name_th   | VARCHAR(200) | NOT NULL     | Thai name           |
| name_en   | VARCHAR(200) |              | English name        |
| created_at| TIMESTAMPTZ  | DEFAULT NOW()|                     |

**Seed Data:**
- DEPT-01: ฝ่ายจัดซื้อ
- DEPT-02: ฝ่ายการเงิน
- DEPT-03: ฝ่ายวิศวะ
- DEPT-04: อื่นๆ

---

### 2. `job_titles`
Lookup table for job titles.

| Column    | Type         | Constraints  | Notes               |
|-----------|--------------|--------------|---------------------|
| id        | UUID         | PK           |                     |
| code      | VARCHAR(20)  | UNIQUE, NOT NULL | e.g. "JB-001"  |
| name_th   | VARCHAR(300) | NOT NULL     | Thai name           |
| name_en   | VARCHAR(300) |              | English name        |
| created_at| TIMESTAMPTZ  | DEFAULT NOW()|                     |

---

### 3. `employees`
Employee master data — validates employee ID and auto-fills dept + job on the frontend (Req 2, 11).

| Column        | Type        | Constraints                 | Notes                        |
|---------------|-------------|-----------------------------|------------------------------|
| id            | UUID        | PK                          |                              |
| employee_id   | VARCHAR(20) | UNIQUE, NOT NULL            | e.g. "EMP-001", "GCP-001"   |
| full_name     | VARCHAR(200)| NOT NULL                    |                              |
| department_id | UUID        | FK → departments            | auto-fill on ID entry        |
| job_title_id  | UUID        | FK → job_titles             | auto-fill on ID entry        |
| role          | VARCHAR(10) | CHECK IN ('USER','GCP','ADMIN') | controls permissions       |
| is_active     | BOOLEAN     | DEFAULT TRUE                |                              |
| created_at    | TIMESTAMPTZ | DEFAULT NOW()               |                              |
| updated_at    | TIMESTAMPTZ | auto-updated by trigger     |                              |

**Indexes:** `employee_id`, `role`

**Requirement mapping:**
- Req 2: `employee_id` is looked up before evaluation can start
- Req 11: querying by `employee_id` returns `department` + `job_title` to auto-fill form
- Req 1: `role = 'USER'` users are restricted to suppliers in `employee_supplier_permissions`

---

### 4. `suppliers`
Supplier master data — frontend validates vendor code and name against this table (Req 8).

| Column        | Type        | Constraints                            | Notes                    |
|---------------|-------------|----------------------------------------|--------------------------|
| id            | UUID        | PK                                     |                          |
| vendor_code   | VARCHAR(50) | UNIQUE, NOT NULL                       | e.g. "SUP-001"           |
| supplier_name | VARCHAR(300)| NOT NULL                               |                          |
| product_type  | VARCHAR(20) | CHECK IN ('goods','services','both')   |                          |
| is_active     | BOOLEAN     | DEFAULT TRUE                           |                          |
| created_at    | TIMESTAMPTZ | DEFAULT NOW()                          |                          |
| updated_at    | TIMESTAMPTZ | auto-updated by trigger                |                          |

**Indexes:** `vendor_code`, `supplier_name`

---

### 5. `employee_supplier_permissions`
Controls which USER employees can evaluate which suppliers (Req 1). GCP users can evaluate all suppliers (seeded accordingly).

| Column      | Type        | Constraints                             | Notes                 |
|-------------|-------------|-----------------------------------------|-----------------------|
| id          | UUID        | PK                                      |                       |
| employee_id | UUID        | FK → employees, NOT NULL                |                       |
| supplier_id | UUID        | FK → suppliers, NOT NULL                |                       |
| granted_by  | UUID        | FK → employees                          | who gave permission   |
| granted_at  | TIMESTAMPTZ | DEFAULT NOW()                           |                       |

**Unique:** `(employee_id, supplier_id)`

---

### 6. `evaluation_main_criteria`
Top-level groupings (e.g., Quality, Delivery).

| Column        | Type        | Constraints      | Notes                          |
|---------------|-------------|------------------|--------------------------------|
| id            | UUID        | PK               |                                |
| code          | VARCHAR(20) | UNIQUE, NOT NULL | "CAT1", "CAT2"                 |
| name_th       | VARCHAR(200)| NOT NULL         | "ด้านคุณภาพสินค้า/บริการ"     |
| name_en       | VARCHAR(200)|                  | "Quality Performance"          |
| total_weight  | DECIMAL(5,2)| NOT NULL         | 40.00, 30.00 (%)               |
| display_order | INTEGER     | NOT NULL         | controls rendering order       |
| created_at    | TIMESTAMPTZ | DEFAULT NOW()    |                                |

---

### 7. `evaluation_sub_criteria`
Individual scoring items within a category (Req 9: weights configurable per eval).

| Column         | Type        | Constraints                  | Notes                           |
|----------------|-------------|------------------------------|---------------------------------|
| id             | UUID        | PK                           |                                 |
| category_id    | UUID        | FK → evaluation_main_criteria   |                                 |
| code           | VARCHAR(20) | UNIQUE, NOT NULL             | "1.1", "1.2", "2.1"            |
| name_th        | VARCHAR(400)| NOT NULL                     |                                 |
| name_en        | VARCHAR(400)|                              |                                 |
| detail_th      | TEXT        |                              | full description shown on form  |
| default_weight | DECIMAL(5,2)| NOT NULL                     | baseline; overridable per eval  |
| display_order  | INTEGER     | NOT NULL                     |                                 |
| is_active      | BOOLEAN     | DEFAULT TRUE                 |                                 |
| created_at     | TIMESTAMPTZ | DEFAULT NOW()                |                                 |

---

### 8. `score_level_descriptions`
The text for each 1–5 score level per criterion (what each number means).

| Column       | Type    | Constraints                  | Notes                     |
|--------------|---------|------------------------------|---------------------------|
| id           | UUID    | PK                           |                           |
| criterion_id | UUID    | FK → evaluation_sub_criteria     |                           |
| level        | INTEGER | CHECK BETWEEN 1 AND 5        |                           |
| description  | TEXT    | NOT NULL                     | shown in evaluation form  |

**Unique:** `(criterion_id, level)`

---

### 9. `evaluation_sessions`
One evaluation event for a supplier. Groups the USER and GCP evaluations together so their scores can be averaged (Req 3, 6, 7).

| Column       | Type        | Constraints                              | Notes                                  |
|--------------|-------------|------------------------------------------|----------------------------------------|
| id           | UUID        | PK                                       |                                        |
| supplier_id  | UUID        | FK → suppliers, NOT NULL                 |                                        |
| eval_type    | VARCHAR(20) | CHECK IN ('new_supplier','re_evaluation')| Req 7: pre-eval type categorization    |
| period       | VARCHAR(50) |                                          | "Monthly", "Quarterly", "Annual"       |
| status       | VARCHAR(20) | DEFAULT 'pending'                        | pending → in_progress → completed      |
| final_score  | DECIMAL(5,2)|                                          | avg of USER + GCP, set by trigger        |
| final_grade  | VARCHAR(5)  |                                          | 'A'/'B'/'C'/'D', set by trigger        |
| initiated_by | UUID        | FK → employees                           | who started this session               |
| created_at   | TIMESTAMPTZ | DEFAULT NOW()                            |                                        |
| updated_at   | TIMESTAMPTZ | auto-updated by trigger                  |                                        |
| completed_at | TIMESTAMPTZ |                                          | set when both USER+GCP submit            |

**Indexes:** `supplier_id`, `status`, `eval_type`, `created_at DESC`

**Status flow:**
```
pending ──(first eval saved)──► in_progress ──(both evals saved)──► completed
```

---

### 10. `evaluations`
Individual evaluation record by one person (USER or GCP). `status='draft'` means editable; `status='saved'` means locked after confirmation dialog (Req 4, 10).

| Column       | Type        | Constraints                     | Notes                                  |
|--------------|-------------|---------------------------------|----------------------------------------|
| id           | UUID        | PK                              |                                        |
| session_id   | UUID        | FK → evaluation_sessions        |                                        |
| employee_id  | UUID        | FK → employees, NOT NULL        |                                        |
| role         | VARCHAR(10) | CHECK IN ('USER','GCP')           |                                        |
| product_type | VARCHAR(20) | CHECK IN ('goods','services','both') |                                   |
| status       | VARCHAR(10) | DEFAULT 'draft'                 | 'draft' = editable, 'saved' = locked   |
| total_score  | DECIMAL(5,2)|                                 | 0–100, computed from scores            |
| grade        | VARCHAR(5)  |                                 | 'A'/'B'/'C'/'D'                        |
| submitted_at | TIMESTAMPTZ |                                 | set when status → 'saved'              |
| created_at   | TIMESTAMPTZ | DEFAULT NOW()                   |                                        |
| updated_at   | TIMESTAMPTZ | auto-updated by trigger         |                                        |

**Unique:** `(session_id, role)` — enforces exactly one USER + one GCP eval per session

---

### 11. `evaluation_scores`
Per-criterion score for each evaluation. `weight` can differ from `default_weight` because evaluators agree on weights per form (Req 9). `weighted_score` is computed automatically.

| Column         | Type        | Constraints                      | Notes                                   |
|----------------|-------------|----------------------------------|-----------------------------------------|
| id             | UUID        | PK                               |                                         |
| evaluation_id  | UUID        | FK → evaluations, NOT NULL       |                                         |
| criterion_id   | UUID        | FK → evaluation_sub_criteria, NOT NULL |                                       |
| weight         | DECIMAL(5,2)| NOT NULL                         | agreed weight for this eval (req 9)     |
| score          | INTEGER     | CHECK BETWEEN 1 AND 5, nullable  | NULL = not yet filled (req 5 alert)     |
| note           | TEXT        |                                  | optional comment                        |
| weighted_score | DECIMAL(8,4)| GENERATED (stored)               | `(score/5) * weight`, 0 if score NULL   |
| created_at     | TIMESTAMPTZ | DEFAULT NOW()                    |                                         |
| updated_at     | TIMESTAMPTZ | auto-updated by trigger          |                                         |

**Unique:** `(evaluation_id, criterion_id)`

**Note on Req 5 (missing score alert):** The frontend checks that all `score` fields are non-null before allowing save. The schema stores `NULL` for unfilled scores so the backend can also validate this.

---

### 12. `grade_thresholds`
Configurable grade boundaries (A/B/C/D).

| Column    | Type        | Constraints   | Notes             |
|-----------|-------------|---------------|-------------------|
| id        | UUID        | PK            |                   |
| grade     | VARCHAR(5)  | UNIQUE        | 'A','B','C','D'   |
| min_score | DECIMAL(5,2)| NOT NULL      | inclusive         |
| max_score | DECIMAL(5,2)| NOT NULL      | inclusive         |
| label_th  | VARCHAR(100)|               | "ดีมาก"           |
| label_en  | VARCHAR(100)|               | "Excellent"       |
| color_hex | VARCHAR(10) |               | "#2e7d32"         |

---

## Triggers & Functions

### `update_updated_at()`
Fires BEFORE UPDATE on: `employees`, `suppliers`, `evaluation_sessions`, `evaluations`, `evaluation_scores`.
Automatically sets `updated_at = NOW()`.

### `recalculate_session_final_score()`
Fires AFTER UPDATE OF `status` ON `evaluations` WHEN `NEW.status = 'saved'`.

Logic:
1. Fetches saved USER score and saved GCP score for the session
2. If both exist → `final_score = (bu + gcp) / 2`, resolves grade from `grade_thresholds`, sets `status = 'completed'`
3. If only one exists → sets session `status = 'in_progress'`

This implements Req 3 (average score calculation) automatically at the database level.

---

## Scoring Formula

```
weighted_score(item) = (score / 5) * weight

total_score = SUM(weighted_score) / SUM(weight) * 100

final_score (session) = (bu_total_score + gcp_total_score) / 2
```

---

## Requirements Mapping

| # | Requirement                                           | Table(s)                                                    |
|---|-------------------------------------------------------|-------------------------------------------------------------|
| 1 | USER can only evaluate permitted suppliers              | `employee_supplier_permissions`                             |
| 2 | EmployeeID validation before evaluation               | `employees.employee_id` (UNIQUE + lookup)                   |
| 3 | Final score = average of USER + GCP                     | `evaluation_sessions.final_score` + trigger                 |
| 4 | Edit form before save (draft mode)                    | `evaluations.status = 'draft'`                              |
| 5 | Alert for missing scores                              | `evaluation_scores.score` nullable; frontend checks         |
| 6 | Evaluation history in summary page                    | `evaluation_sessions` + `evaluations` + timestamps          |
| 7 | Categorize pre-eval types                             | `evaluation_sessions.eval_type` ('new_supplier'/'re_evaluation') |
| 8 | Vendor code + supplier name validation                | `suppliers.vendor_code` (UNIQUE), `suppliers.supplier_name` |
| 9 | Configurable weights per evaluation                   | `evaluation_scores.weight` (overrides `default_weight`)     |
| 10| Confirmation before save                              | Frontend dialog; backend flips `status = 'saved'`           |
| 11| Employee ID → auto-fill dept + job                    | `employees` JOIN `departments` JOIN `job_titles`            |
| 12| Better UI (less cartoony)                             | Frontend only                                               |
| 13| Use .env (no hardcoded values)                        | `VITE_API_URL`, `DATABASE_URL` in .env files                |

---

## API Queries (Reference)

### Validate employee ID and auto-fill (Req 2, 11)
```sql
SELECT e.employee_id, e.full_name, e.role,
       d.name_th AS department, j.name_th AS job_title
  FROM employees e
  JOIN departments d ON d.id = e.department_id
  JOIN job_titles  j ON j.id = e.job_title_id
 WHERE e.employee_id = $1 AND e.is_active = TRUE;
```

### Check supplier permission for USER employee (Req 1)
```sql
SELECT 1
  FROM employee_supplier_permissions p
  JOIN employees e ON e.id = p.employee_id
  JOIN suppliers s ON s.id = p.supplier_id
 WHERE e.employee_id = $1   -- evaluator's employee_id
   AND s.vendor_code  = $2; -- target supplier's vendor_code
```

### Validate vendor code + name (Req 8)
```sql
SELECT id, vendor_code, supplier_name, product_type
  FROM suppliers
 WHERE vendor_code   = $1
   AND supplier_name = $2
   AND is_active     = TRUE;
```

### Get evaluation history for summary page (Req 6)
```sql
SELECT s.vendor_code, sup.supplier_name,
       es.eval_type, es.period,
       es.final_score, es.final_grade,
       es.status, es.created_at, es.completed_at
  FROM evaluation_sessions es
  JOIN suppliers sup ON sup.id = es.supplier_id
  LEFT JOIN employees s ON s.id = es.initiated_by
 ORDER BY es.created_at DESC;
```

### Get full evaluation with scores
```sql
SELECT ev.role, ev.total_score, ev.grade, ev.status,
       ec.code, ec.name_th, ec.default_weight,
       evs.weight, evs.score, evs.note, evs.weighted_score
  FROM evaluations ev
  JOIN evaluation_scores evs ON evs.evaluation_id = ev.id
  JOIN evaluation_sub_criteria ec ON ec.id = evs.criterion_id
 WHERE ev.session_id = $1
 ORDER BY ec.display_order;
```

---

## Environment Variables

### Backend (`backend/.env`)
```env
DATABASE_URL=postgresql://user:password@host:5432/supplier_eval
PORT=5000
FRONTEND_URL=http://localhost:5173
```

### Frontend (`.env`)
```env
VITE_API_URL=http://localhost:5000
```

---

## Migration from MongoDB

| MongoDB field | PostgreSQL location                             |
|---------------|-------------------------------------------------|
| `role`        | `evaluations.role`                              |
| `empId`       | `employees.employee_id` + `evaluations.employee_id` |
| `dept`        | `employees.department_id` → `departments.name_th` |
| `job`         | `employees.job_title_id` → `job_titles.name_th` |
| `evalType`    | `evaluation_sessions.eval_type`                 |
| `vendorCode`  | `suppliers.vendor_code`                         |
| `supplierName`| `suppliers.supplier_name`                       |
| `productType` | `evaluations.product_type`                      |
| `period`      | `evaluation_sessions.period`                    |
| `scores`      | `evaluation_scores.score` (one row per criterion) |
| `notes`       | `evaluation_scores.note`                        |
| `totalScore`  | `evaluations.total_score`                       |
| `grade`       | `evaluations.grade`                             |
| `createdAt`   | `evaluations.created_at`                        |
