export {};
const pool = require('../db');

async function createView() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Creating Master_Data_All view...');
    await client.query(`
      CREATE OR REPLACE VIEW "Master_Data_All" AS
      SELECT emp_no, name, email, team, position, cobu_name FROM "Master_Data_GCP"
      UNION
      SELECT emp_no, name, email, team, position, cobu_name FROM "Master_Data_User"
      WHERE emp_no NOT IN (SELECT emp_no FROM "Master_Data_GCP");
    `);

    await client.query('COMMIT');
    console.log('Successfully created view!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

createView();
