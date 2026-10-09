import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // process.loadEnvFile needs Node 20.12+; on older Node read the file by hand (KEY=value lines, # comments,
    // optional quotes). Variables already set in the environment win, as with loadEnvFile.
    try {
      for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m || line.trim().startsWith('#')) continue;
        const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
        if (process.env[m[1]] === undefined) process.env[m[1]] = value;
      }
    } catch {
      // ignore
    }
  }
}

/** The 32 key bytes in a SESSION_ENCRYPTION_KEY value, or null if it isn't one. */
export function sessionKeyBytes(v: string): Buffer | null {
  const b = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  return b.length === 32 ? b : null;
}

const DEFAULT_JWT_SECRET = 'change-me-in-real-deployment';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_DATA_MODE: z.enum(['seed', 'api', 'hybrid']).default('api'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/cortex_w'),
  // Upstream (cog-core-api) location and the service account used for
  // background/unauthenticated calls. Deliberately NO defaults: a default
  // would silently point a mis-configured (or dev) process at production.
  // They are required unless the app runs purely on seed data — see below.
  UPSTREAM_API_BASE_URL: z.string().url().optional(),
  UPSTREAM_DATA_REST_URL: z.string().url().optional(),
  COGNECTO_API_URL: z.string().url().optional(), // login host; falls back to UPSTREAM_API_BASE_URL
  UPSTREAM_SERVICE_USERNAME: z.string().min(1).optional(),
  UPSTREAM_SERVICE_PASSWORD: z.string().min(1).optional(),
  // Signs demo tokens in seed mode only. Never used to accept tokens in api mode.
  JWT_LOCAL_SIGNING_SECRET: z.string().default(DEFAULT_JWT_SECRET),
  // How the upstream (cog-core-api) JWT is verified. Set ONE of the two:
  // a PEM public key (RS256/ES256) or a shared secret (HS256). If neither is
  // set the signature cannot be checked and only expiry is enforced (warned).
  UPSTREAM_JWT_PUBLIC_KEY: z.string().optional(),
  UPSTREAM_JWT_SECRET: z.string().optional(),
  UPSTREAM_JWT_ISSUER: z.string().optional(),
  // Shared secret the scheduler must present to /command-center/sync-cron.
  CRON_SECRET: z.string().min(16).optional(),
  // 32-byte key (64 hex chars, or base64) that encrypts stored session tokens.
  // Without it nothing is persisted: scheduled sync then only covers clients
  // with a live session on THIS process. Generate: openssl rand -hex 32
  SESSION_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => !v || sessionKeyBytes(v) !== null, 'SESSION_ENCRYPTION_KEY must be 32 bytes as 64 hex chars or base64'),
  // Stop syncing a client this long after anyone from it last used the app.
  // 0 = no idle limit: sync until the stored token expires (about 7 days).
  CLIENT_SYNC_MAX_IDLE_HOURS: z.coerce.number().min(0).default(0),
  // Wall-clock budget for one sync run, in ms. 0 = automatic: 45s on Vercel (a
  // function is killed at 60s), unlimited on an always-on server.
  SYNC_TIME_BUDGET_MS: z.coerce.number().int().min(0).default(0),
  // How many days back each sync run checks for missing telemetry (a day that already
  // has data is skipped cheaply). Covers a gap after a client's session lapsed: with
  // the 7-day token this heals a lapse of up to 7 + this many days.
  SYNC_BACKFILL_DAYS: z.coerce.number().int().min(3).max(60).default(10),
  // Number of reverse proxies in front of the API (nginx = 1), so req.ip and
  // rate limiting see the real client. 0 = none.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SEED_FRESHNESS_HOURS: z.coerce.number().default(36),
  // Comma-separated list of browser origins allowed to call this API
  // cross-origin, e.g. "https://app.example.com,http://localhost:5173".
  // "*" allows any origin (development only). Same-origin requests and
  // non-browser callers (no Origin header) are never affected.
  CORS_ORIGIN: z.string().default('*'),
  // Zone whose midnight defines "today" / "yesterday" / "month" for flow figures.
  TELEMETRY_TIMEZONE: z.string().default('Asia/Kolkata'),
  // A meter that reported within this many hours counts as CONNECTED when
  // neither the DMA report nor the asset inventory gives a status.
  METER_CONNECTED_WINDOW_HOURS: z.coerce.number().positive().default(24),
});

const parsed = EnvSchema.parse(process.env);

// There is no service account any more: every upstream call is made with the
// signed-in client's own token. UPSTREAM_SERVICE_* are accepted but unused.
const REQUIRED_UNLESS_SEED = ['UPSTREAM_API_BASE_URL', 'UPSTREAM_DATA_REST_URL'] as const;

if (parsed.APP_DATA_MODE !== 'seed') {
  const missing = REQUIRED_UNLESS_SEED.filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them in backend/.env (or the deployment's environment) — see .env.example.`
    );
  }
}

if (parsed.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (parsed.APP_DATA_MODE === 'seed') problems.push('APP_DATA_MODE=seed (demo users) is not allowed');
  if (parsed.JWT_LOCAL_SIGNING_SECRET === DEFAULT_JWT_SECRET || parsed.JWT_LOCAL_SIGNING_SECRET.length < 32) {
    problems.push('JWT_LOCAL_SIGNING_SECRET must be set to a random value of at least 32 characters');
  }
  if (parsed.CORS_ORIGIN.split(',').some((o) => o.trim() === '*')) {
    problems.push('CORS_ORIGIN must list explicit origins, not "*"');
  }
  if (!parsed.SESSION_ENCRYPTION_KEY) problems.push('SESSION_ENCRYPTION_KEY is required (stored sessions drive scheduled sync)');
  if (problems.length > 0) {
    throw new Error(`Insecure production configuration:\n - ${problems.join('\n - ')}`);
  }
}

/** With APP_DATA_MODE other than "seed", the upstream settings above are guaranteed present. */
export type AppConfig = Omit<z.infer<typeof EnvSchema>, 'UPSTREAM_API_BASE_URL' | 'UPSTREAM_DATA_REST_URL'> & {
  UPSTREAM_API_BASE_URL: string;
  UPSTREAM_DATA_REST_URL: string;
};

export const config = parsed as AppConfig;
