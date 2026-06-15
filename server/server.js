'use strict';
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const pool = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Supplier Eval API is running" });
});

app.use('/api/evaluations', require('./routes/evaluations'));
app.use('/api/employees',   require('./routes/employees'));
app.use('/api/suppliers',   require('./routes/suppliers'));
app.use('/api/criteria',    require('./routes/criteria'));
app.use('/api/sessions',    require('./routes/sessions'));

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
