import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config, sessionKeyBytes } from '../config/env.js';
import { pool } from '../db/pool.js';

/**
 * Persists the newest session token per client, encrypted, so scheduled work
 * can act for a client with no live request (see 010_client_sessions.sql).
 * AES-256-GCM, a fresh random IV per write, and the client key bound as
 * additional authenticated data so a row can't be swapped onto another client.
 * Everything here is best-effort and never throws into a request.
 */
const key: Buffer | null = config.SESSION_ENCRYPTION_KEY ? sessionKeyBytes(config.SESSION_ENCRYPTION_KEY) : null;
let warned = false;

export const sessionsPersisted = (): boolean => key !== null && config.APP_DATA_MODE !== 'seed';

if (!key && config.APP_DATA_MODE !== 'seed') {
  warned = true;
  console.warn('[sessions] SESSION_ENCRYPTION_KEY is not set: sessions are not stored, so scheduled sync only covers clients signed in on this process.');
}
void warned;

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function encrypt(plain: string, clientKey: string, k: Buffer = key!): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(Buffer.from(clientKey));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

/** Returns null for anything that doesn't decrypt cleanly (wrong key, tampering, wrong client). */
export function decrypt(blob: string, clientKey: string, k: Buffer = key!): string | null {
  try {
    const [iv, tag, ct] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', k, iv);
    d.setAAD(Buffer.from(clientKey));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const lastWritten = new Map<string, { hash: string; at: number }>();
const REWRITE_EVERY_MS = 10 * 60 * 1000;

/**
 * Stores the token as the client's current session. Keeps the existing one if
 * it outlives this one (two users of a client: the longer-lived token wins).
 * Throttled so a busy client doesn't write on every request.
 */
export async function saveSession(clientKey: string, rawJwt: string, expiresAtMs: number): Promise<void> {
  if (!sessionsPersisted()) return;
  const hash = tokenHash(rawJwt);
  const prev = lastWritten.get(clientKey);
  if (prev && prev.hash === hash && Date.now() - prev.at < REWRITE_EVERY_MS) return;
  try {
    await pool.query(
      `INSERT INTO client_sessions (client_key, token_hash, token_enc, expires_at, last_seen, updated_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), NOW(), NOW())
       ON CONFLICT (client_key) DO UPDATE SET
         token_hash = CASE WHEN EXCLUDED.expires_at >= client_sessions.expires_at OR client_sessions.expires_at < NOW()
                           THEN EXCLUDED.token_hash ELSE client_sessions.token_hash END,
         token_enc  = CASE WHEN EXCLUDED.expires_at >= client_sessions.expires_at OR client_sessions.expires_at < NOW()
                           THEN EXCLUDED.token_enc ELSE client_sessions.token_enc END,
         expires_at = GREATEST(EXCLUDED.expires_at, CASE WHEN client_sessions.expires_at < NOW() THEN EXCLUDED.expires_at ELSE client_sessions.expires_at END),
         last_seen  = NOW(),
         updated_at = NOW()`,
      [clientKey, hash, encrypt(rawJwt, clientKey), expiresAtMs]
    );
    lastWritten.set(clientKey, { hash, at: Date.now() });
  } catch (err: any) {
    console.warn('[sessions] could not store session:', err?.message || err);
  }
}

export interface StoredSession {
  clientKey: string;
  token: string;
  expiresAtMs: number;
}

/** Unexpired stored sessions (optionally only those used within maxIdleHours). Rows that fail to decrypt are skipped. */
export async function loadSessions(): Promise<StoredSession[]> {
  if (!sessionsPersisted()) return [];
  try {
    const idle = config.CLIENT_SYNC_MAX_IDLE_HOURS;
    const r = await pool.query(
      `SELECT client_key, token_enc, expires_at FROM client_sessions
        WHERE expires_at > NOW() AND ($1::float8 = 0 OR last_seen > NOW() - ($1::float8 * INTERVAL '1 hour'))`,
      [idle]
    );
    const out: StoredSession[] = [];
    for (const row of r.rows) {
      const token = decrypt(row.token_enc, row.client_key);
      if (token) out.push({ clientKey: row.client_key, token, expiresAtMs: new Date(row.expires_at).getTime() });
      else console.warn(`[sessions] stored session for client ${row.client_key} could not be decrypted; ignoring it.`);
    }
    return out;
  } catch (err: any) {
    console.warn('[sessions] could not load sessions:', err?.message || err);
    return [];
  }
}

/** Deletes the stored session holding exactly this token (logout, or upstream stopped accepting it). */
export async function deleteSession(rawJwt: string): Promise<void> {
  const hash = tokenHash(rawJwt);
  for (const [k, v] of lastWritten) if (v.hash === hash) lastWritten.delete(k);
  if (!sessionsPersisted()) return;
  try {
    await pool.query('DELETE FROM client_sessions WHERE token_hash = $1', [hash]);
  } catch (err: any) {
    console.warn('[sessions] could not delete session:', err?.message || err);
  }
}
