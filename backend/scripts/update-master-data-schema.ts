export { };
const pool = require('../db');

async function updateSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Adding status column to Master_Data_GCP...');
    await client.query(`ALTER TABLE "Master_Data_GCP" ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);

    console.log('Adding status column to Master_Data_User...');
    await client.query(`ALTER TABLE "Master_Data_User" ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);

    console.log('Recreating Master_Data_All view...');
    await client.query(`
      CREATE OR REPLACE VIEW "Master_Data_All" AS
      SELECT emp_no, name, email, team, position, cobu_name, status FROM "Master_Data_GCP"
      UNION
      SELECT emp_no, name, email, team, position, cobu_name, status FROM "Master_Data_User"
      WHERE emp_no NOT IN (SELECT emp_no FROM "Master_Data_GCP");
    `);

    await client.query('COMMIT');
    console.log('Successfully updated schema!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

updateSchema();
