import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { pool } from '../db/pool.js';

/**
 * express-rate-limit store kept in Postgres (rate_limit_hits). The default
 * in-memory store counts per process, so on Vercel an attacker is simply
 * spread across instances and never hits the limit. Used for the login
 * lockout, where that matters.
 */
export class PgRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 15 * 60 * 1000;

  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private k(key: string) {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const r = await pool.query(
      `INSERT INTO rate_limit_hits (key, hits, reset_at)
       VALUES ($1, 1, NOW() + ($2::float8 * INTERVAL '1 millisecond'))
       ON CONFLICT (key) DO UPDATE SET
         hits     = CASE WHEN rate_limit_hits.reset_at <= NOW() THEN 1 ELSE rate_limit_hits.hits + 1 END,
         reset_at = CASE WHEN rate_limit_hits.reset_at <= NOW() THEN NOW() + ($2::float8 * INTERVAL '1 millisecond') ELSE rate_limit_hits.reset_at END
       RETURNING hits, reset_at`,
      [this.k(key), this.windowMs]
    );
    // Opportunistic cleanup so the table doesn't grow without bound.
    if (Math.random() < 0.02) {
      pool.query('DELETE FROM rate_limit_hits WHERE reset_at < NOW() - INTERVAL \'1 day\'').catch(() => undefined);
    }
    return { totalHits: Number(r.rows[0].hits), resetTime: new Date(r.rows[0].reset_at) };
  }

  async decrement(key: string): Promise<void> {
    await pool.query('UPDATE rate_limit_hits SET hits = GREATEST(hits - 1, 0) WHERE key = $1', [this.k(key)]);
  }

  async resetKey(key: string): Promise<void> {
    await pool.query('DELETE FROM rate_limit_hits WHERE key = $1', [this.k(key)]);
  }
}
