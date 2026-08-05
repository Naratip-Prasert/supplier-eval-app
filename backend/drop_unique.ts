import { Pool } from 'pg';
require('dotenv').config({ quiet: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

async function dropUniqueConstraint() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = '"SPES2_suppliers"'::regclass
      AND contype = 'u';
    `);
    
    for (const row of res.rows) {
      if (row.conname.includes('vendor_code')) {
        await client.query(`ALTER TABLE "SPES2_suppliers" DROP CONSTRAINT "${row.conname}"`);
        console.log(`Dropped constraint: ${row.conname}`);
      }
    }
    console.log('Successfully removed UNIQUE constraint on vendor_code.');
  } catch(e) {
    console.error('Error dropping constraint:', e);
  } finally {
    client.release();
    pool.end();
  }
}
dropUniqueConstraint();
