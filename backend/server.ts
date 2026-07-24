'use strict';
import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
const express      = require('express'); // express เป็น framework ที่ทำให้ node.js รับ http request ได้ง่าย
const helmet       = require('helmet'); // ตั้ง security headers มาตรฐาน (CSP, HSTS, X-Frame-Options ฯลฯ) และปิด X-Powered-By
const cors         = require('cors'); // เช็คว่าโดเมนที่เรียกเข้ามา ได้รับอนุญาตให้ดึงข้อมูลจาก API ของเราไหม
const cookieParser = require('cookie-parser');
const path         = require('path');

const pool = require('./db'); // ./db already calls dotenv.config() — no need to call it again here

const app  = express(); //สร้าง Express Application — app คือ object หลักที่เราจะ config ทุกอย่างลงไป
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// This is a pure JSON API (no HTML/inline scripts ever served from here —
// the frontend is a separate Next.js app on Vercel), so helmet's default
// CSP has nothing to break; defaults are safe as-is.
app.use(helmet());

// Production origins come from FRONTEND_URL (comma-separated if there's more
// than one, e.g. a Vercel preview + the production domain) — local dev
// origins (any localhost port) are always allowed alongside them, but only
// outside production (a prod deploy should never accept a bare localhost
// Origin header).
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({ // app.use(...) คือการเพิ่ม middleware - บอก express ว่าใช้ cor middleware กับทุก req
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {  //กำหนด function ตรวจสอบ origin
    const isDevLocalhost = !isProd && !!origin && /^http:\/\/localhost:\d+$/.test(origin);
    if (!origin || isDevLocalhost || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '8mb' })); //บอก Express ให้แปลง JSON ที่ส่งมาใน request body เป็น JavaScript object อัตโนมัติ
app.use(cookieParser());

// Evidence-file attachments (EvalForm note popup) — served back out as
// plain downloadable links, never embedded via <img>/fetch from the
// frontend, so helmet's default Cross-Origin-Resource-Policy (which would
// otherwise block a cross-origin <img src>) never comes into play here.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Blocks CSRF against the two multer/multipart upload routes below — those
// use a CORS "simple" content-type (multipart/form-data) that skips the
// preflight our strict-origin CORS check would otherwise rely on. A plain
// cross-site <form> POST can't set a custom header, so requiring one here
// forces the same origin-check gate onto every mutating request that the
// JSON routes already get for free (application/json isn't CORS-simple).
function requireCustomHeader(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.headers['x-requested-with']) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}
app.use(requireCustomHeader);

// ── Request logger ────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => { // เพิ่ม middleware ที่จะรันกับทุก request — รับ parameter 3 ตัวเสมอ: req (request), res (response), next (ฟังก์ชันที่บอกให้ไปต่อ)
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

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Supplier Eval API is running" });
});

// Login (and re-confirming your own password via verify-password) has no
// other brute-force protection (no lockout, no CAPTCHA) — cap attempts per
// IP so password-guessing can't be scripted unbounded. verify-password
// requires an already-valid JWT, so the risk is lower than /login, but a
// stolen/short-lived token would otherwise let someone guess the real
// password with unlimited attempts through that endpoint.
const { rateLimit } = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/verify-password', loginLimiter);

// Blanket cap on every other /api route — /login and /verify-password
// already have their own tighter limiter above (this one still applies to
// them too, but its window is wide enough never to bind first). Without
// this, an authenticated-but-malicious/compromised client (or a script
// hitting a public route) could hammer any endpoint with no limit at all.
// 300/15min turned out way too low for real admin usage — the Criteria
// Editor alone fires 4 GET requests (pre/post × core/function) on every tab
// switch, and a single bulk weight-save can burn through dozens of PATCH
// calls in seconds. This is meant to catch a runaway script, not throttle
// a human clicking through the Admin UI.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'มีการเรียกใช้งานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});
app.use('/api', apiLimiter);

