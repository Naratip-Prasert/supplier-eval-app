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
app.use(express.json());

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
  .then(client => {
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
