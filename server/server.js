'use strict';
const express = require('express'); // express เป็น framework ที่ทำให้ node.js รับ http request ได้ง่าย
const cors    = require('cors'); // เช็คว่าโดเมนที่เรียกเข้ามา ได้รับอนุญาตให้ดึงข้อมูลจาก API ของเราไหม

const pool = require('./db'); // ./db already calls dotenv.config() — no need to call it again here

const app  = express(); //สร้าง Express Application — app คือ object หลักที่เราจะ config ทุกอย่างลงไป
const PORT = process.env.PORT || 5000;

// Production origins come from FRONTEND_URL (comma-separated if there's more
// than one, e.g. a Vercel preview + the production domain) — local dev
// origins (any localhost port) are always allowed alongside them.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({ // app.use(...) คือการเพิ่ม middleware - บอก express ว่าใช้ cor middleware กับทุก req
  origin: (origin, cb) => {  //กำหนด function ตรวจสอบ origin
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '8mb' })); //บอก Express ให้แปลง JSON ที่ส่งมาใน request body เป็น JavaScript object อัตโนมัติ

// ── Request logger ────────────────────────────────────────────
app.use((req, res, next) => { // เพิ่ม middleware ที่จะรันกับทุก request — รับ parameter 3 ตัวเสมอ: req (request), res (response), next (ฟังก์ชันที่บอกให้ไปต่อ)
  const start = Date.now(); // จดเวลาที่ request เข้ามา (millisecond) — ใช้คำนวณว่า request ใช้เวลานานแค่ไหน
  res.on('finish', () => {
    const ms      = Date.now() - start;
    const status  = res.statusCode;
    const emoji   = status >= 500 ? '❌' : status >= 400 ? '⚠️ ' : '✅';
    const line    = `${emoji} ${req.method.padEnd(6)} ${req.originalUrl.padEnd(45)} ${status}  (${ms}ms)`; //เลือก emoji ตาม status — 500+ คือ server error (❌), 400+ คือ client error (⚠️), อื่นๆ คือสำเร็จ (✅) — เขียนแบบ ternary ซ้อนกัน
    if (status >= 500)      console.error(line);
    else if (status >= 400) console.warn(line);
    else                    console.log(line);
  });
  next();
});

const requireAuth = require('./middleware/authMiddleware');

app.get("/", (req, res) => {
  res.json({ message: "Supplier Eval API is running" });
});

app.use('/api/auth',        require('./routes/auth'));          // public
app.use('/api/evaluations', requireAuth, require('./routes/evaluations'));
app.use('/api/employees',   requireAuth, require('./routes/employees'));
app.use('/api/suppliers',   requireAuth, require('./routes/suppliers'));
app.use('/api/criteria',    requireAuth, require('./routes/criteria'));
app.use('/api/sessions',    requireAuth, require('./routes/sessions'));
app.use('/api/admin',       requireAuth, require('./routes/admin'));
app.use('/api/supervisor',  requireAuth, require('./routes/supervisor'));

const { startCronJobs } = require('./utils/cronJobs');