app.use('/api/auth',        require('./routes/public/auth'));          // public
app.use('/api/evaluations', requireAuth, require('./routes/shared/evaluations'));
app.use('/api/uploads',     requireAuth, require('./routes/shared/uploads'));
app.use('/api/employees',   requireAuth, require('./routes/shared/employees'));
app.use('/api/suppliers',   requireAuth, require('./routes/shared/suppliers'));
app.use('/api/criteria',    requireAuth, require('./routes/shared/criteria'));
app.use('/api/sessions',    requireAuth, require('./routes/supervisor/sessions'));
app.use('/api/admin',       requireAuth, require('./routes/admin/admin'));
app.use('/api/supervisor',  requireAuth, require('./routes/supervisor/supervisor'));
// Suppliers have no login in this system — reached only via a one-time
// emailed token, see database/CROSS_EVALUATION_SPEC.md.
app.use('/api/public/supplier-eval', require('./routes/public/publicSupplierEval'));
app.use('/api/service-evaluations', requireAuth, require('./routes/shared/serviceEvaluations'));
// Proxies to the Gemini API (free tier has its own daily/per-minute quota
// once GEMINI_API_KEY is configured) — capped tighter than the blanket
// apiLimiter above so a chatty widget session can't burn through that quota.
const assistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'ถามผู้ช่วย AI บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});
app.use('/api/assistant', requireAuth, assistantLimiter, require('./routes/shared/assistant'));

const { startCronJobs } = require('./utils/cronJobs');

pool.connect()
  .then(async (client: PoolClient) => {
    // Reference data that must always be present and correct — kept as an
    // idempotent UPSERT (not a one-time migration) because seed.sql's copy
    // of this table is stale (old 4-grade scheme with no F, wrong score
    // boundaries) and nothing else in the app ever writes these rows, so
    // this UPSERT is the only thing keeping them right.
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
    `).catch((err: any) => console.warn('grade_thresholds migration warning:', err.message));

    // group_labels: per-ESG-subgroup label overrides (Thai/English), sibling
    // to the existing group_weights column — lets an admin rename/add/remove
    // ESG sub-groups (Environment/Social/Governance) from the Parameter page
    // instead of those 3 groups being permanently hardcoded in constants.js.
    await client.query(`
      ALTER TABLE evaluation_main_criteria ADD COLUMN IF NOT EXISTS group_labels JSONB;
    `).catch((err: any) => console.warn('group_labels column migration warning:', err.message));

    // ── DEAD-CODE REMOVAL NOTE (2026-07-08) ──────────────────────
    // A long chain of one-time schema/data migrations used to run here on
    // every startup: employees/evaluations/suppliers column adds, CHECK
    // constraint rebuilds after 'BU'/'new_supplier' were retired, a session
    // final_score backfill, CREATE TABLE IF NOT EXISTS for
    // supplier_upload_batches/evaluation_tasks/email_logs/supervisor_reviews
    // (+ their indexes and a later notified_at column add), a trigger-
    // function redefinition (the 'returned' status fix), category code
    // renames (PRE-CAT→PRE-CORE etc.), ESG item code renames (5.1.1→ESG1.1),
    // and is_active/group_weights/level_values column adds. Removed after
    // confirming directly against the live DB that every one of them was
    // permanently satisfied (0 old-format rows anywhere, every column/
    // table/constraint/trigger already present and matching). Their
    // end-state is now schema.sql's job to document for any future fresh
    // install — keep schema.sql in sync if the shape changes again.
    const { seedCriteriaFromConstants } = require('./utils/seedCriteriaFromConstants');
    await seedCriteriaFromConstants(client)
      .then(() => console.log('✅ evaluation_sub_criteria seeded from shared/criteria-data.json'))
      .catch((err: any) => console.warn('criteria seed warning:', err.message));

    // Create default ADMIN account if none exists. The bootstrap password
    // is randomly generated (not a fixed, guessable default like the old
    // 'Admin@1234') — there's now no replacement self-service flow to
    // change it (register/forgot-password were removed), so whoever reads
    // this log line should change it from an ADMIN-side flow once one
    // exists, or treat this account as already provisioned correctly.
    const bcrypt = require('bcrypt');
    const adminExists = await client.query(
      `SELECT employee_id FROM employees WHERE role = 'ADMIN' LIMIT 1`
    );
    if (adminExists.rows.length === 0) {
      const tempPassword = require('crypto').randomBytes(9).toString('base64').replace(/[+/=]/g, '');
      const hash = await bcrypt.hash(tempPassword, 10);
      await client.query(
        `INSERT INTO employees (employee_id, full_name, email, role, password_hash, is_active)
         VALUES ('ADMIN-001', 'System Administrator', 'admin@system.local', 'ADMIN', $1, TRUE)
         ON CONFLICT (employee_id) DO NOTHING`,
        [hash]
      );
      console.log(`✅ Admin account created  →  ID: ADMIN-001  |  Password: ${tempPassword}  (save this now — it is not recoverable, there is no self-service reset)`);
    }

    client.release();
    console.log('✅ PostgreSQL connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      startCronJobs();
    });
  })
  .catch((err: any) => {
    console.error('❌ PostgreSQL connection error:', err.message);
    process.exit(1);
  });
