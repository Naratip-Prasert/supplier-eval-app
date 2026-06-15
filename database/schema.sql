-- ============================================================
--  Supplier Performance Evaluation System (SPE)
--  PostgreSQL / Supabase Schema
--  Version 2.0 — Migrated from MongoDB
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. DEPARTMENTS
--    Lookup table for departments (supports req 11: auto-fill)
-- ============================================================
CREATE TABLE departments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,           -- e.g. "DEPT-01"
  name_th     VARCHAR(200) NOT NULL,                 -- e.g. "ฝ่ายจัดซื้อ"
  name_en     VARCHAR(200),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. JOB_TITLES
--    Lookup table for job titles (supports req 11: auto-fill)
-- ============================================================
CREATE TABLE job_titles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,           -- e.g. "JB-001"
  name_th     VARCHAR(300) NOT NULL,                 -- e.g. "จัดซื้อวัสดุสำนักงาน"
  name_en     VARCHAR(300),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. EMPLOYEES
--    Master employee table (req 2, 11)
--    - Validates employee ID before evaluation starts
--    - Auto-fills department + job name when ID is entered
-- ============================================================
CREATE TABLE employees (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   VARCHAR(20) UNIQUE NOT NULL,         -- e.g. "EMP-001", "GCP-001"
  full_name     VARCHAR(200) NOT NULL,
  department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  job_title_id  UUID        REFERENCES job_titles(id) ON DELETE SET NULL,
  role          VARCHAR(10) NOT NULL
                  CHECK (role IN ('BU', 'GCP', 'ADMIN')),
  is_active     BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employees_employee_id ON employees(employee_id);
CREATE INDEX idx_employees_role        ON employees(role);

-- ============================================================
-- 4. SUPPLIERS
--    Supplier master data (req 8: vendor code + name validation)
-- ============================================================
CREATE TABLE suppliers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code     VARCHAR(50) UNIQUE NOT NULL,       -- e.g. "SUP-001"
  supplier_name   VARCHAR(300) NOT NULL,
  product_type    VARCHAR(20) NOT NULL
                    CHECK (product_type IN ('goods', 'services', 'both')),
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_suppliers_vendor_code    ON suppliers(vendor_code);
CREATE INDEX idx_suppliers_supplier_name  ON suppliers(supplier_name);

-- ============================================================
-- 5. EMPLOYEE_SUPPLIER_PERMISSIONS
--    Which BU employees can evaluate which suppliers (req 1)
-- ============================================================
CREATE TABLE employee_supplier_permissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  supplier_id  UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  granted_by   UUID        REFERENCES employees(id) ON DELETE SET NULL,
  granted_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, supplier_id)
);

CREATE INDEX idx_permissions_employee ON employee_supplier_permissions(employee_id);
CREATE INDEX idx_permissions_supplier ON employee_supplier_permissions(supplier_id);

-- ============================================================
-- 6. EVALUATION_CATEGORIES
--    Top-level groupings: Quality, Delivery, etc.
-- ============================================================
CREATE TABLE evaluation_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) UNIQUE NOT NULL,         -- e.g. "CAT1"
  name_th       VARCHAR(200) NOT NULL,               -- "ด้านคุณภาพสินค้า/บริการ"
  name_en       VARCHAR(200),                        -- "Quality Performance"
  total_weight  DECIMAL(5,2) NOT NULL DEFAULT 0,     -- e.g. 40.00 (%)
  display_order INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. EVALUATION_CRITERIA
--    Individual scoring items within a category (req 9)
--    default_weight is the baseline; evaluators can override
--    the actual weight per evaluation in evaluation_scores
-- ============================================================
CREATE TABLE evaluation_criteria (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID        NOT NULL REFERENCES evaluation_categories(id) ON DELETE CASCADE,
  code            VARCHAR(20) UNIQUE NOT NULL,       -- e.g. "1.1", "2.2"
  name_th         VARCHAR(400) NOT NULL,
  name_en         VARCHAR(400),
  detail_th       TEXT,                              -- full description of criteria
  default_weight  DECIMAL(5,2) NOT NULL DEFAULT 0,  -- baseline weight (%)
  display_order   INTEGER     NOT NULL,
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. SCORE_LEVEL_DESCRIPTIONS
--    The 1-5 level text per criterion (what each score means)
-- ============================================================
CREATE TABLE score_level_descriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id  UUID        NOT NULL REFERENCES evaluation_criteria(id) ON DELETE CASCADE,
  level         INTEGER     NOT NULL CHECK (level BETWEEN 1 AND 5),
  description   TEXT        NOT NULL,
  UNIQUE (criterion_id, level)
);

-- ============================================================
-- 9. EVALUATION_SESSIONS
--    One evaluation event for a supplier (req 3, 6, 7)
--    Groups both BU and GCP evaluations together so their
--    scores can be averaged into a final score.
-- ============================================================
CREATE TABLE evaluation_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id),
  eval_type       VARCHAR(20) NOT NULL
                    CHECK (eval_type IN ('new_supplier', 're_evaluation')),
  period          VARCHAR(50),                       -- "Monthly", "Quarterly", etc.
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed')),
  final_score     DECIMAL(5,2),                      -- average of BU + GCP total_score
  final_grade     VARCHAR(5),                        -- 'A' | 'B' | 'C' | 'D'
  initiated_by    UUID        REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_sessions_supplier    ON evaluation_sessions(supplier_id);
CREATE INDEX idx_sessions_status      ON evaluation_sessions(status);
CREATE INDEX idx_sessions_eval_type   ON evaluation_sessions(eval_type);
CREATE INDEX idx_sessions_created_at  ON evaluation_sessions(created_at DESC);