pool.connect()
  .then(async client => {
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_picture TEXT`
    ).catch(() => {});

    await client.query(
      `ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS raw_scores JSONB`
    ).catch(() => {});

    // auth.js / the default-admin bootstrap below both need these columns,
    // but no tracked migration ever created them — only present today
    // because they were added directly on the live DB at some point.
    await client.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(200) UNIQUE;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
    `).catch(err => console.warn('employees auth columns migration warning:', err.message));

    // 'BU' (employees/evaluations/evaluation_tasks roles) and 'new_supplier'
    // (evaluation_sessions.eval_type) were fully retired — confirmed 0 rows
    // left anywhere, and every CHECK constraint below already rejects those
    // values, so nothing can ever reintroduce them. The one-time rename
    // UPDATEs that used to live here are gone; only the constraints (needed
    // so a fresh install ends up with the right shape) remain.
    //
    // evaluations_role_check: this block is its sole source of truth.
    await client.query(`
      ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_role_check;
      ALTER TABLE evaluations
        ADD CONSTRAINT evaluations_role_check
        CHECK (role IN ('USER', 'GCP', 'ADMIN'));

      CREATE OR REPLACE FUNCTION recalculate_session_final_score()
      RETURNS TRIGGER AS $func$
      DECLARE
        v_session_id UUID;
        v_user_score DECIMAL;
        v_gcp_score  DECIMAL;
        v_final      DECIMAL;
        v_grade      VARCHAR(5);
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
             SET final_score = v_final, final_grade = v_grade,
                 status = 'completed', completed_at = NOW()
           WHERE id = v_session_id;
        ELSE
          UPDATE evaluation_sessions
             SET status = 'in_progress'
           WHERE id = v_session_id AND status = 'pending';
        END IF;
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_recalculate_score ON evaluations;
      CREATE TRIGGER trg_recalculate_score
        AFTER INSERT OR UPDATE ON evaluations
        FOR EACH ROW EXECUTE FUNCTION recalculate_session_final_score();
    `).catch(err => console.warn('role migration warning:', err.message));

    // Backfill: sessions that already have both USER+GCP saved evaluations but are still pending/in_progress
    await client.query(`
      UPDATE evaluation_sessions es
         SET final_score  = sub.avg_score,
             final_grade  = (SELECT grade FROM grade_thresholds
                              WHERE ROUND(sub.avg_score, 1) >= min_score
                                AND ROUND(sub.avg_score, 1) <= max_score
                              LIMIT 1),
             status       = 'completed',
             completed_at = COALESCE(es.completed_at, NOW())
        FROM (
          SELECT session_id,
                 ROUND(AVG(total_score)::NUMERIC, 2) AS avg_score
            FROM evaluations
           WHERE role IN ('USER', 'GCP') AND status = 'saved'
           GROUP BY session_id
          HAVING COUNT(DISTINCT role) >= 2
        ) sub
       WHERE es.id = sub.session_id AND es.status != 'completed'
    `).catch(err => console.warn('session backfill warning:', err.message));

    // Fix grade thresholds to match frontend getGrade() logic
    await client.query(`
      INSERT INTO grade_thresholds (grade, min_score, max_score, label_th, label_en, color_hex)
      VALUES
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
        color_hex = EXCLUDED.color_hex
    `).catch(err => console.warn('grade_thresholds migration warning:', err.message));

    // ── New schema migrations (v3) ──────────────────────────────
    // suppliers: extra columns from Upload_Template
    await client.query(`
      ALTER TABLE suppliers
        ADD COLUMN IF NOT EXISTS tax_id           VARCHAR(30),
        ADD COLUMN IF NOT EXISTS category         VARCHAR(100),
        ADD COLUMN IF NOT EXISTS function_owner   VARCHAR(100),
        ADD COLUMN IF NOT EXISTS job_value_thb    DECIMAL(15,2),
        ADD COLUMN IF NOT EXISTS pta_approve_date DATE,
        ADD COLUMN IF NOT EXISTS buyer_name       VARCHAR(200),
        ADD COLUMN IF NOT EXISTS buyer_email      VARCHAR(200),
        ADD COLUMN IF NOT EXISTS evaluator_name   VARCHAR(200),
        ADD COLUMN IF NOT EXISTS evaluator_email  VARCHAR(200)
    `).catch(err => console.warn('suppliers migration warning:', err.message));

    // employees_role_check: single source of truth for this constraint's
    // value list (the rename migration above only drops it + updates data).
    await client.query(`
      ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
      ALTER TABLE employees
        ADD CONSTRAINT employees_role_check
        CHECK (role IN ('USER', 'GCP', 'ADMIN', 'SUPERVISOR'))
    `).catch(err => console.warn('employees role migration warning:', err.message));

    // evaluation_sessions_eval_type_check: sole source of truth for the
    // value list ('new_supplier' was retired — see the note above).
    await client.query(`
      ALTER TABLE evaluation_sessions DROP CONSTRAINT IF EXISTS evaluation_sessions_eval_type_check;
      ALTER TABLE evaluation_sessions
        ADD CONSTRAINT evaluation_sessions_eval_type_check
        CHECK (eval_type IN ('post_eval','pre_eval','half_year','yearly'));

      ALTER TABLE evaluation_sessions DROP CONSTRAINT IF EXISTS evaluation_sessions_status_check;
      ALTER TABLE evaluation_sessions
        ADD CONSTRAINT evaluation_sessions_status_check
        CHECK (status IN ('pending','in_progress','pending_review','completed','returned'))
    `).catch(err => console.warn('sessions constraint migration warning:', err.message));

    // Update trigger: both saved → pending_review (not completed directly)
    await client.query(`
      CREATE OR REPLACE FUNCTION recalculate_session_final_score()
      RETURNS TRIGGER AS $func$
      DECLARE
        v_session_id UUID;
        v_user_score DECIMAL;
        v_gcp_score  DECIMAL;
        v_final      DECIMAL;
        v_grade      VARCHAR(5);
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
             SET final_score = v_final, final_grade = v_grade,
                 status = 'pending_review'
           WHERE id = v_session_id AND status NOT IN ('completed','returned');
        ELSE
          UPDATE evaluation_sessions
             SET status = 'in_progress'
           WHERE id = v_session_id AND status = 'pending';
        END IF;
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_recalculate_score ON evaluations;
      CREATE TRIGGER trg_recalculate_score
        AFTER INSERT OR UPDATE ON evaluations
        FOR EACH ROW EXECUTE FUNCTION recalculate_session_final_score();
    `).catch(err => console.warn('trigger migration warning:', err.message));

    // Fix: a 'returned' session could never come back to 'pending_review'
    // after re-submission, because the guard above excluded 'returned' —
    // that's the exact status the supervisor "return for re-evaluation"
    // flow sets, so the whole cycle was a dead end. Only 'completed'
    // (already approved) should stay protected from being overwritten.
    await client.query(`
      CREATE OR REPLACE FUNCTION recalculate_session_final_score()
      RETURNS TRIGGER AS $func$
      DECLARE
        v_session_id UUID;
        v_user_score DECIMAL;
        v_gcp_score  DECIMAL;
        v_final      DECIMAL;
        v_grade      VARCHAR(5);
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
             SET final_score = v_final, final_grade = v_grade,
                 status = 'pending_review'
           WHERE id = v_session_id AND status != 'completed';
        ELSE
          UPDATE evaluation_sessions
             SET status = 'in_progress'
           WHERE id = v_session_id AND status IN ('pending', 'returned');
        END IF;
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_recalculate_score ON evaluations;
      CREATE TRIGGER trg_recalculate_score
        AFTER INSERT OR UPDATE ON evaluations
        FOR EACH ROW EXECUTE FUNCTION recalculate_session_final_score();
    `).catch(err => console.warn('returned-status trigger fix warning:', err.message));

    // New tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_upload_batches (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        uploaded_by  UUID REFERENCES employees(id),
        batch_type   VARCHAR(20) CHECK (batch_type IN ('pre_post_eval','half_year','yearly')),
        filename     VARCHAR(300),
        row_count    INTEGER DEFAULT 0,
        status       VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing','done','error')),
        error_msg    TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS evaluation_tasks (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id             UUID REFERENCES supplier_upload_batches(id),
        session_id           UUID REFERENCES evaluation_sessions(id),
        supplier_id          UUID REFERENCES suppliers(id),
        assigned_employee_id UUID REFERENCES employees(id),
        assigned_email       VARCHAR(200) NOT NULL,
        assigned_name        VARCHAR(200),
        role                 VARCHAR(10) CHECK (role IN ('ADMIN','USER','GCP','SUPERVISOR')),
        due_date             DATE NOT NULL,
        status               VARCHAR(20) DEFAULT 'pending'
                               CHECK (status IN ('pending','completed','overdue')),
        invitation_sent_at   TIMESTAMPTZ,
        reminder_sent_at     TIMESTAMPTZ,
        overdue_sent_at      TIMESTAMPTZ,
        thankyou_sent_at     TIMESTAMPTZ,
        created_at           TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_session   ON evaluation_tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_employee  ON evaluation_tasks(assigned_employee_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON evaluation_tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_status    ON evaluation_tasks(status);

      CREATE TABLE IF NOT EXISTS email_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id     UUID REFERENCES evaluation_tasks(id),
        email_type  VARCHAR(30),
        to_email    VARCHAR(200) NOT NULL,
        subject     VARCHAR(300),
        status      VARCHAR(10) DEFAULT 'sent',
        error_msg   TEXT,
        sent_at     TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS supervisor_reviews (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id     UUID NOT NULL REFERENCES evaluation_sessions(id),
        supervisor_id  UUID REFERENCES employees(id),
        status         VARCHAR(20) DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','returned')),
        notes          TEXT,
        review_due     TIMESTAMPTZ,
        reviewed_at    TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_supervisor_reviews_session ON supervisor_reviews(session_id);
      CREATE INDEX IF NOT EXISTS idx_supervisor_reviews_status  ON supervisor_reviews(status);
    `).catch(err => console.warn('new tables migration warning:', err.message));

    // evaluation_tasks_role_check: sole source of truth for the value list
    // ('BU' was retired — see the note near the top of this function).
    await client.query(`
      ALTER TABLE evaluation_tasks DROP CONSTRAINT IF EXISTS evaluation_tasks_role_check;
      ALTER TABLE evaluation_tasks
        ADD CONSTRAINT evaluation_tasks_role_check
        CHECK (role IN ('ADMIN','USER','GCP','SUPERVISOR'));
    `).catch(err => console.warn('evaluation_tasks role migration warning:', err.message));

    // evaluation_criteria: scope codes by criteria_set so PRE_CRITERIA and
    // POST_CRITERIA (src/constants.js) can both store code "1.1" etc. with
    // their own (different) meaning, then mirror constants.js into the DB
    // so server-side scoring (routes/evaluations.js) recognizes every code
    // the frontend form actually submits.
    await client.query(`
      ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS criteria_set VARCHAR(10) NOT NULL DEFAULT 'legacy';
      ALTER TABLE evaluation_criteria DROP CONSTRAINT IF EXISTS evaluation_criteria_code_key;
      ALTER TABLE evaluation_criteria DROP CONSTRAINT IF EXISTS evaluation_criteria_set_code_key;
      ALTER TABLE evaluation_criteria ADD CONSTRAINT evaluation_criteria_set_code_key UNIQUE (criteria_set, code);
    `).catch(err => console.warn('evaluation_criteria criteria_set migration warning:', err.message));

    const { seedCriteriaFromConstants } = require('./utils/seedCriteriaFromConstants');
    await seedCriteriaFromConstants(client)
      .then(() => console.log('✅ evaluation_criteria seeded from src/constants.js'))
      .catch(err => console.warn('criteria seed warning:', err.message));

    // Create default ADMIN account if none exists
    const bcrypt = require('bcrypt');
    const adminExists = await client.query(
      `SELECT employee_id FROM employees WHERE role = 'ADMIN' LIMIT 1`
    );
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@1234', 10);
      await client.query(
        `INSERT INTO employees (employee_id, full_name, email, role, password_hash, is_active)
         VALUES ('ADMIN-001', 'System Administrator', 'admin@system.local', 'ADMIN', $1, TRUE)
         ON CONFLICT (employee_id) DO NOTHING`,
        [hash]
      );
      console.log('✅ Admin account created  →  ID: ADMIN-001  |  Password: Admin@1234');
    }

    client.release();
    console.log('✅ PostgreSQL connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      startCronJobs();
    });
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
    process.exit(1);
  });
