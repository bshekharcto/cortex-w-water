import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: 'postgres://cortexw:cortexw_dev@localhost:5435/cortexw' });
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
  console.log('Existing tables in cortexw:', res.rows.map((r: any) => r.table_name));
  await pool.end();
}

main().catch(console.error);
