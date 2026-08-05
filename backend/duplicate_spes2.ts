import { Pool } from 'pg';
require('dotenv').config({ quiet: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

async function duplicateTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get all tables starting with SPES2_ (but not SPES2_)
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'SPES\\_%' 
        AND table_name NOT LIKE 'SPES2\\_%';
    `);

    const tables = res.rows.map(r => r.table_name);
    console.log('Found tables:', tables);

    // Drop existing SPES2_ tables if they exist
    for (const table of tables) {
      const newTableName = table.replace('SPES2_', 'SPES2_');
      await client.query(`DROP TABLE IF EXISTS "${newTableName}" CASCADE;`);
      console.log(`Dropped ${newTableName} if it existed.`);
    }

    // 2. Create SPES2_ tables including structure (and default values, indexes)
    for (const table of tables) {
      const newTableName = table.replace('SPES2_', 'SPES2_');
      await client.query(`CREATE TABLE "${newTableName}" (LIKE "${table}" INCLUDING ALL);`);
      console.log(`Created ${newTableName}`);
    }

    // 3. Copy data from SPES2_ to SPES2_
    for (const table of tables) {
      const newTableName = table.replace('SPES2_', 'SPES2_');
      
      // Get all non-generated columns for the table
      const colsQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND is_generated = 'NEVER';
      `;
      const colsRes = await client.query(colsQuery, [table]);
      const columns = colsRes.rows.map(r => `"${r.column_name}"`).join(', ');

      if (columns.length > 0) {
        await client.query(`INSERT INTO "${newTableName}" (${columns}) SELECT ${columns} FROM "${table}";`);
        console.log(`Copied data to ${newTableName}`);
      } else {
        console.log(`No non-generated columns found for ${table}, skipped data copy.`);
      }
    }

    // 4. Update Foreign Keys to point to SPES2_ tables instead of SPES2_
    const fkQuery = `
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule,
          tc.constraint_name
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name LIKE 'SPES\\_%' AND tc.table_name NOT LIKE 'SPES2\\_%';
    `;
    const fks = await client.query(fkQuery);
    
    for (const fk of fks.rows) {
      const newTableName = fk.table_name.replace('SPES2_', 'SPES2_');
      let newForeignTableName = fk.foreign_table_name;
      if (newForeignTableName.startsWith('SPES2_')) {
        newForeignTableName = newForeignTableName.replace('SPES2_', 'SPES2_');
      }
      
      const constraintQuery = `
        ALTER TABLE "${newTableName}" 
        ADD CONSTRAINT "fk_spes2_${fk.constraint_name.substring(0, 30)}_${Math.floor(Math.random()*1000)}" 
        FOREIGN KEY ("${fk.column_name}") 
        REFERENCES "${newForeignTableName}" ("${fk.foreign_column_name}")
        ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule};
      `;
      console.log(`Adding FK to ${newTableName}: references ${newForeignTableName}`);
      await client.query(constraintQuery);
    }

    await client.query('COMMIT');
    console.log('Successfully duplicated all tables to SPES2_ with data and FKs!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error duplicating tables:', e);
  } finally {
    pool.end();
  }
}

duplicateTables();
