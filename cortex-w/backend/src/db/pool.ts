import pg from 'pg';
import { config } from '../config/env.js';

const isCloudDb =
  config.DATABASE_URL.includes('neon.tech') ||
  config.DATABASE_URL.includes('sslmode=require') ||
  config.DATABASE_URL.includes('amazonaws.com') ||
  Boolean(process.env.VERCEL);

// Newer pg drivers read ?sslmode=require in the URL as "verify the certificate", which overrides the ssl option below
// and fails against the AWS RDS certificate ("self-signed certificate in certificate chain"). The ssl option is the
// single place that decides, so the URL's sslmode is dropped.
const connectionString = config.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');

export const pool = new pg.Pool({
  connectionString,
  ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
  // Hosted Postgres (Neon) drops idle connections and can be slow to accept new ones, so:
  // How many queries can run at once. Left at the driver's default of 10: a test with 20 was no faster under the same
  // load (the cost is the queries themselves, not connection queueing). Override with DB_POOL_MAX if that changes.
  max: Number(process.env.DB_POOL_MAX) > 0 ? Number(process.env.DB_POOL_MAX) : 10,
  keepAlive: true, // detect dead connections sooner
  idleTimeoutMillis: 30_000, // retire idle connections before the server closes them on us
  connectionTimeoutMillis: 20_000, // fail a stuck connect instead of hanging the request
});

// An idle connection that the server drops emits 'error' on the pool. Without a listener Node treats it
// as an unhandled error and takes the whole process down; log it and let the pool open a fresh connection.
pool.on('error', (err) => {
  console.warn('[db] Idle connection error (the pool will reconnect):', err.message);
});

const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', '57P01', '08006', '08003']);

/** Runs `fn`, retrying once if it failed on a transient network/connection error (never on a real SQL error). */
export async function retryTransient<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (!TRANSIENT_CODES.has(err?.code)) throw err;
    console.warn(`[db] Transient error (${err.code}); retrying once`);
    return fn();
  }
}
