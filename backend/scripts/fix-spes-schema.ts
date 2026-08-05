export {};
const pool = require('../db');

async function fixSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Altering column types to text...');
    
    await client.query(`ALTER TABLE "SPES2_evaluation_sessions" ALTER COLUMN initiated_by TYPE text USING initiated_by::text;`);
    await client.query(`ALTER TABLE "SPES2_evaluations" ALTER COLUMN employee_id TYPE text USING employee_id::text;`);
    await client.query(`ALTER TABLE "SPES2_evaluation_tasks" ALTER COLUMN assigned_employee_id TYPE text USING assigned_employee_id::text;`);
    await client.query(`ALTER TABLE "SPES2_supervisor_reviews" ALTER COLUMN supervisor_id TYPE text USING supervisor_id::text;`);
    await client.query(`ALTER TABLE "SPES2_employee_supplier_permissions" ALTER COLUMN employee_id TYPE text USING employee_id::text;`);
    await client.query(`ALTER TABLE "SPES2_service_evaluations" ALTER COLUMN evaluator_employee_id TYPE text USING evaluator_employee_id::text;`);
    await client.query(`ALTER TABLE "SPES2_service_evaluations" ALTER COLUMN target_employee_id TYPE text USING target_employee_id::text;`);
    await client.query(`ALTER TABLE "SPES2_supplier_upload_batches" ALTER COLUMN uploaded_by TYPE text USING uploaded_by::text;`);
    
    const fkQueries = [
      "ALTER TABLE \"SPES2_evaluation_sessions\" DROP CONSTRAINT IF EXISTS evaluation_sessions_initiated_by_fkey;",
      "ALTER TABLE \"SPES2_evaluations\" DROP CONSTRAINT IF EXISTS evaluations_employee_id_fkey;",
      "ALTER TABLE \"SPES2_evaluation_tasks\" DROP CONSTRAINT IF EXISTS evaluation_tasks_assigned_employee_id_fkey;",
      "ALTER TABLE \"SPES2_supervisor_reviews\" DROP CONSTRAINT IF EXISTS supervisor_reviews_supervisor_id_fkey;",
      "ALTER TABLE \"SPES2_employee_supplier_permissions\" DROP CONSTRAINT IF EXISTS employee_supplier_permissions_employee_id_fkey;",
      "ALTER TABLE \"SPES2_service_evaluations\" DROP CONSTRAINT IF EXISTS service_evaluations_evaluator_employee_id_fkey;",
      "ALTER TABLE \"SPES2_service_evaluations\" DROP CONSTRAINT IF EXISTS service_evaluations_target_employee_id_fkey;",
      "ALTER TABLE \"SPES2_supplier_upload_batches\" DROP CONSTRAINT IF EXISTS supplier_upload_batches_uploaded_by_fkey;"
    ];
    for (const q of fkQueries) {
      await client.query(q).catch((e: any) => console.warn(e.message));
    }
    
    await client.query('COMMIT');
    console.log('Successfully fixed schema!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixSchema();
