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
