'use strict';
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const pool = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/evaluations', require('./route/evaluations'));
app.use('/api/employees',   require('./route/employees'));
app.use('/api/suppliers',   require('./route/suppliers'));
app.use('/api/criteria',    require('./route/criteria'));
app.use('/api/sessions',    require('./route/sessions'));

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
