import pg from 'pg';
import { config } from '../config/env.js';

const isCloudDb =
  config.DATABASE_URL.includes('neon.tech') ||
  config.DATABASE_URL.includes('sslmode=require') ||
  config.DATABASE_URL.includes('amazonaws.com') ||
  Boolean(process.env.VERCEL);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
});


// An idle pooled connection can be dropped by the network or RDS (e.g.
// ETIMEDOUT after a laptop sleeps). pg emits that as an 'error' event on the
// pool, and with no listener Node treats it as fatal and kills the whole
// server. The broken client is already discarded by the pool; log and carry on.
pool.on('error', (err) => {
  console.warn('[db] Idle client error (connection discarded):', err.message);
});
