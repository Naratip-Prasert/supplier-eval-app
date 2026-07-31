export {};
const pool = require('../db');

async function check() {
  const client = await pool.connect();
  try {
    const res1 = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Master_Data_GCP' AND column_name='status';`);
    console.log('GCP status column:', res1.rows);
    const res2 = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Master_Data_User' AND column_name='status';`);
    console.log('User status column:', res2.rows);
    
    // Check if there's any data
    const data1 = await client.query(`SELECT emp_no, status FROM "Master_Data_GCP" LIMIT 2;`);
    console.log('GCP data:', data1.rows);
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}
check();
