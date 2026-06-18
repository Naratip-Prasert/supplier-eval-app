'use strict';
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const pool = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '8mb' }));

// ── Request logger ────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms      = Date.now() - start;
    const status  = res.statusCode;
    const emoji   = status >= 500 ? '❌' : status >= 400 ? '⚠️ ' : '✅';
    const line    = `${emoji} ${req.method.padEnd(6)} ${req.originalUrl.padEnd(45)} ${status}  (${ms}ms)`;
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

pool.connect()
  .then(async client => {
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_picture TEXT`
    ).catch(() => {});

    await client.query(
      `ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS raw_scores JSONB`
    ).catch(() => {});

    // Rename role BU → USER, add ADMIN to evaluations constraint
    // UPDATE data FIRST, then ADD CONSTRAINT (constraint validates existing rows immediately)
    await client.query(`
      ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
      UPDATE employees SET role = 'USER' WHERE role = 'BU';
      ALTER TABLE employees
        ADD CONSTRAINT employees_role_check
        CHECK (role IN ('USER', 'GCP', 'ADMIN'));

      ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_role_check;
      UPDATE evaluations SET role = 'USER' WHERE role = 'BU';
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
           WHERE v_final >= min_score AND v_final <= max_score
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
                              WHERE sub.avg_score >= min_score
                                AND sub.avg_score <= max_score
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
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
    process.exit(1);
  });
