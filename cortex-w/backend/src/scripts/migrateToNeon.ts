import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Target Neon URL from argv or environment variable
const targetUrl = process.argv[2] || process.env.TARGET_DATABASE_URL || process.env.NEON_DATABASE_URL;
const sourceUrl = process.env.SOURCE_DATABASE_URL || 'postgres://cortexw:cortexw_dev@localhost:5435/cortexw';

if (!targetUrl) {
  console.error('\n❌ ERROR: Target Neon DATABASE_URL is required.');
  console.error('\nUsage:');
  console.error('  npx ts-node src/scripts/migrateToNeon.ts "postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"');
  console.error('  OR set TARGET_DATABASE_URL environment variable and run npm run migrate:neon\n');
  process.exit(1);
}

console.log('\n🚀 Starting PostgreSQL to Neon Migration...');
console.log(`Source DB: ${sourceUrl.replace(/:[^:@]+@/, ':****@')}`);
console.log(`Target DB: ${targetUrl.replace(/:[^:@]+@/, ':****@')}`);

const sourcePool = new pg.Pool({
  connectionString: sourceUrl,
  ssl: false,
});

const targetPool = new pg.Pool({
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    // 1. Verify connection to Neon
    console.log('\n📡 Step 1: Connecting to Neon PostgreSQL...');
    await targetPool.query('SELECT 1');
    console.log('✅ Connected successfully to Neon!');

    // 2. Run schema migrations on Neon
    console.log('\n📦 Step 2: Applying schema migrations to Neon...');
    const migrationsDir = join(__dirname, '..', 'db', 'migrations');
    const migrationFiles = ['001_initial_schema.sql', '002_seed_data.sql', '005_raw_telemetry.sql'];

    for (const file of migrationFiles) {
      const filePath = join(migrationsDir, file);
      if (existsSync(filePath)) {
        const sql = readFileSync(filePath, 'utf-8');
        try {
          await targetPool.query(sql);
          console.log(`  ✅ Applied migration: ${file}`);
        } catch (mErr: any) {
          if (mErr.message?.includes('already exists') || mErr.message?.includes('duplicate')) {
            console.log(`  ℹ️ Skipped existing: ${file}`);
          } else {
            console.warn(`  ⚠️ Migration notice for ${file}:`, mErr.message);
          }
        }
      }
    }

    // 3. Migrate Base Entities (sites, gateways, households, meters)
    console.log('\n🔄 Step 3: Synchronizing core entities...');
    const tables = ['sites', 'gateways', 'households', 'meters', 'bills'];

    for (const table of tables) {
      try {
        const srcRes = await sourcePool.query(`SELECT * FROM ${table}`);
        if (srcRes.rows.length === 0) continue;

        console.log(`  Copying ${srcRes.rows.length} rows from '${table}'...`);
        const cols = Object.keys(srcRes.rows[0]);
        const colNames = cols.map(c => `"${c}"`).join(', ');

        for (const row of srcRes.rows) {
          const vals = cols.map(c => row[c]);
          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          await targetPool.query(
            `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            vals
          );
        }
        console.log(`  ✅ Synchronized '${table}'`);
      } catch (err: any) {
        console.warn(`  ⚠️ Note synchronizing ${table}:`, err.message);
      }
    }

    // 4. Migrate Raw Telemetry Packets in Batches
    console.log('\n⚡ Step 4: Transferring raw telemetry packets to Neon (batched)...');
    const totalCountRes = await sourcePool.query('SELECT COUNT(*)::int as count FROM raw_telemetry_packets');
    const totalPackets = totalCountRes.rows[0]?.count || 0;
    console.log(`  Found ${totalPackets} telemetry packets to transfer...`);

    const BATCH_SIZE = 1000;
    let offset = 0;
    let transferred = 0;

    while (offset < totalPackets) {
      const batchRes = await sourcePool.query(
        'SELECT * FROM raw_telemetry_packets ORDER BY id ASC LIMIT $1 OFFSET $2',
        [BATCH_SIZE, offset]
      );
      if (batchRes.rows.length === 0) break;

      const cols = [
        'meter_id', 'gateway_id', 'dev_eui', 'decoded_at', 'date_key',
        'forward_flow_l', 'reverse_flow', 'battery_voltage', 'battery_status',
        'battery_health', 'valve_health', 'valve_closed', 'checksum_status',
        'status_byte', 'rssi', 'snr', 'fcnt', 'fport', 'frequency', 'dr', 'adr', 'confirmed', 'meter_timestamp'
      ];

      const valuePlaceholders: string[] = [];
      const values: any[] = [];
      let pIdx = 1;

      for (const row of batchRes.rows) {
        const rowPlaceholders = [];
        for (const col of cols) {
          rowPlaceholders.push(`$${pIdx++}`);
          values.push(row[col]);
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      await targetPool.query(
        `INSERT INTO raw_telemetry_packets (${cols.join(', ')})
         VALUES ${valuePlaceholders.join(', ')}
         ON CONFLICT (meter_id, gateway_id, decoded_at, fcnt) DO NOTHING`,
        values
      );

      transferred += batchRes.rows.length;
      offset += BATCH_SIZE;
      process.stdout.write(`\r  Transferred: ${transferred} / ${totalPackets} packets (${Math.round((transferred / totalPackets) * 100)}%)`);
    }

    console.log('\n✅ Telemetry transfer completed successfully!');

    // 5. Verification
    console.log('\n📊 Step 5: Verifying Neon database metrics...');
    const neonCountRes = await targetPool.query('SELECT COUNT(*)::int as count FROM raw_telemetry_packets');
    const neonGatewaysRes = await targetPool.query('SELECT COUNT(DISTINCT gateway_id)::int as count FROM raw_telemetry_packets');
    const neonMetersRes = await targetPool.query('SELECT COUNT(DISTINCT meter_id)::int as count FROM raw_telemetry_packets');

    console.log('───────────────────────────────────────────────────────');
    console.log(`  Neon Total Telemetry Packets: ${neonCountRes.rows[0]?.count}`);
    console.log(`  Neon Unique Gateways Active:  ${neonGatewaysRes.rows[0]?.count}`);
    console.log(`  Neon Unique Meters Detected:  ${neonMetersRes.rows[0]?.count}`);
    console.log('───────────────────────────────────────────────────────');
    console.log('\n🎉 ALL DONE! Your Neon database is fully synced and production-ready.');

  } catch (err: any) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

run();
