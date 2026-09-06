import { Pool } from 'pg';
import { readFileSync } from 'fs';

async function run() {
  const pool = new Pool({ connectionString: 'postgres://cortexw:cortexw_dev@localhost:5435/cortexw' });
  const sql = readFileSync('src/db/migrations/005_raw_telemetry.sql', 'utf-8');
  await pool.query(sql);
  console.log('Migration 005 applied successfully!');
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
  console.log('Tables in database:', res.rows.map((r: any) => r.table_name));
  await pool.end();
}

run().catch(console.error);
