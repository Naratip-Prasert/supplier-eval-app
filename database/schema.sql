-- ============================================================
--  Supplier Performance Evaluation System (SPE)
--  PostgreSQL (Neon) Schema
--  Version 3.0 — Regenerated 2026-06-24 directly from the live
--  database (information_schema + pg_catalog), since the schema
--  had drifted from this file via ad-hoc changes made directly
--  on the DB. This file is the source of truth again as of now —
--  keep it in sync with future ALTERs.
-- ============================================================

-- Enable UUID generation (gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. DEPARTMENTS — lookup table for departments
-- ============================================================
CREATE TABLE departments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,
  name_th     VARCHAR(200) NOT NULL,
  name_en     VARCHAR(200),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. JOB_TITLES — lookup table for job titles
-- ============================================================
CREATE TABLE job_titles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) UNIQUE NOT NULL,
  name_th     VARCHAR(300) NOT NULL,
  name_en     VARCHAR(300),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. EMPLOYEES — master employee/login table
--    role: USER (BU evaluator) | GCP (buyer) | ADMIN | SUPERVISOR
-- ============================================================
CREATE TABLE employees (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          VARCHAR(20) UNIQUE NOT NULL,        -- e.g. "EMP-001", "GCP-001"
  full_name            VARCHAR(200) NOT NULL,
  department_id        UUID        REFERENCES departments(id) ON DELETE SET NULL,
  job_title_id         UUID        REFERENCES job_titles(id) ON DELETE SET NULL,
  role                 VARCHAR(10) NOT NULL
                          CHECK (role IN ('USER', 'GCP', 'ADMIN', 'SUPERVISOR')),
  is_active            BOOLEAN     DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  email                TEXT        UNIQUE,                 -- login identity
  password_hash        TEXT,
  reset_token          TEXT,
  reset_token_expires  TIMESTAMPTZ,
  profile_picture      TEXT
);

CREATE INDEX idx_employees_employee_id ON employees(employee_id);
CREATE INDEX idx_employees_role        ON employees(role);

-- ============================================================
-- 4. SUPPLIERS — supplier master data
--    Columns past created_at/updated_at were added later to
--    carry the full pre/post-eval upload template fields
--    (TAX_ID, Buyer/Evaluator contacts, job value, PTA date)
--    directly on the supplier row instead of a separate table.
-- ============================================================
CREATE TABLE suppliers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code       VARCHAR(50) UNIQUE NOT NULL,
  supplier_name     VARCHAR(300) NOT NULL,
  product_type      VARCHAR(20) NOT NULL
                      CHECK (product_type IN ('goods', 'services', 'both')),
  is_active         BOOLEAN     DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  tax_id            VARCHAR(30),
  category          VARCHAR(100),
  function_owner    VARCHAR(100),
  job_value_thb     DECIMAL(15,2),
  pta_approve_date  DATE,
  buyer_name        VARCHAR(200),
  buyer_email       VARCHAR(200),
  evaluator_name    VARCHAR(200),
  evaluator_email   VARCHAR(200)
);

CREATE INDEX idx_suppliers_vendor_code    ON suppliers(vendor_code);
CREATE INDEX idx_suppliers_supplier_name  ON suppliers(supplier_name);

-- ============================================================
-- 5. EMPLOYEE_SUPPLIER_PERMISSIONS
--    Which BU employees can evaluate which suppliers
--    (currently unenforced — see evaluations.js "BU permission
--    check — disabled for now")
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
-- 6. EVALUATION_CATEGORIES — top-level groupings: Quality, Delivery, etc.
-- ============================================================
CREATE TABLE evaluation_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) UNIQUE NOT NULL,
  name_th       VARCHAR(200) NOT NULL,
  name_en       VARCHAR(200),
  total_weight  DECIMAL(5,2) NOT NULL DEFAULT 0,
  display_order INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. EVALUATION_CRITERIA — individual scoring items within a category
--    criteria_set distinguishes PRE_CRITERIA vs POST_CRITERIA
--    (src/constants.js) since both reuse the same code numbers
--    (e.g. "1.1") for different criteria.
-- ============================================================
CREATE TABLE evaluation_criteria (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID        NOT NULL REFERENCES evaluation_categories(id) ON DELETE CASCADE,
  code            VARCHAR(20) NOT NULL,
  name_th         VARCHAR(400) NOT NULL,
  name_en         VARCHAR(400),
  detail_th       TEXT,
  default_weight  DECIMAL(5,2) NOT NULL DEFAULT 0,
  display_order   INTEGER     NOT NULL,
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  criteria_set    VARCHAR(10) NOT NULL DEFAULT 'legacy',
  UNIQUE (criteria_set, code)
);

-- ============================================================
-- 8. SCORE_LEVEL_DESCRIPTIONS — the 1-5 level text per criterion
-- ============================================================
CREATE TABLE score_level_descriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id  UUID        NOT NULL REFERENCES evaluation_criteria(id) ON DELETE CASCADE,
  level         INTEGER     NOT NULL CHECK (level BETWEEN 1 AND 5),
  description   TEXT        NOT NULL,
  UNIQUE (criterion_id, level)
);

