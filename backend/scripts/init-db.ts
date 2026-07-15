'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  });
  await client.connect();

  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
  const seedPath = path.join(__dirname, '..', '..', 'database', 'seed.sql');

  if (!process.argv.includes('--seed-only')) {
    console.log('Applying schema.sql ...');
    await client.query(fs.readFileSync(schemaPath, 'utf8'));
    console.log('Schema applied.');
  }

  if (process.argv.includes('--seed') || process.argv.includes('--seed-only')) {
    console.log('Applying seed.sql ...');
    await client.query(fs.readFileSync(seedPath, 'utf8'));
    console.log('Seed applied.');
  }

  await client.end();
}

run().catch((err: any) => {
  console.error('Init DB failed:', err.message);
  process.exit(1);
});