-- ============================================================
-- 10. EVALUATIONS
--     Individual evaluation record submitted by one person
--     (BU or GCP). status='draft' = editable (req 4).
--     status='saved' = locked after confirmation (req 10).
-- ============================================================
CREATE TABLE evaluations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  employee_id   UUID        NOT NULL REFERENCES employees(id),
  role          VARCHAR(10) NOT NULL CHECK (role IN ('BU', 'GCP')),
  product_type  VARCHAR(20)
                  CHECK (product_type IN ('goods', 'services', 'both')),
  status        VARCHAR(10) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'saved')),
  total_score   DECIMAL(5,2),                        -- 0-100, computed from scores
  grade         VARCHAR(5),                          -- 'A' | 'B' | 'C' | 'D'
  submitted_at  TIMESTAMPTZ,                         -- set when status → 'saved'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, role)                          -- one BU eval + one GCP eval per session
);

CREATE INDEX idx_evaluations_session    ON evaluations(session_id);
CREATE INDEX idx_evaluations_employee   ON evaluations(employee_id);
CREATE INDEX idx_evaluations_status     ON evaluations(status);

-- ============================================================
-- 11. EVALUATION_SCORES
--     Per-criterion score for each evaluation (req 9)
--     weight can differ from evaluation_criteria.default_weight
--     because evaluators agree on weights per form (req 9).
-- ============================================================
CREATE TABLE evaluation_scores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id   UUID        NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion_id    UUID        NOT NULL REFERENCES evaluation_criteria(id),
  weight          DECIMAL(5,2) NOT NULL,             -- agreed weight for this eval
  score           INTEGER     CHECK (score BETWEEN 1 AND 5),  -- NULL = not yet filled
  note            TEXT,
  weighted_score  DECIMAL(8,4)
                    GENERATED ALWAYS AS
                      (CASE WHEN score IS NOT NULL
                        THEN (score::DECIMAL / 5.0) * weight
                        ELSE 0
                      END) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evaluation_id, criterion_id)
);

CREATE INDEX idx_scores_evaluation ON evaluation_scores(evaluation_id);
CREATE INDEX idx_scores_criterion  ON evaluation_scores(criterion_id);

-- ============================================================
-- 12. EVALUATION_CATEGORY_WEIGHTS
--     Per-evaluation major-topic (category) weight overrides.
--     Mirrors how evaluation_scores.weight overrides
--     evaluation_criteria.default_weight for sub-criteria,
--     allowing BU and GCP to agree on category weights each round.
--     evaluation_categories.total_weight remains the default baseline.
-- ============================================================
CREATE TABLE evaluation_category_weights (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  UUID        NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  category_id    UUID        NOT NULL REFERENCES evaluation_categories(id),
  weight         DECIMAL(5,2) NOT NULL,   -- agreed category weight for this evaluation (%)
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evaluation_id, category_id)
);

CREATE INDEX idx_cat_weights_evaluation ON evaluation_category_weights(evaluation_id);
CREATE INDEX idx_cat_weights_category   ON evaluation_category_weights(category_id);

CREATE TRIGGER trg_cat_weights_updated_at
  BEFORE UPDATE ON evaluation_category_weights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 13. GRADE_THRESHOLDS
--     Configurable grade boundary table
-- ============================================================
CREATE TABLE grade_thresholds (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  grade       VARCHAR(5)  UNIQUE NOT NULL,           -- 'A', 'B', 'C', 'D'
  min_score   DECIMAL(5,2) NOT NULL,
  max_score   DECIMAL(5,2) NOT NULL,
  label_th    VARCHAR(100),                          -- "ดีมาก"
  label_en    VARCHAR(100),                          -- "Excellent"
  color_hex   VARCHAR(10),                           -- "#2e7d32"
  CHECK (min_score <= max_score)
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON evaluation_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_scores_updated_at
  BEFORE UPDATE ON evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Recalculate session final_score when both BU and GCP evals are saved
CREATE OR REPLACE FUNCTION recalculate_session_final_score()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
  v_bu_score   DECIMAL;
  v_gcp_score  DECIMAL;
  v_final      DECIMAL;
  v_grade      VARCHAR(5);
BEGIN
  v_session_id := NEW.session_id;

  SELECT total_score INTO v_bu_score
    FROM evaluations
   WHERE session_id = v_session_id AND role = 'BU' AND status = 'saved';

  SELECT total_score INTO v_gcp_score
    FROM evaluations
   WHERE session_id = v_session_id AND role = 'GCP' AND status = 'saved';

  -- Only calculate when BOTH have been saved (req 3)
  IF v_bu_score IS NOT NULL AND v_gcp_score IS NOT NULL THEN
    v_final := ROUND((v_bu_score + v_gcp_score) / 2.0, 2);

    SELECT grade INTO v_grade
      FROM grade_thresholds
     WHERE v_final >= min_score AND v_final <= max_score
     LIMIT 1;

    UPDATE evaluation_sessions
       SET final_score  = v_final,
           final_grade  = v_grade,
           status       = 'completed',
           completed_at = NOW()
     WHERE id = v_session_id;
  ELSE
    -- Mark in_progress if at least one side is saved
    UPDATE evaluation_sessions
       SET status = 'in_progress'
     WHERE id = v_session_id AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_final_score
  AFTER UPDATE OF status ON evaluations
  FOR EACH ROW
  WHEN (NEW.status = 'saved')
  EXECUTE FUNCTION recalculate_session_final_score();