-- ============================================================
-- 9. GRADE_THRESHOLDS — configurable grade boundary table
-- ============================================================
CREATE TABLE grade_thresholds (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  grade       VARCHAR(5)  UNIQUE NOT NULL,
  min_score   DECIMAL(5,2) NOT NULL,
  max_score   DECIMAL(5,2) NOT NULL,
  label_th    VARCHAR(100),
  label_en    VARCHAR(100),
  color_hex   VARCHAR(10),
  CHECK (min_score <= max_score)
);

-- ============================================================
-- 10. SUPPLIER_UPLOAD_BATCHES — one row per Excel/CSV upload by ADMIN
--     batch_type: pre_post_eval | half_year | yearly
-- ============================================================
CREATE TABLE supplier_upload_batches (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID        REFERENCES employees(id),
  batch_type  VARCHAR(20) CHECK (batch_type IN ('pre_post_eval', 'half_year', 'yearly')),
  filename    VARCHAR(300),
  row_count   INTEGER     DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'processing'
                CHECK (status IN ('processing', 'done', 'error')),
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. EVALUATION_SESSIONS — one evaluation round for a supplier
--     Groups the USER + GCP evaluations together so their scores
--     can be averaged into a final score.
--     status flow: pending -> in_progress -> pending_review
--                  -> completed (approved) | returned (back to pending)
--     A partial unique index (see below) prevents two open
--     (non-completed) sessions existing for the same
--     supplier+eval_type+period at once.
-- ============================================================
CREATE TABLE evaluation_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id),
  eval_type       VARCHAR(20) NOT NULL
                    CHECK (eval_type IN ('pre_eval', 'post_eval', 'half_year', 'yearly')),
  period          VARCHAR(50),                       -- "Monthly", "Half-Year 2026", "Post 90 Days", etc.
                                                       -- half_year/yearly MUST include the calendar year
                                                       -- (set in admin.js) so next year's round doesn't
                                                       -- collide with idx_unique_open_session below.
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'pending_review', 'completed', 'returned')),
  final_score     DECIMAL(5,2),
  final_grade     VARCHAR(5),
  initiated_by    UUID        REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_sessions_supplier    ON evaluation_sessions(supplier_id);
CREATE INDEX idx_sessions_status      ON evaluation_sessions(status);
CREATE INDEX idx_sessions_eval_type   ON evaluation_sessions(eval_type);
CREATE INDEX idx_sessions_created_at  ON evaluation_sessions(created_at DESC);

-- Prevents two simultaneously-open sessions for the same
-- supplier+eval_type+period (added 2026-06-24 after a bug let
-- re-uploading the same Excel row spawn a parallel duplicate
-- session + task pair that could both be evaluated independently).
CREATE UNIQUE INDEX idx_unique_open_session
  ON evaluation_sessions (supplier_id, eval_type, period)
  WHERE (status <> 'completed');

-- ============================================================
-- 12. EVALUATION_TASKS — one assignment (GCP or USER) within a session
--     Created by the admin upload routes; tracks email lifecycle
--     (invitation/reminder/overdue/thank-you) independently per task.
-- ============================================================
CREATE TABLE evaluation_tasks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID        REFERENCES supplier_upload_batches(id),
  session_id            UUID        REFERENCES evaluation_sessions(id),
  supplier_id           UUID        REFERENCES suppliers(id),
  assigned_employee_id  UUID        REFERENCES employees(id),
  assigned_email        VARCHAR(200) NOT NULL,
  assigned_name         VARCHAR(200),
  role                  VARCHAR(10)
                          CHECK (role IN ('ADMIN', 'USER', 'GCP', 'SUPERVISOR')),
  due_date              DATE        NOT NULL,
  status                VARCHAR(20) DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'overdue')),
  invitation_sent_at    TIMESTAMPTZ,
  reminder_sent_at      TIMESTAMPTZ,
  overdue_sent_at       TIMESTAMPTZ,
  thankyou_sent_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_session   ON evaluation_tasks(session_id);
CREATE INDEX idx_tasks_employee  ON evaluation_tasks(assigned_employee_id);
CREATE INDEX idx_tasks_status    ON evaluation_tasks(status);
CREATE INDEX idx_tasks_due_date  ON evaluation_tasks(due_date);

-- ============================================================
-- 13. EVALUATIONS — individual evaluation record submitted by one
--     person (USER or GCP). status='draft' = editable.
--     status='saved' = locked after confirmation.
--     raw_scores keeps the original per-criterion submission
--     payload (JSON) alongside the normalized evaluation_scores
--     rows, for audit/debugging.
-- ============================================================
CREATE TABLE evaluations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  employee_id   UUID        NOT NULL REFERENCES employees(id),
  role          VARCHAR(10) NOT NULL CHECK (role IN ('USER', 'GCP', 'ADMIN')),
  product_type  VARCHAR(20)
                  CHECK (product_type IN ('goods', 'services', 'both')),
  status        VARCHAR(10) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'saved')),
  total_score   DECIMAL(5,2),
  grade         VARCHAR(5),
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  raw_scores    JSONB,
  UNIQUE (session_id, role)                          -- one USER eval + one GCP eval per session
);

