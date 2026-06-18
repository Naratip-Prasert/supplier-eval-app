'use strict';
const { Pool } = require('pg'); //โหลด class pool มาใช้จาก module pg
require('dotenv').config(); // ดึงค่าจาก .env  มาใช้ จะได้ไม่ต้อง hardcode

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message);
}); // โยน error ออกทาง console ไม่งั้น backend จะ crash ได้

module.exports = pool;