CREATE INDEX idx_evaluations_session    ON evaluations(session_id);
CREATE INDEX idx_evaluations_employee   ON evaluations(employee_id);
CREATE INDEX idx_evaluations_status     ON evaluations(status);

-- ============================================================
-- 14. EVALUATION_SCORES — per-criterion score for each evaluation
-- ============================================================
CREATE TABLE evaluation_scores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id   UUID        NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion_id    UUID        NOT NULL REFERENCES evaluation_criteria(id),
  weight          DECIMAL(5,2) NOT NULL,
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
-- 15. EVALUATION_CATEGORY_WEIGHTS — per-evaluation category weight
--     overrides, mirroring how evaluation_scores.weight overrides
--     evaluation_criteria.default_weight for sub-criteria.
-- ============================================================
CREATE TABLE evaluation_category_weights (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  UUID        NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  category_id    UUID        NOT NULL REFERENCES evaluation_categories(id),
  weight         DECIMAL(5,2) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evaluation_id, category_id)
);

CREATE INDEX idx_cat_weights_evaluation ON evaluation_category_weights(evaluation_id);
CREATE INDEX idx_cat_weights_category   ON evaluation_category_weights(category_id);

-- ============================================================
-- 16. SUPERVISOR_REVIEWS — one row per approve/return decision
--     A session can accumulate several rows over multiple
--     return -> resubmit -> review cycles (status 'pending' while
--     awaiting decision, then 'approved' or 'returned').
-- ============================================================
CREATE TABLE supervisor_reviews (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES evaluation_sessions(id),
  supervisor_id  UUID        REFERENCES employees(id),
  status         VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'returned')),
  notes          TEXT,
  review_due     TIMESTAMPTZ,
  reviewed_at    TIMESTAMPTZ,
  notified_at    TIMESTAMPTZ,                     -- cron sent-flag for notifySupervisors
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supervisor_reviews_session ON supervisor_reviews(session_id);
CREATE INDEX idx_supervisor_reviews_status  ON supervisor_reviews(status);

-- ============================================================
-- 17. EMAIL_LOGS — record of every email sent by the app
--     (invitation / reminder / overdue / thank-you / result)
-- ============================================================
CREATE TABLE email_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        REFERENCES evaluation_tasks(id),
  email_type  VARCHAR(30),
  to_email    VARCHAR(200) NOT NULL,
  subject     VARCHAR(300),
  status      VARCHAR(10) DEFAULT 'sent',
  error_msg   TEXT,
  sent_at     TIMESTAMPTZ DEFAULT NOW()
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

CREATE TRIGGER trg_cat_weights_updated_at
  BEFORE UPDATE ON evaluation_category_weights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Recalculate session final_score once BOTH USER and GCP evals are
-- saved. Sets the session to 'pending_review' (supervisor approval
-- queue) rather than 'completed' directly — completion only happens
-- once a supervisor approves it (see server/routes/supervisor.js).
CREATE OR REPLACE FUNCTION recalculate_session_final_score()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id  UUID;
  v_user_score  DECIMAL;
  v_gcp_score   DECIMAL;
  v_final       DECIMAL;
  v_grade       VARCHAR(5);
BEGIN
  v_session_id := NEW.session_id;

  SELECT total_score INTO v_user_score
    FROM evaluations
   WHERE session_id = v_session_id AND role = 'USER' AND status = 'saved';

  SELECT total_score INTO v_gcp_score
    FROM evaluations
   WHERE session_id = v_session_id AND role = 'GCP' AND status = 'saved';

  IF v_user_score IS NOT NULL AND v_gcp_score IS NOT NULL THEN
    v_final := ROUND((v_user_score + v_gcp_score) / 2.0, 2);

    SELECT grade INTO v_grade
      FROM grade_thresholds
     WHERE ROUND(v_final, 1) >= min_score AND ROUND(v_final, 1) <= max_score
     LIMIT 1;

    UPDATE evaluation_sessions
       SET final_score = v_final,
           final_grade = v_grade,
           status      = 'pending_review'
     WHERE id = v_session_id AND status != 'completed';
  ELSE
    UPDATE evaluation_sessions
       SET status = 'in_progress'
     WHERE id = v_session_id AND status IN ('pending', 'returned');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Must fire on INSERT (not just UPDATE OF status): server/routes/
-- evaluations.js always INSERTs a new evaluations row with
-- status='saved' directly — it never inserts a 'draft' row and later
-- UPDATEs it to 'saved'. A narrower "AFTER UPDATE OF status WHEN
-- status='saved'" trigger (trg_recalculate_final_score, inherited from
-- the original v2.0 schema) would therefore NEVER fire in this app's
-- actual submit flow and was a dead leftover — removed. This is the
-- one trigger that actually matters; keep it AFTER INSERT OR UPDATE.
CREATE TRIGGER trg_recalculate_score
  AFTER INSERT OR UPDATE ON evaluations
  EXECUTE FUNCTION recalculate_session_final_score();
